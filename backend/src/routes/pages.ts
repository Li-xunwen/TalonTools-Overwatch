import { Router, Request, Response } from 'express';
import { pool } from '../utils/db';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ========== 辅助：从请求头解析当前用户（可选） ==========
function parseUser(req: Request): { userId: number; role: string } | null {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    try {
        const token = authHeader.split(' ')[1];
        const secret = process.env.JWT_SECRET!;
        const decoded = jwt.verify(token, secret) as any;
        return { userId: decoded.userId, role: decoded.role };
    } catch {
        return null;
    }
}

// ========== 辅助：检查页面是否存在并获取信息 ==========
async function getPageById(pageId: number) {
    const [rows] = await pool.query<any[]>(
        `SELECT p.*, u.battletag AS author_name
         FROM pages p LEFT JOIN users u ON p.author_id = u.id
         WHERE p.id = ?`,
        [pageId]
    );
    return rows.length > 0 ? rows[0] : null;
}

// =================================================================
// POST /api/pages — 创建页面
// =================================================================
router.post('/pages', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user!.userId;
        const { title, content, description, type } = req.body;

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({ error: '标题不能为空' });
        }
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: '内容不能为空' });
        }

        const pageType = typeof type === 'number' ? type : 1;
        // 视频/图集类型默认审核中，其他默认完全开放
        const pageStatus = (pageType === 2 || pageType === 3) ? 1 : 3;
        const pageDescription = description || null;

        const result = await pool.query<any>(
            `INSERT INTO pages (title, content, description, author_id, type, status)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [title.trim(), content, pageDescription, userId, pageType, pageStatus]
        );

        const insertId = (result as any)[0].insertId;
        const page = await getPageById(insertId);

        res.status(201).json({
            id: page.id,
            title: page.title,
            content: page.content,
            description: page.description,
            author_id: page.author_id,
            author_name: page.author_name,
            updated_at: page.updated_at,
            type: page.type,
            status: page.status,
        });
    } catch (error) {
        console.error('创建页面失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// GET /api/pages — 获取页面列表（公开：已审核；管理员：全部）
// =================================================================
router.get('/pages', async (req: Request, res: Response) => {
    try {
        const currentUser = parseUser(req);
        const isAdmin = currentUser?.role === 'ADMIN';

        // 未登录/普通用户只看 status=2(已发布) 和 status=3(完全开放)
        const allowedStatuses = isAdmin ? [0, 1, 2, 3, 4] : [2, 3];

        const [rows] = await pool.query<any[]>(
            `SELECT p.id, p.title, LEFT(p.content, 3000) AS content_preview, p.author_id, u.battletag AS author_name,
                    p.updated_at, p.status, p.type, p.description,
                    (SELECT COUNT(*) FROM pages_likes
                     WHERE page_id = p.id AND target_type = 'page' AND target_id = p.id) AS like_count
             FROM pages p
             JOIN users u ON p.author_id = u.id
             WHERE (p.type IS NULL OR p.type IN (1, 2, 3)) AND p.status IN (?)
             ORDER BY p.updated_at DESC`,
            [allowedStatuses]
        );

        // 当前用户是否已点赞每条页面
        const userId = currentUser?.userId;
        let likedPageIds: Set<number> = new Set();
        if (userId && rows.length > 0) {
            const pageIds = rows.map((r: any) => r.id);
            const [likeRows] = await pool.query<any[]>(
                `SELECT target_id FROM pages_likes
                 WHERE user_id = ? AND target_type = 'page' AND target_id IN (?)`,
                [userId, pageIds]
            );
            likedPageIds = new Set(likeRows.map((r: any) => r.target_id));
        }

        res.json({
            pages: rows.map((r: any) => ({
                id: r.id,
                title: r.title,
                content_preview: r.content_preview,
                author_id: r.author_id,
                author_name: r.author_name,
                updated_at: r.updated_at,
                status: r.status,
                type: r.type,
                description: r.description,
                like_count: r.like_count,
                is_liked: likedPageIds.has(r.id),
            })),
        });
    } catch (error) {
        console.error('获取页面列表失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// GET /api/pages/:id — 获取页面（含访问权限校验）
// =================================================================
router.get('/pages/:id', async (req: Request, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        const page = await getPageById(pageId);
        if (!page) return res.status(404).json({ error: '页面不存在' });

        // 检查文章类型：仅 type=1（文档）和 type=2（视频）可通过此接口访问（兼容旧数据 type 为 NULL 的情况）
        if (page.type !== null && page.type !== 1 && page.type !== 2 && page.type !== 3) {
            return res.status(404).json({ error: '页面不存在' });
        }

        const currentUser = parseUser(req);
        const isAdmin = currentUser?.role === 'ADMIN';
        const isAuthor = currentUser?.userId === page.author_id;

        // 根据 status 校验访问权限
        switch (page.status) {
            case 3:  // 完全开放
                break;
            case 2:  // 已发布
                break;
            case 1:  // 审核中
                if (!isAdmin) return res.status(403).json({ error: '权限不足' });
                break;
            case 0:  // 已删除
                if (!isAdmin) return res.status(403).json({ error: '权限不足' });
                break;
            case 4:  // 草稿
                if (!isAuthor && !isAdmin) return res.status(403).json({ error: '权限不足' });
                break;
            default:
                return res.status(404).json({ error: '页面不存在' });
        }

        res.json({
            id: page.id,
            title: page.title,
            content: page.content,
            author_id: page.author_id,
            author_name: page.author_name,
            updated_at: page.updated_at,
            type: page.type,
            description: page.description,
            status: page.status,
        });
    } catch (error) {
        console.error('获取页面失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// PUT /api/pages/:id — 修改页面内容（仅作者）
// =================================================================
router.put('/pages/:id', async (req: Request, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        const currentUser = parseUser(req);
        if (!currentUser) {
            return res.status(401).json({ error: '请先登录' });
        }

        const page = await getPageById(pageId);
        if (!page) return res.status(404).json({ error: '页面不存在' });

        if (currentUser.userId !== page.author_id) {
            return res.status(403).json({ error: '只有作者可以编辑此页面' });
        }

        if (page.status === 0) {
            return res.status(403).json({ error: '已删除的页面无法编辑' });
        }

        const { title, content } = req.body;

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({ error: '标题不能为空' });
        }
        if (content === undefined || typeof content !== 'string') {
            return res.status(400).json({ error: '内容不能为空' });
        }

        await pool.query(
            'UPDATE pages SET title = ?, content = ? WHERE id = ?',
            [title.trim(), content, pageId]
        );

        const updated = await getPageById(pageId);
        res.json({
            id: updated.id,
            title: updated.title,
            content: updated.content,
            updated_at: updated.updated_at,
        });
    } catch (error) {
        console.error('更新页面失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// PATCH /api/pages/:id/status — 修改页面状态
// =================================================================
router.patch('/pages/:id/status', async (req: Request, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        const currentUser = parseUser(req);
        if (!currentUser) {
            return res.status(401).json({ error: '请先登录' });
        }

        const page = await getPageById(pageId);
        if (!page) return res.status(404).json({ error: '页面不存在' });

        const isAdmin = currentUser.role === 'ADMIN';
        const isAuthor = currentUser.userId === page.author_id;

        if (!isAuthor && !isAdmin) {
            return res.status(403).json({ error: '权限不足' });
        }

        const { status: newStatus } = req.body;
        if (newStatus === undefined || ![0, 1, 2, 3, 4].includes(newStatus)) {
            return res.status(400).json({ error: '无效的状态值' });
        }

        if (isAuthor && !isAdmin) {
            if (![0, 1, 4].includes(newStatus)) {
                return res.status(403).json({ error: '作者只能设置删除/审核/草稿状态' });
            }
        }

        await pool.query('UPDATE pages SET status = ? WHERE id = ?', [newStatus, pageId]);

        res.json({
            id: pageId,
            status: newStatus,
            updated_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('更新页面状态失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// ================  页面点赞 / 取消点赞  ========================
// =================================================================

// GET /api/pages/:id/likes — 获取页面点赞信息
router.get('/pages/:id/likes', async (req: Request, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        const [rows] = await pool.query<any[]>(
            `SELECT l.user_id, u.battletag AS user_name
             FROM pages_likes l
             JOIN users u ON l.user_id = u.id
             WHERE l.page_id = ? AND l.target_type = 'page' AND l.target_id = ?
             ORDER BY l.created_at ASC`,
            [pageId, pageId]
        );

        const currentUser = parseUser(req);
        const isLiked = currentUser
            ? rows.some((r: any) => r.user_id === currentUser.userId)
            : false;

        res.json({
            likes: rows,
            count: rows.length,
            is_liked: isLiked,
        });
    } catch (error) {
        console.error('获取点赞信息失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// POST /api/pages/:id/like — 点赞页面
router.post('/pages/:id/like', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        const userId = req.user!.userId;
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        const page = await getPageById(pageId);
        if (!page) return res.status(404).json({ error: '页面不存在' });

        await pool.query(
            `INSERT IGNORE INTO pages_likes (page_id, user_id, target_type, target_id)
             VALUES (?, ?, 'page', ?)`,
            [pageId, userId, pageId]
        );

        const [countRows] = await pool.query<any[]>(
            `SELECT COUNT(*) AS cnt FROM pages_likes
             WHERE page_id = ? AND target_type = 'page' AND target_id = ?`,
            [pageId, pageId]
        );

        res.json({ count: countRows[0].cnt, is_liked: true });
    } catch (error) {
        console.error('点赞失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// POST /api/pages/:id/unlike — 取消点赞页面
router.post('/pages/:id/unlike', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        const userId = req.user!.userId;
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        await pool.query(
            `DELETE FROM pages_likes
             WHERE page_id = ? AND user_id = ? AND target_type = 'page' AND target_id = ?`,
            [pageId, userId, pageId]
        );

        const [countRows] = await pool.query<any[]>(
            `SELECT COUNT(*) AS cnt FROM pages_likes
             WHERE page_id = ? AND target_type = 'page' AND target_id = ?`,
            [pageId, pageId]
        );

        res.json({ count: countRows[0].cnt, is_liked: false });
    } catch (error) {
        console.error('取消点赞失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// ================  评论区 API  ==================================
// =================================================================

// GET /api/pages/:id/comments — 获取评论列表（含回复、点赞数）
router.get('/pages/:id/comments', async (req: Request, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        const [topRows] = await pool.query<any[]>(
            `SELECT c.*, u.battletag AS user_name
             FROM pages_comments c
             JOIN users u ON c.user_id = u.id
             WHERE c.page_id = ? AND c.parent_id IS NULL AND c.deleted = 0
             ORDER BY c.created_at ASC`,
            [pageId]
        );

        const [replyRows] = await pool.query<any[]>(
            `SELECT c.*, u.battletag AS user_name,
                    ru.battletag AS reply_to_user_name
             FROM pages_comments c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN users ru ON c.reply_to_user_id = ru.id
             WHERE c.page_id = ? AND c.parent_id IS NOT NULL AND c.deleted = 0
             ORDER BY c.created_at ASC`,
            [pageId]
        );

        const currentUser = parseUser(req);
        let likedCommentIds: Set<number> = new Set();

        if (currentUser && (topRows.length > 0 || replyRows.length > 0)) {
            const allIds = [
                ...topRows.map((r: any) => r.id),
                ...replyRows.map((r: any) => r.id),
            ];
            if (allIds.length > 0) {
                const [likeRows] = await pool.query<any[]>(
                    `SELECT target_id FROM pages_likes
                     WHERE user_id = ? AND target_type = 'comment' AND target_id IN (?)`,
                    [currentUser.userId, allIds]
                );
                likedCommentIds = new Set(likeRows.map((r: any) => r.target_id));
            }
        }

        const allCommentIds = [...topRows.map((r: any) => r.id), ...replyRows.map((r: any) => r.id)];
        const likeCountMap: Record<number, number> = {};
        if (allCommentIds.length > 0) {
            const [countRows] = await pool.query<any[]>(
                `SELECT target_id, COUNT(*) AS cnt FROM pages_likes
                 WHERE target_type = 'comment' AND target_id IN (?)
                 GROUP BY target_id`,
                [allCommentIds]
            );
            for (const r of countRows) {
                likeCountMap[r.target_id] = r.cnt;
            }
        }

        const replyMap: Record<number, any[]> = {};
        for (const r of replyRows) {
            if (!replyMap[r.root_id]) replyMap[r.root_id] = [];
            replyMap[r.root_id].push({
                id: r.id,
                parent_id: r.parent_id,
                root_id: r.root_id,
                user_id: r.user_id,
                user_name: r.user_name,
                content: r.content,
                reply_to_user_id: r.reply_to_user_id,
                reply_to_user_name: r.reply_to_user_name,
                reply_to_content: r.reply_to_content,
                like_count: likeCountMap[r.id] || 0,
                is_liked: likedCommentIds.has(r.id),
                created_at: r.created_at,
            });
        }

        const comments = topRows.map((c: any) => ({
            id: c.id,
            parent_id: c.parent_id,
            root_id: c.root_id,
            user_id: c.user_id,
            user_name: c.user_name,
            content: c.content,
            reply_to_user_id: c.reply_to_user_id,
            reply_to_user_name: null,
            reply_to_content: null,
            like_count: likeCountMap[c.id] || 0,
            is_liked: likedCommentIds.has(c.id),
            created_at: c.created_at,
            replies: replyMap[c.id] || [],
        }));

        res.json({ comments });
    } catch (error) {
        console.error('获取评论失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// POST /api/pages/:id/comments — 发表顶级评论
router.post('/pages/:id/comments', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        const userId = req.user!.userId;
        const { content } = req.body;

        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: '评论内容不能为空' });
        }

        const page = await getPageById(pageId);
        if (!page) return res.status(404).json({ error: '页面不存在' });

        const result = await pool.query<any>(
            `INSERT INTO pages_comments (page_id, parent_id, root_id, user_id, content)
             VALUES (?, NULL, NULL, ?, ?)`,
            [pageId, userId, content.trim()]
        );

        const insertId = (result as any)[0].insertId;

        await pool.query('UPDATE pages_comments SET root_id = ? WHERE id = ?', [insertId, insertId]);

        const [rows] = await pool.query<any[]>(
            `SELECT c.*, u.battletag AS user_name
             FROM pages_comments c JOIN users u ON c.user_id = u.id
             WHERE c.id = ?`,
            [insertId]
        );

        const comment = rows[0];
        res.status(201).json({
            id: comment.id,
            parent_id: comment.parent_id,
            root_id: comment.root_id,
            user_id: comment.user_id,
            user_name: comment.user_name,
            content: comment.content,
            reply_to_user_id: null,
            reply_to_user_name: null,
            reply_to_content: null,
            like_count: 0,
            is_liked: false,
            created_at: comment.created_at,
            replies: [],
        });
    } catch (error) {
        console.error('发表评论失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// POST /api/pages/comments/:cid/reply — 回复评论
router.post('/pages/comments/:cid/reply', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const parentId = parseInt(String(req.params.cid), 10);
        const userId = req.user!.userId;
        const { content, reply_to_user_id } = req.body;

        if (isNaN(parentId) || parentId < 1) {
            return res.status(400).json({ error: '无效的评论 ID' });
        }
        if (!content || typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: '回复内容不能为空' });
        }

        const [parentRows] = await pool.query<any[]>(
            'SELECT * FROM pages_comments WHERE id = ? AND deleted = 0',
            [parentId]
        );
        if (parentRows.length === 0) {
            return res.status(404).json({ error: '评论不存在' });
        }
        const parent = parentRows[0];

        const rootId = parent.parent_id === null ? parent.id : parent.root_id;

        const replyToContent = parent.content.length > 50
            ? parent.content.substring(0, 50) + '…'
            : parent.content;

        const result = await pool.query<any>(
            `INSERT INTO pages_comments (page_id, parent_id, root_id, user_id, content,
                                         reply_to_user_id, reply_to_content)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [parent.page_id, parentId, rootId, userId, content.trim(),
             reply_to_user_id || parent.user_id, replyToContent]
        );

        const insertId = (result as any)[0].insertId;

        const [rows] = await pool.query<any[]>(
            `SELECT c.*, u.battletag AS user_name,
                    ru.battletag AS reply_to_user_name
             FROM pages_comments c
             JOIN users u ON c.user_id = u.id
             LEFT JOIN users ru ON c.reply_to_user_id = ru.id
             WHERE c.id = ?`,
            [insertId]
        );

        const reply = rows[0];
        res.status(201).json({
            id: reply.id,
            parent_id: reply.parent_id,
            root_id: reply.root_id,
            user_id: reply.user_id,
            user_name: reply.user_name,
            content: reply.content,
            reply_to_user_id: reply.reply_to_user_id,
            reply_to_user_name: reply.reply_to_user_name,
            reply_to_content: reply.reply_to_content,
            like_count: 0,
            is_liked: false,
            created_at: reply.created_at,
        });
    } catch (error) {
        console.error('回复失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// DELETE /api/pages/comments/:cid — 删除自己的评论（软删除）
router.delete('/pages/comments/:cid', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const commentId = parseInt(String(req.params.cid), 10);
        const userId = req.user!.userId;

        if (isNaN(commentId) || commentId < 1) {
            return res.status(400).json({ error: '无效的评论 ID' });
        }

        const [rows] = await pool.query<any[]>(
            'SELECT * FROM pages_comments WHERE id = ? AND deleted = 0',
            [commentId]
        );
        if (rows.length === 0) {
            return res.status(404).json({ error: '评论不存在' });
        }

        if (rows[0].user_id !== userId) {
            return res.status(403).json({ error: '只能删除自己的评论' });
        }

        await pool.query('UPDATE pages_comments SET deleted = 1 WHERE id = ?', [commentId]);
        res.json({ message: '删除成功' });
    } catch (error) {
        console.error('删除评论失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// =================================================================
// ================  评论点赞  ======================================
// =================================================================

// POST /api/pages/comments/:cid/like — 点赞评论
router.post('/pages/comments/:cid/like', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const commentId = parseInt(String(req.params.cid), 10);
        const userId = req.user!.userId;

        if (isNaN(commentId) || commentId < 1) {
            return res.status(400).json({ error: '无效的评论 ID' });
        }

        const [commentRows] = await pool.query<any[]>(
            'SELECT page_id FROM pages_comments WHERE id = ? AND deleted = 0',
            [commentId]
        );
        if (commentRows.length === 0) {
            return res.status(404).json({ error: '评论不存在' });
        }

        await pool.query(
            `INSERT IGNORE INTO pages_likes (page_id, user_id, target_type, target_id)
             VALUES (?, ?, 'comment', ?)`,
            [commentRows[0].page_id, userId, commentId]
        );

        const [countRows] = await pool.query<any[]>(
            `SELECT COUNT(*) AS cnt FROM pages_likes
             WHERE target_type = 'comment' AND target_id = ?`,
            [commentId]
        );

        res.json({ count: countRows[0].cnt, is_liked: true });
    } catch (error) {
        console.error('评论点赞失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// POST /api/pages/comments/:cid/unlike — 取消点赞评论
router.post('/pages/comments/:cid/unlike', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const commentId = parseInt(String(req.params.cid), 10);
        const userId = req.user!.userId;

        if (isNaN(commentId) || commentId < 1) {
            return res.status(400).json({ error: '无效的评论 ID' });
        }

        await pool.query(
            `DELETE FROM pages_likes
             WHERE user_id = ? AND target_type = 'comment' AND target_id = ?`,
            [userId, commentId]
        );

        const [countRows] = await pool.query<any[]>(
            `SELECT COUNT(*) AS cnt FROM pages_likes
             WHERE target_type = 'comment' AND target_id = ?`,
            [commentId]
        );

        res.json({ count: countRows[0].cnt, is_liked: false });
    } catch (error) {
        console.error('取消评论点赞失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

export default router;
