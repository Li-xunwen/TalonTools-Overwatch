import crypto from 'crypto';
import express, { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { userEventLogger } from '../utils/db';
import {
    PENDING_DIR,
    UPLOAD_CHUNK_SIZE,
    UserFileRow,
    allocateDefaultName,
    cancelUploadSession,
    completeUploadSession,
    createParsingFile,
    createUploadSession,
    deleteUserFile,
    enqueueFileHash,
    fileTypeOf,
    getUploadSession,
    listReceivedChunks,
    listUserFiles,
    normalizeExt,
    renameUserFile,
    resolveUploadName,
    saveChunk
} from '../services/fileLibrary';

const router = Router();

// 文件库条目的对外结构（url 指向 md5 命名的物理文件；解析中还没有物理文件）
function serializeFile(userId: number, row: UserFileRow) {
    return {
        id: row.id,
        name: row.name,
        size: row.size,
        type: fileTypeOf(row.ext),
        ext: row.ext,
        mime: row.mime,
        md5: row.md5,
        status: row.status,
        url:
            row.status === 'ready' && row.storage
                ? `/resource/users/${userId}/${encodeURIComponent(row.storage)}`
                : '',
        mtime: row.createdAt
    };
}

/* =========================
   列表
========================= */

router.get('/files', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const files = await listUserFiles(userId);
        res.json({ files: files.map((row) => serializeFile(userId, row)) });
    } catch (error) {
        console.error('[文件库] 读取列表失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

/* =========================
   分片上传（断点续传）
========================= */

// 创建（或复用）上传会话，返回已收到的分片，前端只补缺失的
router.post(
    '/files/upload/init',
    express.json(),
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;
            const body = req.body as {
                name?: string;
                size?: number;
                ext?: string;
                mime?: string;
                totalChunks?: number;
                chunkSize?: number;
                resumeUploadId?: string;
            };

            const size = Math.max(0, Number(body.size) || 0);
            // 优先用前端传来的扩展名；没有就按原始文件名推导
            const ext = body.ext
                ? normalizeExt(String(body.ext))
                : normalizeExt(String(body.name ?? ''));
            const mime = String(body.mime ?? '');
            const chunkSize =
                Number(body.chunkSize) > 0 ? Math.floor(Number(body.chunkSize)) : UPLOAD_CHUNK_SIZE;
            const totalChunks = Math.max(1, Math.ceil(size / chunkSize));

            // 断点续传：前端带着上次的 uploadId 回来时，直接返回已有分片
            if (body.resumeUploadId) {
                const existing = await getUploadSession(userId, String(body.resumeUploadId));
                if (existing) {
                    return res.json({
                        uploadId: existing.id,
                        name: existing.name,
                        ext: existing.ext,
                        chunkSize: existing.chunkSize,
                        totalChunks: existing.totalChunks,
                        received: listReceivedChunks(existing.id),
                        resumed: true
                    });
                }
            }

            // 命名策略：原始文件名含中文就沿用（见 resolveUploadName），否则用「图片1 / 视频1 / 音频1 / 文件1」
            const name = await resolveUploadName(userId, String(body.name ?? ''), ext);
            const session = await createUploadSession({
                userId,
                name,
                ext,
                mime,
                size,
                totalChunks,
                chunkSize
            });

            res.json({
                uploadId: session.id,
                name: session.name,
                ext: session.ext,
                chunkSize: session.chunkSize,
                totalChunks: session.totalChunks,
                received: [],
                resumed: false
            });
        } catch (error) {
            console.error('[文件库] 创建上传会话失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

// 上传单个分片：4MB 级，放内存再落盘
const chunkUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 32 * 1024 * 1024 }
});

router.post(
    '/files/upload/chunk',
    chunkUpload.single('chunk'),
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;
            const uploadId = String(req.body?.uploadId ?? '');
            const index = Number(req.body?.index);
            const file = req.file;

            if (!uploadId || !Number.isInteger(index) || index < 0) {
                return res.status(400).json({ error: '参数无效' });
            }
            if (!file || !file.buffer?.length) {
                return res.status(400).json({ error: '分片为空' });
            }

            const session = await getUploadSession(userId, uploadId);
            if (!session) return res.status(404).json({ error: '上传会话不存在或已过期' });
            if (index >= session.totalChunks) return res.status(400).json({ error: '分片超出范围' });

            saveChunk(uploadId, index, file.buffer);
            res.json({ ok: true, index, received: listReceivedChunks(uploadId).length });
        } catch (error) {
            console.error('[文件库] 上传分片失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

// 查询会话状态（断点续传时用）
router.get(
    '/files/upload/:uploadId',
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;
            const session = await getUploadSession(userId, String(req.params.uploadId));
            if (!session) return res.status(404).json({ error: '上传会话不存在或已过期' });

            res.json({
                uploadId: session.id,
                name: session.name,
                ext: session.ext,
                chunkSize: session.chunkSize,
                totalChunks: session.totalChunks,
                received: listReceivedChunks(session.id)
            });
        } catch (error) {
            console.error('[文件库] 查询上传会话失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

// 合并分片 → 落库（解析中）→ 后台算 md5
router.post(
    '/files/upload/complete',
    express.json(),
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;
            const uploadId = String((req.body as { uploadId?: string })?.uploadId ?? '');
            if (!uploadId) return res.status(400).json({ error: '缺少 uploadId' });

            const result = await completeUploadSession(userId, uploadId);
            if (!result.ok || !result.file) {
                return res.status(400).json({ error: result.message ?? '上传失败', missing: result.missing });
            }

            userEventLogger.logEvent({
                userId,
                eventType: 'file_upload',
                eventData: { name: result.file.name, size: result.file.size, ext: result.file.ext },
                ipAddress: req.ip
            });

            res.json({ file: serializeFile(userId, result.file) });
        } catch (error) {
            console.error('[文件库] 完成上传失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

// 取消上传：删分片与会话
router.delete(
    '/files/upload/:uploadId',
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            await cancelUploadSession(req.user!.userId, String(req.params.uploadId));
            res.json({ ok: true });
        } catch (error) {
            console.error('[文件库] 取消上传失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

/* =========================
   一次性上传（脚本 / 旧调用）：直接落到 _pending/staging 后走同一套解析流程
========================= */

const stagingUpload = multer({
    storage: multer.diskStorage({
        destination: (_req, _file, cb) => {
            const dir = path.join(PENDING_DIR, 'staging');
            cb(null, dir);
        },
        filename: (_req, _file, cb) => cb(null, `${crypto.randomUUID()}.part`)
    }),
    limits: { fileSize: 500 * 1024 * 1024 }
});

router.post(
    '/files/upload',
    stagingUpload.array('file', 9),
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;
            const incoming = (req.files as Express.Multer.File[]) ?? [];
            if (incoming.length === 0) return res.status(400).json({ error: 'no file' });

            const created: UserFileRow[] = [];
            for (const file of incoming) {
                const ext = normalizeExt(file.originalname);
                const name = await resolveUploadName(userId, file.originalname, ext);
                const row = await createParsingFile({
                    userId,
                    name,
                    ext,
                    mime: file.mimetype ?? '',
                    size: file.size,
                    stagingPath: file.path
                });
                enqueueFileHash(row.id);
                created.push(row);
            }

            userEventLogger.logEvent({
                userId,
                eventType: 'file_upload',
                eventData: { fileCount: created.length, names: created.map((row) => row.name) },
                ipAddress: req.ip
            });

            res.json({
                files: created.map((row) => serializeFile(userId, row)),
                count: created.length
            });
        } catch (error) {
            console.error('[文件库] 一次性上传失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

/* =========================
   重命名 / 删除（改数据库，不动物理文件）
========================= */

router.patch(
    '/files/:name/rename',
    express.json(),
    authenticateToken,
    async (req: AuthRequest, res: Response) => {
        try {
            const userId = req.user!.userId;
            const oldName = String(req.params.name);
            const { newName } = (req.body ?? {}) as { newName?: string };

            const trimmed = String(newName ?? '').trim();
            if (!trimmed) return res.status(400).json({ error: '新文件名不能为空' });
            if (trimmed.length > 120) return res.status(400).json({ error: '文件名过长' });

            const result = await renameUserFile(userId, oldName, trimmed);
            if (!result.ok || !result.file) {
                return res
                    .status(result.message === '新文件名已存在' ? 409 : 404)
                    .json({ error: result.message ?? '重命名失败' });
            }

            userEventLogger.logEvent({
                userId,
                eventType: 'file_rename',
                eventData: { oldName, newName: trimmed },
                ipAddress: req.ip
            });

            res.json(serializeFile(userId, result.file));
        } catch (error) {
            console.error('[文件库] 重命名失败:', error);
            res.status(500).json({ error: 'server error' });
        }
    }
);

router.delete('/files/:name', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const name = String(req.params.name);

        const result = await deleteUserFile(userId, name);
        if (!result.ok) return res.status(404).json({ error: result.message ?? 'not found' });

        userEventLogger.logEvent({
            userId,
            eventType: 'file_delete',
            eventData: { filename: name },
            ipAddress: req.ip
        });

        res.json({ message: 'deleted' });
    } catch (error) {
        console.error('[文件库] 删除失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

export default router;
