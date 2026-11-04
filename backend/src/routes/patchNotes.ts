import { Router, Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

const router = Router();
const PATCH_ROOT = path.join(__dirname, '../../public/patch-notes');
const KINDS = ['small', 'big'] as const;

type PatchKind = typeof KINDS[number];

function normalizeKind(raw: unknown): PatchKind | null {
    const kind = String(raw ?? '').toLowerCase();
    return KINDS.includes(kind as PatchKind) ? kind as PatchKind : null;
}

function isMd5Png(name: string): boolean {
    return /^[a-f0-9]{32}\.png$/i.test(name);
}

/* =========================
   补丁图列表（公开）
========================= */

router.get('/list', async (req: Request, res: Response) => {
    const kind = normalizeKind(req.query.patch_kind);
    if (!kind) return res.status(400).json({ error: 'patch_kind 必须是 small 或 big' });

    try {
        const dir = path.join(PATCH_ROOT, kind);
        let entries: string[] = [];
        try {
            entries = await fs.readdir(dir);
        } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
        }

        const items = await Promise.all(
            entries
                .filter(isMd5Png)
                .map(async (name) => {
                    const stat = await fs.stat(path.join(dir, name));
                    const md5 = name.replace(/\.png$/i, '').toLowerCase();
                    let sidecar: any = null;
                    try {
                        sidecar = JSON.parse(await fs.readFile(path.join(dir, `${md5}.json`), 'utf8'));
                    } catch {
                        // 旧文件没有侧车元数据时按保存时间展示
                    }
                    return {
                        kind,
                        md5,
                        url: `/api/patch-notes/file/${kind}/${md5}.png`,
                        fetchedAt: stat.mtime.toISOString(),
                        bytes: stat.size,
                        patchDate: typeof sidecar?.patchDate === 'string' ? sidecar.patchDate : null,
                        dateText: sidecar?.dateText || '',
                        title: sidecar?.title || '',
                        sourceName: sidecar?.sourceName || ''
                    };
                })
        );

        items.sort((a, b) => {
            const byPatchDate = Date.parse(b.patchDate || b.fetchedAt) - Date.parse(a.patchDate || a.fetchedAt);
            return byPatchDate || Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt);
        });
        res.json({ patch_kind: kind, items });
    } catch (error) {
        console.error('[patch-notes] 读取列表失败:', error);
        res.status(500).json({ error: '读取补丁图列表失败' });
    }
});

/* =========================
   补丁图文件（公开，MD5 文件名不会变化）
========================= */

router.get('/file/:kind/:file', (req: Request, res: Response) => {
    const kind = normalizeKind(req.params.kind);
    const file = String(req.params.file ?? '').toLowerCase();
    if (!kind || !isMd5Png(file)) return res.status(404).end();

    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file, { root: path.join(PATCH_ROOT, kind) }, (error) => {
        if (error && !res.headersSent) res.status(404).end();
    });
});

export { PATCH_ROOT, normalizeKind };
export default router;
