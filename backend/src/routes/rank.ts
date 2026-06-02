import { Router } from 'express';
import { pool } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

router.put('/rank', async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: '未授权' });
    const allowedFields = ['rank_open_6v6', 'rank_tank_5v5', 'rank_dps_5v5', 'rank_support_5v5'];
    const updates: any = {};
    let hasUpdate = false;
    for (const field of allowedFields) {
        if (req.body.hasOwnProperty(field)) {
            const value = req.body[field];
            if (value !== null && (typeof value !== 'object' || !value.rank || typeof value.level !== 'number')) {
                return res.status(400).json({ error: `${field} 格式错误，应为 { rank: string, level: number } 或 null` });
            }
            updates[field] = value;
            hasUpdate = true;
        }
    }
    if (!hasUpdate) return res.status(400).json({ error: '未提供任何段位字段' });
    try {
        const setClauses: string[] = [];
        const values: any[] = [];
        for (const field of allowedFields) {
            if (updates.hasOwnProperty(field)) {
                setClauses.push(`${field} = ?`);
                values.push(updates[field] === null ? null : JSON.stringify(updates[field]));
            }
        }
        values.push(userId);
        await pool.query(`UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`, values);
        res.json({ message: '段位信息更新成功' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误，请稍后重试' });
    }
});

export default router;