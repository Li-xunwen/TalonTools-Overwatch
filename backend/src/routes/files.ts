import { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = Router();
const USERS_DIR = path.join(__dirname, '../../public/users');

const storage = multer.diskStorage({
  destination: (req: any, _file, cb) => {
    const userId = req.user?.userId || '_';
    const userDir = path.join(USERS_DIR, String(userId));
    if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (_req, file, cb) => {
    cb(null, file.originalname);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } });

router.get('/files', authenticateToken, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const userDir = path.join(USERS_DIR, String(userId));
    if (!fs.existsSync(userDir)) return res.json({ files: [] });

    const items = fs.readdirSync(userDir, { withFileTypes: true });
    const files = items.filter(i => i.isFile()).map(item => {
      const fullPath = path.join(userDir, item.name);
      const stat = fs.statSync(fullPath);
      const ext = path.extname(item.name).toLowerCase();
      let type: 'image' | 'video' | 'other' = 'other';
      if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp'].includes(ext)) type = 'image';
      else if (['.mp4','.webm','.ogv','.mov','.avi','.mkv'].includes(ext)) type = 'video';
      return { name: item.name, size: stat.size, type, ext, url: '/resource/users/' + userId + '/' + encodeURIComponent(item.name), mtime: stat.mtimeMs };
    }).sort((a, b) => b.mtime - a.mtime);

    res.json({ files });
  } catch (error) {
    res.status(500).json({ error: 'server error' });
  }
});

router.post('/files/upload', authenticateToken, (req: AuthRequest, res: Response) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload failed: ' + err.message });
    if (!req.file) return res.status(400).json({ error: 'no file' });

    const ext = path.extname(req.file.originalname).toLowerCase();
    let type: 'image' | 'video' | 'other' = 'other';
    if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp'].includes(ext)) type = 'image';
    else if (['.mp4','.webm','.ogv','.mov','.avi','.mkv'].includes(ext)) type = 'video';

    res.json({ name: req.file.originalname, size: req.file.size, type, ext, url: '/resource/users/' + req.user!.userId + '/' + encodeURIComponent(req.file.originalname) });
  });
});

router.delete('/files/:filename', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const filename = String(req.params.filename);
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\'))
      return res.status(400).json({ error: 'invalid filename' });

    const filePath = path.join(USERS_DIR, String(userId), filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not found' });
    fs.unlinkSync(filePath);
    res.json({ message: 'deleted' });
  } catch (error) {
    res.status(500).json({ error: 'server error' });
  }
});

// 重命名文件
router.patch('/files/:filename/rename', authenticateToken, (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.userId;
    const oldName = String(req.params.filename);
    const { newName } = req.body as { newName?: string };

    // 参数校验
    if (!newName || !newName.trim()) {
      return res.status(400).json({ error: '新文件名不能为空' });
    }
    if (oldName.includes('..') || oldName.includes('/') || oldName.includes('\\') ||
        newName.includes('..') || newName.includes('/') || newName.includes('\\')) {
      return res.status(400).json({ error: '无效的文件名' });
    }

    const userDir = path.join(USERS_DIR, String(userId));
    const oldPath = path.join(userDir, oldName);
    const newPath = path.join(userDir, newName.trim());

    // 检查旧文件是否存在
    if (!fs.existsSync(oldPath)) {
      return res.status(404).json({ error: '原文件不存在' });
    }
    // 检查新文件名是否已存在
    if (fs.existsSync(newPath)) {
      return res.status(409).json({ error: '新文件名已存在' });
    }

    // 执行重命名
    fs.renameSync(oldPath, newPath);

    const stat = fs.statSync(newPath);
    const ext = path.extname(newName).toLowerCase();
    let type: 'image' | 'video' | 'other' = 'other';
    if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp'].includes(ext)) type = 'image';
    else if (['.mp4','.webm','.ogv','.mov','.avi','.mkv'].includes(ext)) type = 'video';

    res.json({
      name: newName.trim(),
      size: stat.size,
      type,
      ext,
      url: '/resource/users/' + userId + '/' + encodeURIComponent(newName.trim()),
    });
  } catch (error) {
    res.status(500).json({ error: 'server error' });
  }
});

export default router;
