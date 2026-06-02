// backend/src/routes/admin.ts
import { Router } from 'express';
import { pool } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// 所有管理接口都需要认证，并且角色为 ADMIN 或 MODERATOR
router.use(authenticateToken);

/**
 * GET /api/admin/events
 * 功能：获取用户事件日志（仅限管理员）
 * 请求参数（query）：
 *   - eventType?: 事件类型（可选，可多次传入）
 *   - limit?: number (默认50)
 *   - offset?: number (默认0)
 *   - startTime?: ISO日期字符串
 *   - endTime?: ISO日期字符串
 * 返回：{ events: EventLog[], total: number }
 */
router.get('/events', async (req: AuthRequest, res) => {
    const currentUserId = req.user?.userId;
    if (!currentUserId) return res.status(401).json({ error: '未授权' });

    // 检查当前用户角色
    const [rows] = await pool.query<any[]>(
        'SELECT role FROM users WHERE id = ?',
        [currentUserId]
    );
    if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });
    const role = rows[0].role;
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
        return res.status(403).json({ error: '权限不足，仅管理员可查看日志' });
    }

    // 获取查询参数
    const eventTypes = req.query.eventType ? (Array.isArray(req.query.eventType) ? req.query.eventType : [req.query.eventType]) : undefined;
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;
    const startTime = req.query.startTime ? new Date(req.query.startTime as string) : undefined;
    const endTime = req.query.endTime ? new Date(req.query.endTime as string) : undefined;

    try {
        // 构建查询（同时关联用户和可能的目标用户，以获取战网ID）
        let sql = `
            SELECT 
                e.id,
                e.user_id,
                u.battletag AS user_battletag,
                e.event_type,
                e.event_time,
                e.target_user_id,
                tu.battletag AS target_battletag,
                e.event_data,
                e.ip_address
            FROM user_events e
            LEFT JOIN users u ON e.user_id = u.id
            LEFT JOIN users tu ON e.target_user_id = tu.id
            WHERE 1=1
        `;
        const params: any[] = [];

        if (eventTypes && eventTypes.length > 0) {
            const placeholders = eventTypes.map(() => '?').join(',');
            sql += ` AND e.event_type IN (${placeholders})`;
            params.push(...eventTypes);
        }
        if (startTime) {
            sql += ` AND e.event_time >= ?`;
            params.push(startTime);
        }
        if (endTime) {
            sql += ` AND e.event_time <= ?`;
            params.push(endTime);
        }

        // 获取总数
        const countSql = sql.replace(
            /SELECT e\.id, e\.user_id, u\.battletag AS user_battletag, e\.event_type, e\.event_time, e\.target_user_id, tu\.battletag AS target_battletag, e\.event_data, e\.ip_address/,
            'SELECT COUNT(*) as total'
        );
        const [countRows] = await pool.query<any[]>(countSql, params);
        const total = countRows[0].total;

        // 分页排序
        sql += ` ORDER BY e.event_time DESC LIMIT ? OFFSET ?`;
        params.push(limit, offset);

        const [eventRows] = await pool.query<any[]>(sql, params);

        res.json({
            events: eventRows,
            total,
            limit,
            offset
        });
    } catch (error) {
        console.error('获取事件日志失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

export default router;