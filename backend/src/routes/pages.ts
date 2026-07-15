import { Router, Request, Response } from 'express';
import { pool } from '../utils/db';
import jwt from 'jsonwebtoken';

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

        // 检查文章类型：仅 type=1（文档）可通过此接口访问
        if (page.type !== 1) return res.status(404).json({ error: '页面不存在' });

        const currentUser = parseUser(req);
        const isAdmin = currentUser?.role === 'ADMIN';
        const isAuthor = currentUser?.userId === page.author_id;

        // 根据 status 校验访问权限
        switch (page.status) {
            case 3:  // 完全开放 — 任何人
                break;
            case 2:  // 已发布 — 任何人
                break;
            case 1:  // 审核中 — 仅管理员
                if (!isAdmin) return res.status(403).json({ error: '权限不足' });
                break;
            case 0:  // 已删除 — 仅管理员
                if (!isAdmin) return res.status(403).json({ error: '权限不足' });
                break;
            case 4:  // 草稿 — 仅作者和管理员
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

        // 必须登录
        const currentUser = parseUser(req);
        if (!currentUser) {
            return res.status(401).json({ error: '请先登录' });
        }

        const page = await getPageById(pageId);
        if (!page) return res.status(404).json({ error: '页面不存在' });

        // 仅作者可编辑
        if (currentUser.userId !== page.author_id) {
            return res.status(403).json({ error: '只有作者可以编辑此页面' });
        }

        // 已删除的页面不能编辑
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

        // 必须登录
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

        // 作者权限限制：只能设 0(删除), 1(提交审核), 4(草稿)
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

export default router;
