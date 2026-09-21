import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { pool } from '../utils/db';

/* =========================
   目录与常量
========================= */

const PUBLIC_DIR = path.join(__dirname, '../../public');
export const USERS_DIR = path.join(PUBLIC_DIR, 'users');

// 分片上传与「解析中」临时文件都放在 _pending 下（不在静态目录里，外部访问不到）
export const PENDING_DIR = path.join(PUBLIC_DIR, '_pending');
const CHUNKS_DIR = path.join(PENDING_DIR, 'chunks');
const STAGING_DIR = path.join(PENDING_DIR, 'staging');

// 分片大小：4MB
export const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

// 上传会话超时（小时）：超时后分片自动删除
const UPLOAD_TTL_HOURS = Number(process.env.FILE_UPLOAD_TTL_HOURS ?? 12);

// 同时计算 md5 的文件数
const HASH_CONCURRENCY = 2;

// 巡检间隔
const SWEEP_INTERVAL_MS = 10 * 60 * 1000;

export type FileType = 'image' | 'video' | 'other';
export type FileStatus = 'parsing' | 'ready' | 'failed';

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.avif', '.ico'];
const VIDEO_EXTS = ['.mp4', '.webm', '.ogv', '.mov', '.avi', '.mkv', '.m4v'];

export interface UserFileRow {
    id: number;
    userId: number;
    name: string;
    ext: string;
    mime: string;
    size: number;
    md5: string;
    storage: string;
    status: FileStatus;
    legacyNames: string[];
    createdAt: number;
}

export interface UploadSessionRow {
    id: string;
    userId: number;
    name: string;
    ext: string;
    mime: string;
    size: number;
    chunkSize: number;
    totalChunks: number;
}

/* =========================
   基础工具
========================= */

export function fileTypeOf(ext: string): FileType {
    const lower = ext.toLowerCase();
    if (IMAGE_EXTS.includes(lower)) return 'image';
    if (VIDEO_EXTS.includes(lower)) return 'video';
    return 'other';
}

export function normalizeExt(nameOrExt: string): string {
    const raw = String(nameOrExt ?? '').trim();
    if (!raw) return '';

    const lower = raw.toLowerCase();
    // 传的是完整文件名（'a.txt'）或带点的扩展名（'.txt'）时取扩展名
    if (lower.includes('.')) {
        const ext = lower.startsWith('.') && lower.indexOf('.', 1) === -1 ? lower : path.extname(lower);
        return ext ? ext.slice(0, 15) : '';
    }

    // 纯字母数字的短串（如 'txt'）视为扩展名，其余（如 '图片1'）视为没有扩展名
    return /^[a-z0-9]{1,5}$/.test(lower) ? `.${lower}` : '';
}

// 显示名默认前缀：图片 / 视频 / 文件
function defaultNamePrefix(ext: string): string {
    const type = fileTypeOf(ext);
    if (type === 'image') return '图片';
    if (type === 'video') return '视频';
    return '文件';
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function userDirOf(userId: number): string {
    return path.join(USERS_DIR, String(userId));
}

function chunkDirOf(uploadId: string): string {
    return path.join(CHUNKS_DIR, uploadId);
}

// 只允许访问用户自己目录下的普通文件名
function safeStorageName(storage: string): string {
    const base = path.basename(storage);
    return base === storage && base !== '.' && base !== '..' ? base : '';
}

function parseLegacyNames(raw: unknown): string[] {
    if (typeof raw !== 'string' || !raw) return [];
    try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
    } catch {
        return [];
    }
}

function mapRow(row: any): UserFileRow {
    return {
        id: Number(row.id),
        userId: Number(row.user_id),
        name: String(row.name ?? ''),
        ext: String(row.ext ?? ''),
        mime: String(row.mime ?? ''),
        size: Number(row.size ?? 0),
        md5: String(row.md5 ?? ''),
        storage: String(row.storage ?? ''),
        status: (row.status ?? 'parsing') as FileStatus,
        legacyNames: parseLegacyNames(row.legacy_names),
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    };
}

/* =========================
   查询
========================= */

