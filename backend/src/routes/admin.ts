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

    // 1. 权限检查
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT role FROM users WHERE id = ?',
            [currentUserId]
        );
        if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const role = rows[0].role;
        if (role !== 'ADMIN' && role !== 'MODERATOR') {
            return res.status(403).json({ error: '权限不足，仅管理员可查看日志' });
        }
    } catch (err) {
        console.error('权限检查失败:', err);
        return res.status(500).json({ error: '服务器内部错误' });
    }

    // 2. 参数解析与校验
    let eventTypes: string[] | undefined = undefined;
    if (req.query.eventType) {
        if (Array.isArray(req.query.eventType)) {
            eventTypes = req.query.eventType as string[];
        } else {
            eventTypes = [req.query.eventType as string];
        }
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 50, 1), 200); // 限制最大查询数
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    
    // 安全解析日期
    let startTime: Date | undefined = undefined;
    let endTime: Date | undefined = undefined;
    
    if (req.query.startTime) {
        const d = new Date(req.query.startTime as string);
        if (!isNaN(d.getTime())) startTime = d;
    }
    if (req.query.endTime) {
        const d = new Date(req.query.endTime as string);
        if (!isNaN(d.getTime())) endTime = d;
    }

    try {
        // 3. 构建基础查询条件 (不含 SELECT 和 LIMIT)
        const whereClauses: string[] = [];
        const params: any[] = [];

        if (eventTypes && eventTypes.length > 0) {
            const placeholders = eventTypes.map(() => '?').join(',');
            whereClauses.push(`e.event_type IN (${placeholders})`);
            params.push(...eventTypes);
        }
        if (startTime) {
            whereClauses.push('e.event_time >= ?');
            params.push(startTime);
        }
        if (endTime) {
            whereClauses.push('e.event_time <= ?');
            params.push(endTime);
        }

        const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

        // 4. 分别构建计数查询和数据查询，避免脆弱的 replace 操作
        
        // --- 获取总数 ---
        const countSql = `SELECT COUNT(*) as total FROM user_events e ${whereSql}`;
        const [countRows] = await pool.query<any[]>(countSql, params);
        const total = countRows[0].total;

        // --- 获取数据 ---
        const dataSql = `
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
            ${whereSql}
            ORDER BY e.event_time DESC
            LIMIT ? OFFSET ?
        `;
        
        // 注意：数据查询需要额外添加 limit 和 offset 参数
        const dataParams = [...params, limit, offset];
        const [eventRows] = await pool.query<any[]>(dataSql, dataParams);

        res.json({
            events: eventRows,
            total,
            limit,
            offset
        });
    } catch (error: any) {
        console.error('获取事件日志失败:', error);
        // 返回更详细的错误信息以便调试（生产环境建议隐藏具体错误）
        res.status(500).json({ 
            error: '服务器错误', 
            message: process.env.NODE_ENV === 'development' ? error.message : undefined 
        });
    }
});

export default router;