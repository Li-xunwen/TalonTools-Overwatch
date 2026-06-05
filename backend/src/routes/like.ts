import { Router } from 'express';
import { pool, userEventLogger } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

// GET /api/:battletag/likelist
router.get('/:battletag/likelist', async (req: AuthRequest, res) => {
    let battletag = decodeURIComponent(req.params.battletag as string);
    if (!battletag) return res.status(400).json({ error: '缺少 battletag 参数' });
    try {
        const [userRows] = await pool.query<any[]>('SELECT id FROM users WHERE battletag = ?', [battletag]);
        if (userRows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const targetUserId = userRows[0].id;

        const [likeRows] = await pool.query<any[]>(
            `SELECT u.battletag AS ID, l.like_count AS \`Like\`, l.updated_at 
             FROM likes l JOIN users u ON l.from_user_id = u.id
             WHERE l.to_user_id = ? ORDER BY l.like_count DESC`,
            [targetUserId]
        );
        res.json(likeRows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '获取点赞信息失败' });
    }
});

router.post('/:battletag/like', async (req: AuthRequest, res) => {
    const currentUserId = req.user?.userId;
    const currentUserTag = req.user?.battletag;
    if (!currentUserId || !currentUserTag) return res.status(401).json({ error: '未授权' });

    const rawBattleTag = req.params.battletag;
    if (Array.isArray(rawBattleTag)) {
        return res.status(400).json({ error: '无效的参数格式' });
    }

    let targetTag = decodeURIComponent(rawBattleTag);

    if (!targetTag) return res.status(400).json({ error: '缺少 battletag 参数' });
    if (targetTag === currentUserTag) return res.status(400).json({ error: '不能给自己点赞' });

    // 获取目标用户 ID
    const [targetRows] = await pool.query<any[]>('SELECT id FROM users WHERE battletag = ?', [targetTag]);
    if (targetRows.length === 0) return res.status(404).json({ error: '目标用户不存在' });
    const targetUserId = targetRows[0].id;

    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // 1. 锁定行并获取当前状态
        let [rows]: [any, any] = await connection.query(
            'SELECT id, like_count, updated_at FROM likes WHERE from_user_id = ? AND to_user_id = ? FOR UPDATE',
            [currentUserId, targetUserId]
        );

        let recordId: number;
        let currentLikeCount: number = 0;
        let currentUpdatedAt: Date | null = null;

        if (rows.length === 0) {
            // 初始化：如果是第一次点赞，插入记录
            const now = new Date();
            now.setSeconds(0, 0); // 初始秒数为 0
            await connection.query(
                `INSERT INTO likes (from_user_id, to_user_id, like_count, updated_at) VALUES (?, ?, 0, ?)`,
                [currentUserId, targetUserId, now]
            );

            // 重新查询以获取刚插入的 ID
            [rows] = await connection.query(
                'SELECT id, like_count, updated_at FROM likes WHERE from_user_id = ? AND to_user_id = ?',
                [currentUserId, targetUserId]
            );
            recordId = rows[0].id;
            currentLikeCount = rows[0].like_count;
            currentUpdatedAt = new Date(rows[0].updated_at);
        } else {
            recordId = rows[0].id;
            currentLikeCount = rows[0].like_count;
            currentUpdatedAt = new Date(rows[0].updated_at);
        }

        // 2. 计算今日点赞次数 (在应用层判断，用于上限检查)
        const nowDate = new Date();
        const isToday = currentUpdatedAt && currentUpdatedAt.toDateString() === nowDate.toDateString();
        const todayCount = isToday ? currentUpdatedAt.getSeconds() : 0;

        // 3. 检查上限
        if (todayCount >= 20) {
            await connection.rollback();
            connection.release();
            return res.status(429).json({ 
                error: `今日已对 ${targetTag} 点赞 ${todayCount} 次，已达上限（20次/天）` 
            });
        }

        const updateSql = `
            UPDATE likes 
            SET 
                like_count = like_count + 1,
                updated_at = STR_TO_DATE(
                    CONCAT(
                        DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:'), 
                        LPAD(
                            CASE 
                                WHEN DATE(updated_at) = CURDATE() THEN SECOND(updated_at) + 1 
                                ELSE 1 
                            END, 
                        2, '0')
                    ), 
                '%Y-%m-%d %H:%i:%s')
            WHERE id = ?
        `;
        
        await connection.query(updateSql, [recordId]);

        // 5. 获取更新后的最终状态用于返回
        const [finalRows]: [any, any] = await connection.query(
            'SELECT like_count, updated_at FROM likes WHERE id = ?',
            [recordId]
        );
        
        const finalUpdatedAt = new Date(finalRows[0].updated_at);
        const finalTodayCount = finalUpdatedAt.getSeconds();
        const finalTotalCount = finalRows[0].like_count;

        await connection.commit();
        connection.release();

        // 6. 记录日志
        userEventLogger.logEvent({
            userId: currentUserId,
            eventType: 'like',
            targetUserId: targetUserId,
            eventData: { content: `今日对 ${targetTag} 点赞 ${finalTodayCount} 次` }
        });

        // 7. 返回结果
        res.json({ 
            message: '点赞成功', 
            totalLikes: finalTotalCount,      // 历史总赞数
            todayLikes: finalTodayCount,      // 今日赞数
            newUpdatedAt: finalUpdatedAt      // 更新时间对象
        });

    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('点赞失败:', error);
        res.status(500).json({ error: '点赞失败，请稍后重试' });
    }
});

export default router;