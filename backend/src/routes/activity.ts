import { Router } from 'express';
import { pool } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);

function parseEventData(raw: unknown): Record<string, any> {
    if (!raw) return {};
    if (typeof raw === 'object') return raw as Record<string, any>;
    try {
        return JSON.parse(String(raw));
    } catch {
        return {};
    }
}

/* =========================
   当前用户收到的点赞/评价活动
========================= */

router.get('/', async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: '未授权' });

    try {
        const [cursorResult, likesResult, myLikesResult, evaluationsResult] = await Promise.all([
            pool.query<any[]>(
                `SELECT last_like_event_id AS likeCursor,
                        last_evaluation_event_id AS evaluationCursor
                 FROM user_activity_cursors WHERE user_id = ? LIMIT 1`,
                [userId]
            ),
            pool.query<any[]>(
                `SELECT u.battletag AS actor, l.like_count AS likeCount, l.updated_at AS updatedAt
                 FROM likes l JOIN users u ON l.from_user_id = u.id
                 WHERE l.to_user_id = ? ORDER BY l.updated_at DESC`,
                [userId]
            ),
            pool.query<any[]>(
                `SELECT target.battletag AS target,
                        l.like_count AS likeCount, l.updated_at AS updatedAt
                 FROM likes l JOIN users target ON l.to_user_id = target.id
                 WHERE l.from_user_id = ?
                 ORDER BY l.updated_at DESC`,
                [userId]
            ),
            pool.query<any[]>(
                `SELECT target.battletag AS target, actor.battletag AS actor,
                        r.content, r.updated_at AS updatedAt
                 FROM ratings r
                 JOIN users target ON r.to_user_id = target.id
                 JOIN users actor ON r.from_user_id = actor.id
                 WHERE r.from_user_id <> ? AND r.content <> ''
                 ORDER BY r.updated_at DESC
                 LIMIT 500`,
                [userId]
            )
        ]);
        const [cursorRows] = cursorResult;
        const [likes] = likesResult;
        const [myLikes] = myLikesResult;
        const [evaluations] = evaluationsResult;
        const likeCursor = Number(cursorRows[0]?.likeCursor || 0);
        const evaluationCursor = Number(cursorRows[0]?.evaluationCursor || 0);

        const [eventRows] = await pool.query<any[]>(
            `SELECT e.id, e.event_type AS eventType, e.event_time AS eventTime,
                    e.event_data AS eventData,
                    actor.battletag AS actor,
                    target.battletag AS target
             FROM user_events e
             JOIN users actor ON e.user_id = actor.id
             LEFT JOIN users target ON e.target_user_id = target.id
             WHERE (
                 (e.event_type = 'like' AND e.target_user_id = ? AND e.id > ?)
                 OR (e.event_type = 'edit_evaluation' AND e.user_id <> ? AND e.id > ?)
             )
             ORDER BY e.id DESC
             LIMIT 500`,
            [userId, likeCursor, userId, evaluationCursor]
        );

        const unreadMap = new Map<string, {
            card: string;
            latestEventId: number;
            latestEventAt: string;
            hasUnreadLike: boolean;
            hasUnreadEvaluation: boolean;
            evaluationActor: string;
            evaluationContent: string;
            evaluationAt: string;
        }>();

        for (const event of eventRows) {
            const card = event.eventType === 'like'
                ? String(event.actor || '')
                : String(event.target || '');
            if (!card) continue;
            const eventId = Number(event.id);
            const eventAt = new Date(event.eventTime).toISOString();
            const item = unreadMap.get(card) || {
                card,
                latestEventId: 0,
                latestEventAt: '',
                hasUnreadLike: false,
                hasUnreadEvaluation: false,
                evaluationActor: '',
                evaluationContent: '',
                evaluationAt: ''
            };

            if (eventId > item.latestEventId) {
                item.latestEventId = eventId;
                item.latestEventAt = eventAt;
            }
            if (event.eventType === 'like') {
                item.hasUnreadLike = true;
            } else if (event.eventType === 'edit_evaluation') {
                item.hasUnreadEvaluation = true;
                if (!item.evaluationAt || eventAt >= item.evaluationAt) {
                    const data = parseEventData(event.eventData);
                    item.evaluationActor = String(event.actor || '');
                    item.evaluationContent = String(data.content || '');
                    item.evaluationAt = eventAt;
                }
            }
            unreadMap.set(card, item);
        }

        res.json({
            cursor: {
                like: likeCursor,
                evaluation: evaluationCursor
            },
            likes,
            myLikes,
            evaluations,
            unread: [...unreadMap.values()]
        });
    } catch (error) {
        console.error('[activity] 读取失败:', error);
        res.status(500).json({ error: '读取动态更新失败' });
    }
});

/* =========================
   将当前用户点赞/评价游标推进到最新事件
========================= */

router.post('/read', async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: '未授权' });

    try {
        const [rows] = await pool.query<any[]>(
            `SELECT
                (SELECT MAX(id) FROM user_events
                 WHERE event_type = 'like' AND target_user_id = ?) AS likeMax,
                (SELECT MAX(id) FROM user_events
                 WHERE event_type = 'edit_evaluation' AND user_id <> ?) AS evaluationMax`,
            [userId, userId]
        );
        const likeMax = Number(rows[0]?.likeMax || 0);
        const evaluationMax = Number(rows[0]?.evaluationMax || 0);

        await pool.query(
            `INSERT INTO user_activity_cursors
                (user_id, last_like_event_id, last_evaluation_event_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE
               last_like_event_id = GREATEST(last_like_event_id, VALUES(last_like_event_id)),
               last_evaluation_event_id =
                 GREATEST(last_evaluation_event_id, VALUES(last_evaluation_event_id))`,
            [userId, likeMax, evaluationMax]
        );

        res.json({
            cursor: { like: likeMax, evaluation: evaluationMax }
        });
    } catch (error) {
        console.error('[activity] 已读提交失败:', error);
        res.status(500).json({ error: '提交已读记录失败' });
    }
});

export default router;