export async function listUserFiles(userId: number): Promise<UserFileRow[]> {
    const [rows] = await pool.query<any[]>(
        `SELECT * FROM user_files WHERE user_id = ? ORDER BY created_at DESC, id DESC`,
        [userId]
    );
    return rows.map(mapRow);
}

export async function getUserFile(userId: number, name: string): Promise<UserFileRow | null> {
    const [rows] = await pool.query<any[]>(
        `SELECT * FROM user_files WHERE user_id = ? AND name = ? LIMIT 1`,
        [userId, name]
    );
    return rows.length ? mapRow(rows[0]) : null;
}

export async function getUserFileById(fileId: number): Promise<UserFileRow | null> {
    const [rows] = await pool.query<any[]>(`SELECT * FROM user_files WHERE id = ? LIMIT 1`, [fileId]);
    return rows.length ? mapRow(rows[0]) : null;
}

// 旧链接兼容：按显示名或历史名找到物理文件
export async function resolveFileForLegacyUrl(
    userId: number,
    name: string
): Promise<{ storage: string; size: number } | null> {
    const [rows] = await pool.query<any[]>(
        `SELECT * FROM user_files WHERE user_id = ? AND status = 'ready'`,
        [userId]
    );

    for (const raw of rows) {
        const row = mapRow(raw);
        if (row.name !== name && !row.legacyNames.includes(name)) continue;
        if (!row.storage) continue;

        const fullPath = path.join(userDirOf(userId), safeStorageName(row.storage));
        if (!fs.existsSync(fullPath)) continue;
        return { storage: safeStorageName(row.storage), size: row.size };
    }

    return null;
}

/* =========================
   默认命名（图片1 / 视频1 / 文件1）
========================= */

export async function allocateDefaultName(userId: number, ext: string): Promise<string> {
    const prefix = defaultNamePrefix(ext);
    const [rows] = await pool.query<any[]>(`SELECT name FROM user_files WHERE user_id = ?`, [userId]);

    let max = 0;
    for (const row of rows) {
        const matched = new RegExp(`^${prefix}(\\d+)$`).exec(String(row.name ?? ''));
        if (matched) max = Math.max(max, Number(matched[1]));
    }
    return `${prefix}${max + 1}`;
}

/* =========================
   条目创建 / 修改 / 删除
========================= */

// 落一条「解析中」记录：storage 暂时指向待计算 md5 的临时文件
export async function createParsingFile(params: {
    userId: number;
    name: string;
    ext: string;
    mime: string;
    size: number;
    stagingPath: string;
}): Promise<UserFileRow> {
    const stagingRelative = path
        .relative(PUBLIC_DIR, params.stagingPath)
        .split(path.sep)
        .join('/');

    let name = params.name;
    for (let attempt = 0; attempt < 20; attempt++) {
        try {
            const [result] = await pool.query<any>(
                `INSERT INTO user_files (user_id, name, ext, mime, size, md5, storage, status, legacy_names)
                 VALUES (?, ?, ?, ?, ?, '', ?, 'parsing', NULL)`,
                [params.userId, name, params.ext, params.mime, params.size, stagingRelative]
            );
            const created = await getUserFileById(Number(result.insertId));
            if (created) return created;
            break;
        } catch (error: any) {
            // 名字被占用：换一个默认名重试
            if (error?.code !== 'ER_DUP_ENTRY') throw error;
            name = await allocateDefaultName(params.userId, params.ext);
        }
    }

    throw new Error('创建文件记录失败');
}

export async function updateFileReady(
    fileId: number,
    data: { md5: string; storage: string; size: number }
): Promise<void> {
    await pool.query(
        `UPDATE user_files SET md5 = ?, storage = ?, size = ?, status = 'ready' WHERE id = ?`,
        [data.md5, data.storage, data.size, fileId]
    );
}

export async function markFileFailed(fileId: number): Promise<void> {
    await pool.query(`UPDATE user_files SET status = 'failed' WHERE id = ?`, [fileId]);
}

