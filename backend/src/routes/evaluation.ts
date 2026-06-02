    import { Router } from 'express';
    import { pool } from '../utils/db';
    import { authenticateToken, AuthRequest } from '../middleware/auth';
    
    const router = Router();
    router.use(authenticateToken);
    
    // GET /api/:battletag/evaluations
    router.get('/:battletag/evaluations', async (req: AuthRequest, res) => {

        let battletag = decodeURIComponent(req.params.battletag as string);
        if (!battletag) return res.status(400).json({ error: '缺少 battletag 参数' });
        try {
            const [userRows] = await pool.query<any[]>('SELECT id FROM users WHERE battletag = ?', [battletag]);
            if (userRows.length === 0) return res.status(404).json({ error: '用户不存在' });
            const targetUserId = userRows[0].id;
            const [ratingRows] = await pool.query<any[]>(
                `SELECT u.battletag AS ID, r.content AS evaluation
                 FROM ratings r JOIN users u ON r.from_user_id = u.id
                 WHERE r.to_user_id = ? ORDER BY r.created_at ASC`,
                [targetUserId]
            );
            res.json(ratingRows);
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: '获取评价信息失败' });
        }
    });
    
    // PUT /api/:battletag/evaluation
    router.put('/:battletag/evaluation', async (req: AuthRequest, res) => {
        const currentUserId = req.user?.userId;
        const currentUserTag = req.user?.battletag;
        if (!currentUserId || !currentUserTag) return res.status(401).json({ error: '未授权' });
    
        // 修复：添加 as string 类型断言
        let targetTag = decodeURIComponent(req.params.battletag as string);
        if (!targetTag) return res.status(400).json({ error: '缺少 battletag 参数' });
        const { evaluation } = req.body;
        if (typeof evaluation !== 'string') return res.status(400).json({ error: '缺少 evaluation 字段或类型错误' });
        if (evaluation.length > 32) return res.status(400).json({ error: '评价内容不能超过32个字符' });
    
        const [targetRows] = await pool.query<any[]>('SELECT id FROM users WHERE battletag = ?', [targetTag]);
        if (targetRows.length === 0) return res.status(404).json({ error: '目标用户不存在' });
        const targetUserId = targetRows[0].id;
        const trimmed = evaluation.trim();
    
        try {
            if (trimmed === '') {
                const [result] = await pool.query<any>('DELETE FROM ratings WHERE from_user_id = ? AND to_user_id = ?', [currentUserId, targetUserId]);
                if (result.affectedRows === 0) return res.status(404).json({ error: '没有找到可删除的评价' });
                res.json({ message: '评价删除成功' });
            } else {
                await pool.query(
                    `INSERT INTO ratings (from_user_id, to_user_id, content, updated_at)
                     VALUES (?, ?, ?, NOW())
                     ON DUPLICATE KEY UPDATE content = VALUES(content), updated_at = NOW()`,
                    [currentUserId, targetUserId, trimmed]
                );
                res.json({ message: '评价提交成功' });
            }
        } catch (error) {
            console.error('评价操作失败:', error);
            res.status(500).json({ error: '评价操作失败，请稍后重试' });
        }
    });
    
    export default router;