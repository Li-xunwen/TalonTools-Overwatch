import { Router, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { pool } from '../utils/db';
import { authenticateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ========== 不需要认证的路由 ==========
router.get('/users/battletaglist', async (req, res) => {
    try {
        const [rows] = await pool.query<any[]>('SELECT battletag FROM users ORDER BY battletag');
        res.json(rows.map(row => row.battletag));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch battletag list' });
    }
});

// 获取用户头像（公开）
router.get('/users/:battletag/avatar', async (req, res) => {
    let battletag = decodeURIComponent(req.params.battletag as string);
    if (!battletag) return res.status(400).json({ error: '缺少 battletag 参数' });
    
    const baseName = battletag.replace(/#/g, '-');
    const avatarDir = path.join(process.cwd(), 'public', 'res', 'imge');
    const possibleExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    let foundPath: string | null = null;
    
    for (const ext of possibleExts) {
        const fullPath = path.join(avatarDir, `${baseName}${ext}`);
        if (fs.existsSync(fullPath)) {
            foundPath = fullPath;
            break;
        }
    }
    
    if (!foundPath) {
        const defaultPath = path.join(avatarDir, 'default-avatar.png');
        if (fs.existsSync(defaultPath)) return res.sendFile(defaultPath);
        return res.status(404).json({ error: '头像不存在' });
    }
    
    // 【关键修改】设置响应头，禁止浏览器缓存头像，确保上传后立即刷新
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    
    res.sendFile(foundPath);
});

// ========== 以下路由都需要认证 ==========
router.use(authenticateToken);

// 2. 使用 Express.Multer.File 替代自定义导入的 MulterFile
interface UploadRequest extends AuthRequest {
    file?: Express.Multer.File;
}

const avatarStorage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb) => {
        const dir = path.join(process.cwd(), 'public', 'res', 'imge');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req: Request, file: Express.Multer.File, cb) => {
        const battletag = (req.params.battletag as string) || ''; 
        const sanitized = battletag.replace(/#/g, '-');
        
        // 1. 确定新文件的扩展名
        let originalExt = path.extname(file.originalname).toLowerCase();
        if (!originalExt) {
            if (file.mimetype === 'image/jpeg') originalExt = '.jpg';
            else if (file.mimetype === 'image/webp') originalExt = '.webp';
            else if (file.mimetype === 'image/gif') originalExt = '.gif';
            else originalExt = '.png';
        }
        
        const newFilename = `${sanitized}${originalExt}`;
        const dir = path.join(process.cwd(), 'public', 'res', 'imge');

        // 2. 【关键步骤】删除该用户目录下所有其他格式的旧头像
        const possibleExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        for (const ext of possibleExts) {
            // 如果扩展名相同，说明是覆盖原文件，Multer 会自动处理；如果不同，则需手动删除旧文件
            if (ext !== originalExt) {
                const oldFilePath = path.join(dir, `${sanitized}${ext}`);
                if (fs.existsSync(oldFilePath)) {
                    try {
                        fs.unlinkSync(oldFilePath);
                        console.log(`Deleted old avatar: ${oldFilePath}`);
                    } catch (err) {
                        console.error(`Failed to delete old avatar: ${oldFilePath}`, err);
                    }
                }
            }
        }

        // 3. 返回新文件名
        cb(null, newFilename);
    }
});

const upload = multer({
    storage: avatarStorage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req: Request, file: Express.Multer.File, cb) => {
        const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('只允许上传图片 (JPG, PNG, WEBP, GIF)') as any);
        }
    }
});

// 使用 UploadRequest 替代 AuthRequest
router.put('/users/:battletag/avatar', upload.single('avatar'), async (req: UploadRequest, res) => {
    const currentUserId = req.user?.userId;
    const currentUserTag = req.user?.battletag;
    let targetTag = decodeURIComponent(req.params.battletag as string);
    
    if (!currentUserId || !currentUserTag) return res.status(401).json({ error: '未授权' });
    if (targetTag !== currentUserTag) return res.status(403).json({ error: '只能修改自己的头像' });
    
    if (!req.file) {
        return res.status(400).json({ error: '没有上传文件或文件格式不正确' });
    }
    
    res.json({ message: '头像更新成功', filename: req.file.filename });
});

// GET /api/:battletag/rank_hero
router.get('/:battletag/rank_hero', async (req: AuthRequest, res) => {
    let battletag = decodeURIComponent(req.params.battletag as string);
    if (!battletag) return res.status(400).json({ error: '缺少 battletag 参数' });
    try {
        const [userRows] = await pool.query<any[]>(
            `SELECT id, battletag, role, rank_open_6v6, rank_tank_5v5, rank_dps_5v5, rank_support_5v5, created_at, updated_at
             FROM users WHERE battletag = ?`,
            [battletag]
        );
        if (userRows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const userInfo = userRows[0];
        const [heroRows] = await pool.query<any[]>(
            `SELECT h.name FROM user_favorite_heroes ufh JOIN heroes h ON ufh.hero_id = h.id WHERE ufh.user_id = ? ORDER BY ufh.sort_order ASC`,
            [userInfo.id]
        );
        res.json({ ...userInfo, heroes: heroRows.map(row => row.name) });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

// GET /api/:battletag/likelist
router.get('/:battletag/likelist', async (req: AuthRequest, res) => {
    let battletag = decodeURIComponent(req.params.battletag as string);
    if (!battletag) return res.status(400).json({ error: '缺少 battletag 参数' });
    try {
        const [userRows] = await pool.query<any[]>('SELECT id FROM users WHERE battletag = ?', [battletag]);
        if (userRows.length === 0) return res.status(404).json({ error: '用户不存在' });
        const targetUserId = userRows[0].id;
        const [likeRows] = await pool.query<any[]>(
            `SELECT u.battletag AS ID, l.like_count AS \`Like\`
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

// GET /api/users/me
router.get('/users/me', async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const [rows] = await pool.query<any[]>(
            `SELECT id, battletag, role, rank_open_6v6, rank_tank_5v5, rank_dps_5v5, rank_support_5v5 FROM users WHERE id = ?`,
            [userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

export default router;