export async function renameUserFile(
    userId: number,
    oldName: string,
    newName: string
): Promise<{ ok: boolean; message?: string; file?: UserFileRow }> {
    const existing = await getUserFile(userId, oldName);
    if (!existing) return { ok: false, message: '原文件不存在' };
    if (oldName === newName) return { ok: true, file: existing };

    const occupied = await getUserFile(userId, newName);
    if (occupied) return { ok: false, message: '新文件名已存在' };

    // 旧名字进 legacy_names，保证文章里的旧链接仍然可用
    const legacy = Array.from(new Set([...existing.legacyNames, oldName]));
    await pool.query(`UPDATE user_files SET name = ?, legacy_names = ? WHERE id = ?`, [
        newName,
        JSON.stringify(legacy),
        existing.id
    ]);

    return { ok: true, file: (await getUserFileById(existing.id)) ?? undefined };
}

export async function deleteUserFile(
    userId: number,
    name: string
): Promise<{ ok: boolean; message?: string; file?: UserFileRow }> {
    const existing = await getUserFile(userId, name);
    if (!existing) return { ok: false, message: '文件不存在' };

    await pool.query(`DELETE FROM user_files WHERE id = ?`, [existing.id]);

    // 还有别的条目引用同一份物理文件（同内容去重）时不删盘
    const [rows] = await pool.query<any[]>(
        `SELECT COUNT(*) AS n FROM user_files WHERE user_id = ? AND storage = ?`,
        [userId, existing.storage]
    );
    const stillUsed = Number(rows[0]?.n ?? 0) > 0;

    if (!stillUsed && existing.storage) {
        if (existing.status === 'parsing') {
            // 解析中的记录：storage 是 _pending 下的临时文件
            const staging = path.join(PUBLIC_DIR, existing.storage);
            try {
                if (fs.existsSync(staging)) fs.unlinkSync(staging);
            } catch (error) {
                console.error('[文件库] 删除临时文件失败:', error);
            }
        } else {
            const fullPath = path.join(userDirOf(userId), safeStorageName(existing.storage));
            try {
                if (safeStorageName(existing.storage) && fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
            } catch (error) {
                console.error('[文件库] 删除物理文件失败:', error);
            }
        }
    }

    return { ok: true, file: existing };
}

/* =========================
   md5：流式计算 + 落盘改名
========================= */

const hashQueue: number[] = [];
let hashRunning = 0;

export function enqueueFileHash(fileId: number): void {
    if (!hashQueue.includes(fileId)) hashQueue.push(fileId);
    pumpHashQueue();
}

function pumpHashQueue(): void {
    while (hashRunning < HASH_CONCURRENCY && hashQueue.length > 0) {
        const fileId = hashQueue.shift()!;
        hashRunning++;
        void finalizeFile(fileId)
            .catch((error) => console.error('[文件库] 计算 md5 失败:', error))
            .finally(() => {
                hashRunning--;
                pumpHashQueue();
            });
    }
}

function md5OfFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash('md5');
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve(hash.digest('hex')));
    });
}

// 计算 md5 → 把临时文件改名为 {md5}{ext} → 置为 ready
async function finalizeFile(fileId: number): Promise<void> {
    const file = await getUserFileById(fileId);
    if (!file || file.status !== 'parsing') return;

    const stagingRelative = file.storage;
    if (!stagingRelative) {
        await markFileFailed(fileId);
        return;
    }

    const stagingPath = path.join(PUBLIC_DIR, stagingRelative);
    if (!fs.existsSync(stagingPath)) {
        await markFileFailed(fileId);
        return;
    }

    try {
        const md5 = await md5OfFile(stagingPath);
        const size = fs.statSync(stagingPath).size;
        const storage = `${md5}${file.ext}`;
        const userDir = userDirOf(file.userId);
        ensureDir(userDir);

        const target = path.join(userDir, storage);
        if (fs.existsSync(target)) {
            // 同一用户已经有一份相同内容的文件：直接复用，删掉临时文件
            fs.unlinkSync(stagingPath);
        } else {
            fs.renameSync(stagingPath, target);
        }

        await updateFileReady(fileId, { md5, storage, size });
    } catch (error) {
        console.error('[文件库] 文件落盘失败:', error);
        await markFileFailed(fileId);
    }
}

/* =========================
   分片上传会话（断点续传）
========================= */

