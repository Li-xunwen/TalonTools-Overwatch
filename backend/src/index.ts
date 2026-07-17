import express, { Request, Response } from 'express';
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
import pagesRouter from './routes/pages';
import filesRouter from './routes/files';

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
app.use('/api/bind-phone', bindPhone);
app.use('/api', userRouter);
app.use('/api', pagesRouter);
app.use('/api', likeRouter);
app.use('/api', evaluationRouter);
app.use('/api/user', rankRouter);
app.use('/api/user', heroesRouter);
app.use('/api/v2', dashenProfileRouter);
app.use('/api/admin', adminRouter);

app.listen(port, () => {
    console.log('🚀 Server is running at http://localhost:' + port);
});
