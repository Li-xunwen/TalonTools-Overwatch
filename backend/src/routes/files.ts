import express, { Router, Request, Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { userEventLogger } from '../utils/db';
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
  upload.array('file', 9)(req, res, (err) => {
    if (err) return res.status(400).json({ error: 'upload failed: ' + err.message });
    if (!req.files || (req.files as Express.Multer.File[]).length === 0) return res.status(400).json({ error: 'no file' });

    const files = (req.files as Express.Multer.File[]).map(f => {
      const ext = path.extname(f.originalname).toLowerCase();
      let type: 'image' | 'video' | 'other' = 'other';
      if (['.jpg','.jpeg','.png','.gif','.webp','.svg','.bmp'].includes(ext)) type = 'image';
      else if (['.mp4','.webm','.ogv','.mov','.avi','.mkv'].includes(ext)) type = 'video';
      return { name: f.originalname, size: f.size, type, ext, url: '/resource/users/' + req.user!.userId + '/' + encodeURIComponent(f.originalname) };
    });

    // 操作日志：上传文件
    userEventLogger.logEvent({
      userId: req.user!.userId,
      eventType: 'file_upload',
      eventData: { fileCount: files.length, names: files.map(f => f.name) },
      ipAddress: req.ip,
    });

    res.json({ files, count: files.length });
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

    // 操作日志：删除文件
    userEventLogger.logEvent({
      userId: req.user!.userId,
      eventType: 'file_delete',
      eventData: { filename },
      ipAddress: req.ip,
    });

    res.json({ message: 'deleted' });
  } catch (error) {
    res.status(500).json({ error: 'server error' });
  }
});

// 重命名文件（需显式解析 JSON body，因为 filesRouter 挂载在 app.use(express.json()) 之前）
router.patch('/files/:filename/rename', express.json(), authenticateToken, (req: AuthRequest, res: Response) => {
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

    // 操作日志：重命名文件
    userEventLogger.logEvent({
      userId: req.user!.userId,
      eventType: 'file_rename',
      eventData: { oldName, newName: newName.trim() },
      ipAddress: req.ip,
    });

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
