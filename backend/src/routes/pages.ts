import { Router, Request, Response } from 'express';
import { pool } from '../utils/db';
import jwt from 'jsonwebtoken';

const router = Router();

/**
 * GET /api/pages/:id
 * 功能：获取发布后的文档页面（按 type 和 status 进行权限校验）
 * 参数：
 *   :id - pages 表主键
 * 响应：
 *   200 - { id, title, content, author_id, author_name, updated_at, type, description, status }
 *   400 - 无效的页面 ID
 *   401 - 需要登录（status=2 但未携带 JWT）
 *   403 - 权限不足（草稿/审核/删除状态且非作者/非管理员）
 *   404 - 页面不存在（id 不存在 或 type≠1）
 *   500 - 服务器错误
 */
router.get('/pages/:id', async (req: Request, res: Response) => {
    try {
        const pageId = parseInt(String(req.params.id), 10);
        if (isNaN(pageId) || pageId < 1) {
            return res.status(400).json({ error: '无效的页面 ID' });
        }

        // ---------- 1. 查询页面记录（附带作者名称） ----------
        const [rows] = await pool.query<any[]>(
            `SELECT p.id,
                    p.title,
                    p.content,
                    p.author_id,
                    u.battletag AS author_name,
                    p.updated_at,
                    p.type,
                    p.description,
                    p.status
             FROM pages p
                      LEFT JOIN users u ON p.author_id = u.id
             WHERE p.id = ?`,
            [pageId]
        );

        if (rows.length === 0) {
            return res.status(404).json({ error: '页面不存在' });
        }

        const page = rows[0];

        // ---------- 2. 检查文章类型：仅 type=1（文档）可通过此接口访问 ----------
        if (page.type !== 1) {
            return res.status(404).json({ error: '页面不存在' });
        }

        // ---------- 3. 尝试解析 JWT Token（可选，不强制要求） ----------
        let currentUser: { userId: number; role: string } | null = null;
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            try {
                const token = authHeader.split(' ')[1];
                const secret = process.env.JWT_SECRET!;
                const decoded = jwt.verify(token, secret) as any;
                currentUser = { userId: decoded.userId, role: decoded.role };
            } catch {
                // Token 无效或过期，视作匿名用户
            }
        }

        const isAdmin = currentUser?.role === 'ADMIN';
        const isAuthor = currentUser?.userId === page.author_id;

        // ---------- 4. 根据 status 校验访问权限 ----------
        switch (page.status) {
            case 3:
                // 完全开放 — 任何人可访问
                break;

            case 2:
                // 登录可见 — 必须有有效登录用户
                if (!currentUser) {
                    return res.status(401).json({ error: '请先登录后再查看此页面' });
                }
                break;

            case 1:  // 审核状态 — 仅管理员
            case 0:  // 删除状态 — 仅管理员
                if (!isAdmin) {
                    return res.status(403).json({ error: '权限不足' });
                }
                break;

            case 4:
                // 草稿状态 — 仅作者和管理员
                if (!isAuthor && !isAdmin) {
                    return res.status(403).json({ error: '权限不足' });
                }
                break;

            default:
                return res.status(404).json({ error: '页面不存在' });
        }

        // ---------- 5. 返回页面数据 ----------
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

export default router;
