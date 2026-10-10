/**
 * 服主管理的键值信息（info 表，value 为 JSON）
 *
 *   GET /api/info/:key    公开读取（Game 页等未登录也能展示）
 *   PUT /api/info/:key    仅 ADMIN / MODERATOR 可写入
 *
 * 键名约定：全小写、点分层级，例如 game.donated_servers
 */
import express, { Response, Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool, userEventLogger } from '../utils/db';

const router = Router();

const KEY_MAX = 64;
const VALUE_MAX_BYTES = 1024 * 1024; // 单条信息上限 1MB，够放长列表但不至于塞垃圾

function normalizeKey(raw: unknown): string {
    return String(raw ?? '').trim().toLowerCase().slice(0, KEY_MAX);
}

function parseValue(raw: unknown): unknown {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'object') return raw;
    try {
        return JSON.parse(String(raw));
    } catch {
        return null;
    }
}

/* =========================
   读取（公开）
========================= */

router.get('/:key', async (req, res: Response) => {
    const key = normalizeKey(req.params.key);
    if (!key) return res.status(400).json({ error: '缺少 key' });

    try {
        const [rows] = await pool.query<any[]>(
            'SELECT `key`, `value`, `updated_by`, `update_time` FROM `info` WHERE `key` = ? LIMIT 1',
            [key]
        );
        const row = rows[0];
        if (!row) return res.json({ key, value: null, updatedAt: null });

        res.json({
            key: row.key,
            value: parseValue(row.value),
            updatedBy: row.updated_by ?? null,
            updatedAt: row.update_time ?? null
        });
    } catch (error) {
        console.error('[info] 读取失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

/* =========================
   写入 / 更新（管理员）
========================= */

router.put('/:key', express.json(), authenticateToken, async (req: AuthRequest, res: Response) => {
    const role = String(req.user!.role ?? '');
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
        return res.status(403).json({ error: '只有管理员可以修改这些信息' });
    }

    const key = normalizeKey(req.params.key);
    if (!key) return res.status(400).json({ error: '缺少 key' });

    const value = req.body?.value;
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return res.status(400).json({ error: 'value 必须是 JSON 对象' });
    }

    const serialized = JSON.stringify(value);
    if (Buffer.byteLength(serialized, 'utf8') > VALUE_MAX_BYTES) {
        return res.status(400).json({ error: '内容过大（上限 1MB）' });
    }

    try {
        await pool.query(
            `INSERT INTO \`info\` (\`key\`, \`value\`, \`updated_by\`)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`),
                                     \`updated_by\` = VALUES(\`updated_by\`),
                                     \`update_time\` = CURRENT_TIMESTAMP`,
            [key, serialized, req.user!.userId]
        );

        userEventLogger.logEvent({
            userId: req.user!.userId,
            eventType: 'info_update',
            eventData: { key, bytes: Buffer.byteLength(serialized, 'utf8') },
            ipAddress: req.ip
        });

        res.json({ key, value });
    } catch (error) {
        console.error('[info] 写入失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

export default router;
