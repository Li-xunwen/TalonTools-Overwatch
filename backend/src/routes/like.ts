                import { Router } from 'express';
                import { pool } from '../utils/db';
                import { authenticateToken, AuthRequest } from '../middleware/auth';
                
                const router = Router();
                router.use(authenticateToken);
                
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
                
                    // 注意：这里 query 返回类型也可能涉及 RowDataPacket，建议统一类型处理
                    const [targetRows] = await pool.query<any[]>('SELECT id FROM users WHERE battletag = ?', [targetTag]);
                    if (targetRows.length === 0) return res.status(404).json({ error: '目标用户不存在' });
                    const targetUserId = targetRows[0].id;
                
                    const connection = await pool.getConnection();
                    await connection.beginTransaction();
                
                    try {

                        let [rows]: [any, any] = await connection.query(
                            'SELECT id, like_count, updated_at FROM likes WHERE from_user_id = ? AND to_user_id = ? FOR UPDATE',
                            [currentUserId, targetUserId]
                        );
                        
                        let recordId: number;
                        let currentLikeCount: number;
                        let currentUpdatedAt: Date;
                
                        if (rows.length === 0) {
                            const now = new Date();
                            // 初始化时，updated_at 存储当前时间，秒数部分隐含今日计数逻辑（原业务逻辑保留）
                            now.setSeconds(0, 0); 
                            await connection.query(
                                `INSERT INTO likes (from_user_id, to_user_id, like_count, updated_at) VALUES (?, ?, 0, ?)`,
                                [currentUserId, targetUserId, now]
                            );
                            
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
                
                        const nowDate = new Date();
                        const isToday = currentUpdatedAt.toDateString() === nowDate.toDateString();
                        
                        // 原逻辑：利用 updated_at 的 seconds 字段存储今日点赞次数
                        let todayCount = isToday ? currentUpdatedAt.getSeconds() : 0;
                        
                        if (todayCount >= 20) {
                            await connection.rollback();
                            connection.release();
                            return res.status(429).json({ error: `今日已对 ${targetTag} 点赞 ${todayCount} 次，已达上限（20次/天）` });
                        }
                
                        const actualIncrement = 1;
                        const newLikeCount = currentLikeCount + actualIncrement;
                        const newUpdatedAt = new Date(nowDate);
                        // 更新秒数为新的计数
                        newUpdatedAt.setSeconds(todayCount + actualIncrement);
                        
                        await connection.query(
                            `UPDATE likes SET like_count = ?, updated_at = ? WHERE id = ?`,
                            [newLikeCount, newUpdatedAt, recordId]
                        );
                        
                        await connection.commit();
                        connection.release();
                        
                        res.json({ message: '点赞成功', likeCount: newLikeCount, addedCount: actualIncrement });
                    } catch (error) {
                        await connection.rollback();
                        connection.release();
                        console.error('点赞失败:', error);
                        res.status(500).json({ error: '点赞失败，请稍后重试' });
                    }
                });
                
                export default router;