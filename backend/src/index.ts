import express, { Request, Response } from 'express';
import http from 'http';
import path from 'path';
import cors from 'cors';
import dotenv from 'dotenv';
import { initPool, userEventLogger, pool } from './utils/db';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from './middleware/auth';
import userRouter from './routes/user';
import likeRouter from './routes/like';
import evaluationRouter from './routes/evaluation';
import rankRouter from './routes/rank';
import heroesRouter from './routes/heroes';
import dashenProfileRouter from './routes/dashenProfile';
import adminRouter from './routes/admin';
import bindPhone from './routes/bindPhone';
import minecraftRouter from './routes/minecraft';
import undercoverRouter from './routes/undercover';
import pagesRouter from './routes/pages';
import filesRouter from './routes/files';
import quizRouter from './routes/quiz';
import {
    physicalPathOf,
    resolveFileForLegacyUrl,
    startFileLibraryTasks
} from './services/fileLibrary';
import { initUndercoverWs } from './ws/undercoverWs';

dotenv.config();

const { PORT, DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET } = process.env;

if (!PORT) throw new Error('PORT is not defined');
if (!DB_HOST) throw new Error('DB_HOST is not defined');
if (!DB_USER) throw new Error('DB_USER is not defined');
if (!DB_PASSWORD) throw new Error('DB_PASSWORD is not defined');
if (!DB_NAME) throw new Error('DB_NAME is not defined');
if (!JWT_SECRET) throw new Error('JWT_SECRET is not defined');

const app = express();
const port = parseInt(PORT, 10);

initPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

app.use(cors());
app.set('trust proxy', true);

// 文件上传路由必须在 express.json() 之前注册，避免 multipart 被当作 JSON 解析
app.use('/api/users', filesRouter);

app.use(express.json());

app.use('/users', express.static(path.join(__dirname, '../public/users')));
// 文章里的文件链接走 /resource/users/...（开发环境由 vite 代理重写，
// 这里也直接挂一份，保证后端单独访问 / 未经 nginx 重写时同样可用）
app.use('/resource/users', express.static(path.join(__dirname, '../public/users')));

// 文件库旧链接兼容：文件已按 md5 重命名后，历史文章里的
// /users/{userId}/{旧文件名} 仍然能用（按显示名 / 历史名回查数据库）
const legacyFileHandler = async (req: Request, res: Response) => {
    try {
        const userId = Number(req.params.userId);
        const name = String(req.params.name);
        if (!Number.isInteger(userId) || !name) return res.status(404).end();

        const resolved = await resolveFileForLegacyUrl(userId, name);
        if (!resolved) return res.status(404).end();

        res.sendFile(physicalPathOf(userId, resolved.storage));
    } catch (error) {
        console.error('[文件库] 旧链接回退失败:', error);
        res.status(500).end();
    }
};

app.get('/users/:userId/:name', legacyFileHandler);
app.get('/resource/users/:userId/:name', legacyFileHandler);

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Your TypeScript server is running!' });
    console.log('真实 IP:', req.ip);
    console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
    console.log('X-Real-IP:', req.headers['x-real-ip']);
});

app.post('/api/login', async (req, res) => {
    const { battletag, password } = req.body;
    const { pool } = await import('./utils/db');
    const [rows] = await pool.query<any[]>(
        'SELECT id, battletag, password_hash, role, phone FROM users WHERE battletag = ?',
        [battletag]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: '用户不存在' });

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: '密码错误' });

    // 检查手机号是否为空
    if (!user.phone || user.phone.trim() === '') {
        return res.status(403).json({ error: '请先绑定手机号' });
    }

    const token = jwt.sign(
        { userId: user.id, battletag: user.battletag, role: user.role },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
    try {
        await userEventLogger.logEvent({ userId: user.id, eventType: 'login', ipAddress: req.ip });
    } catch (logError) {
        console.error('Failed to log login event:', logError, { userId: user.id, eventType: 'login', ipAddress: req.ip });
    }
    res.json({ token, battletag: user.battletag });
});

app.get('/api/heroeslist', async (req, res) => {
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT id, name, zh_name, role FROM heroes ORDER BY id'
        );
        res.json(rows);
    } catch (error) {
        console.error('获取英雄列表失败:', error);
        res.status(500).json({ error: '服务器错误' });
    }
});

app.use('/api/minecraft', minecraftRouter);
app.use('/api/undercover', undercoverRouter);
app.use('/api/bind-phone', bindPhone);
app.use('/api', userRouter);
app.use('/api', pagesRouter);
app.use('/api', likeRouter);
app.use('/api', evaluationRouter);
app.use('/api/user', rankRouter);
app.use('/api/user', heroesRouter);
app.use('/api/v2', dashenProfileRouter);
app.use('/api/admin', adminRouter);
app.use('/api/quiz', quizRouter);

// 用 http server 同时承载 Express 与「谁是守望先锋卧底」的 WebSocket 会话
const server = http.createServer(app);
initUndercoverWs(server);

// 文件库后台任务：恢复「解析中」队列 + 定时清理中断的上传
startFileLibraryTasks();

server.listen(port, () => {
    console.log('🚀 Server is running at http://localhost:' + port);
});