export async function createUploadSession(params: {
    userId: number;
    name: string;
    ext: string;
    mime: string;
    size: number;
    totalChunks: number;
    chunkSize: number;
}): Promise<UploadSessionRow> {
    const uploadId = crypto.randomUUID();
    await pool.query(
        `INSERT INTO file_upload_sessions (id, user_id, name, ext, mime, size, chunk_size, total_chunks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            uploadId,
            params.userId,
            params.name,
            params.ext,
            params.mime,
            params.size,
            params.chunkSize,
            params.totalChunks
        ]
    );
    ensureDir(chunkDirOf(uploadId));

    return {
        id: uploadId,
        userId: params.userId,
        name: params.name,
        ext: params.ext,
        mime: params.mime,
        size: params.size,
        chunkSize: params.chunkSize,
        totalChunks: params.totalChunks
    };
}

export async function getUploadSession(
    userId: number,
    uploadId: string
): Promise<UploadSessionRow | null> {
    const [rows] = await pool.query<any[]>(
        `SELECT * FROM file_upload_sessions WHERE id = ? AND user_id = ? LIMIT 1`,
        [uploadId, userId]
    );
    if (!rows.length) return null;

    const row = rows[0];
    return {
        id: String(row.id),
        userId: Number(row.user_id),
        name: String(row.name ?? ''),
        ext: String(row.ext ?? ''),
        mime: String(row.mime ?? ''),
        size: Number(row.size ?? 0),
        chunkSize: Number(row.chunk_size ?? UPLOAD_CHUNK_SIZE),
        totalChunks: Number(row.total_chunks ?? 0)
    };
}

// 已收到哪些分片：直接看目录，不需要写库
export function listReceivedChunks(uploadId: string): number[] {
    const dir = chunkDirOf(uploadId);
    if (!fs.existsSync(dir)) return [];

    return fs
        .readdirSync(dir)
        .map((name) => /^(\d+)\.part$/.exec(name))
        .filter((matched): matched is RegExpExecArray => !!matched)
        .map((matched) => Number(matched[1]))
        .sort((a, b) => a - b);
}

export function saveChunk(uploadId: string, index: number, buffer: Buffer): void {
    const dir = chunkDirOf(uploadId);
    ensureDir(dir);
    fs.writeFileSync(path.join(dir, `${index}.part`), buffer);
    // 触达会话的 updated_at，避免正在上传的会话被巡检清掉
    void pool
        .query(`UPDATE file_upload_sessions SET updated_at = NOW() WHERE id = ?`, [uploadId])
        .catch((error) => console.error('[文件库] 更新上传会话时间失败:', error));
}

// 合并分片 → 落库（解析中）→ 交给后台算 md5
export async function completeUploadSession(
    userId: number,
    uploadId: string
): Promise<{ ok: boolean; message?: string; file?: UserFileRow; missing?: number[] }> {
    const session = await getUploadSession(userId, uploadId);
    if (!session) return { ok: false, message: '上传会话不存在或已过期' };

    const received = listReceivedChunks(uploadId);
    const missing: number[] = [];
    for (let i = 0; i < session.totalChunks; i++) {
        if (!received.includes(i)) missing.push(i);
    }
    if (missing.length) return { ok: false, message: '分片不完整', missing };

    ensureDir(STAGING_DIR);
    const stagingPath = path.join(STAGING_DIR, `${uploadId}${session.ext}`);
    const out = fs.createWriteStream(stagingPath);

    try {
        for (let i = 0; i < session.totalChunks; i++) {
            await pipeline(fs.createReadStream(path.join(chunkDirOf(uploadId), `${i}.part`)), out, {
                end: false
            });
        }
        await new Promise<void>((resolve, reject) => {
            out.end(() => resolve());
            out.on('error', reject);
        });
    } catch (error) {
        console.error('[文件库] 合并分片失败:', error);
        try {
            if (fs.existsSync(stagingPath)) fs.unlinkSync(stagingPath);
        } catch {
            /* 忽略 */
        }
        return { ok: false, message: '合并分片失败' };
    }

    // 名字可能在上传期间被占用，这里再分配一次
    const name = session.name || (await allocateDefaultName(userId, session.ext));
    const file = await createParsingFile({
        userId,
        name,
        ext: session.ext,
        mime: session.mime,
        size: session.size || fs.statSync(stagingPath).size,
        stagingPath
    });

    await cancelUploadSession(userId, uploadId);
    enqueueFileHash(file.id);

    return { ok: true, file };
}

export async function cancelUploadSession(userId: number, uploadId: string): Promise<void> {
    await pool.query(`DELETE FROM file_upload_sessions WHERE id = ? AND user_id = ?`, [
        uploadId,
        userId
    ]);

    const dir = chunkDirOf(uploadId);
    try {
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    } catch (error) {
        console.error('[文件库] 清理分片失败:', error);
    }
}

// 一次性上传（脚本 / 旧调用）：内部走「单个分片」的同一套流程
export async function uploadWholeFile(params: {
    userId: number;
    originalName: string;
    mime: string;
    buffer: Buffer;
}): Promise<UserFileRow> {
    const ext = normalizeExt(params.originalName);
    const name = await allocateDefaultName(params.userId, ext);
    const session = await createUploadSession({
        userId: params.userId,
        name,
        ext,
        mime: params.mime,
        size: params.buffer.length,
        totalChunks: 1,
        chunkSize: params.buffer.length
    });

    saveChunk(session.id, 0, params.buffer);
    const result = await completeUploadSession(params.userId, session.id);
    if (!result.ok || !result.file) throw new Error(result.message ?? '上传失败');
    return result.file;
}

/* =========================
   定时巡检：清理中断的上传（含后台重启后的解析恢复）
========================= */

let sweepTimer: NodeJS.Timeout | null = null;

export function startFileLibraryTasks(): void {
    ensureDir(USERS_DIR);
    ensureDir(CHUNKS_DIR);
    ensureDir(STAGING_DIR);

    // 服务重启后，把还停在「解析中」的记录重新排队
    void pool
        .query<any[]>(`SELECT id FROM user_files WHERE status = 'parsing'`)
        .then(([rows]) => rows.forEach((row) => enqueueFileHash(Number(row.id))))
        .catch((error) => console.error('[文件库] 恢复解析队列失败:', error));

    if (sweepTimer) return;
    sweepTimer = setInterval(() => void sweepInterruptedUploads(), SWEEP_INTERVAL_MS);
    void sweepInterruptedUploads();
}

// 超过 TTL 没更新的上传会话：连分片一起删掉
export async function sweepInterruptedUploads(): Promise<number> {
    let removed = 0;
    try {
        const [rows] = await pool.query<any[]>(
            `SELECT id FROM file_upload_sessions WHERE updated_at < DATE_SUB(NOW(), INTERVAL ? HOUR)`,
            [UPLOAD_TTL_HOURS]
        );

        for (const row of rows) {
            const uploadId = String(row.id);
            await pool.query(`DELETE FROM file_upload_sessions WHERE id = ?`, [uploadId]);
            try {
                const dir = chunkDirOf(uploadId);
                if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
            } catch (error) {
                console.error('[文件库] 清理超时上传失败:', error);
            }
            removed++;
        }

        // 分片目录里没有对应会话的孤儿目录（进程被杀、事务失败等）
        if (fs.existsSync(CHUNKS_DIR)) {
            ensureDir(CHUNKS_DIR);
            const [sessions] = await pool.query<any[]>(`SELECT id FROM file_upload_sessions`);
            const alive = new Set(sessions.map((row) => String(row.id)));
            for (const entry of fs.readdirSync(CHUNKS_DIR, { withFileTypes: true })) {
                if (!entry.isDirectory() || alive.has(entry.name)) continue;
                const dir = path.join(CHUNKS_DIR, entry.name);
                const stat = fs.statSync(dir);
                if (Date.now() - stat.mtimeMs < UPLOAD_TTL_HOURS * 3600 * 1000) continue;
                fs.rmSync(dir, { recursive: true, force: true });
                removed++;
            }
        }
    } catch (error) {
        console.error('[文件库] 巡检上传会话失败:', error);
    }
    return removed;
}

export function physicalPathOf(userId: number, storage: string): string {
    return path.join(userDirOf(userId), safeStorageName(storage));
}

export function userDirPathOf(userId: number): string {
    return userDirOf(userId);
}
