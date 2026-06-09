import express from 'express';
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

// 初始化数据库连接池
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
app.use(express.json());
app.set('trust proxy', true);

// 健康检查（无需认证）
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Your TypeScript server is running!' });
    console.log('真实 IP:', req.ip);
    console.log('X-Forwarded-For:', req.headers['x-forwarded-for']);
    console.log('X-Real-IP:', req.headers['x-real-ip']);
});

// 登录（无需认证）
app.post('/api/login', async (req, res) => {
    const { battletag, password } = req.body;
    const { pool } = await import('./utils/db');
    const [rows] = await pool.query<any[]>(
        'SELECT id, battletag, password_hash, role FROM users WHERE battletag = ?',
        [battletag]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: '用户不存在' });
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: '密码错误' });
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

/**
 * GET /api/heroeslist
 * 功能：获取所有英雄列表（无需 token）
 * 返回示例：
 * [
 *   { "id": 1, "name": "wuyang", "zh_name": "无漾", "role": "support" },
 *   { "id": 2, "name": "kiriko", "zh_name": "雾子", "role": "support" },
 *   ...
 * ]
 */
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

// 挂载需要认证的路由
app.use('/api', userRouter);          // 用户相关
app.use('/api', likeRouter);          // 点赞
app.use('/api', evaluationRouter);     // 评价
app.use('/api/user', rankRouter);      // 用户段位更新
app.use('/api/user', heroesRouter);    // 用户英雄更新
app.use('/api/v2', dashenProfileRouter);
app.use('/api/admin', adminRouter);

app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});