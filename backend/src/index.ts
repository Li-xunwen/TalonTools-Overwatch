// src/index.ts
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from './middleware/auth';

dotenv.config();

// 从环境变量读取配置，无默认值
const {
    PORT,
    DB_HOST,
    DB_USER,
    DB_PASSWORD,
    DB_NAME,
    JWT_SECRET
} = process.env;

// 必要配置校验
if (!PORT) throw new Error('PORT is not defined');
if (!DB_HOST) throw new Error('DB_HOST is not defined');
if (!DB_USER) throw new Error('DB_USER is not defined');
if (!DB_PASSWORD) throw new Error('DB_PASSWORD is not defined');
if (!DB_NAME) throw new Error('DB_NAME is not defined');
if (!JWT_SECRET) throw new Error('JWT_SECRET is not defined');

const app = express();
const port = parseInt(PORT, 10);

// 创建数据库连接池
const pool = mysql.createPool({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

app.use(cors());
app.use(express.json());

// 健康检查接口
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Your TypeScript server is running!' });
});

// 返回所有用户的 battletag 列表
app.get('/api/users/battletaglist', async (req, res) => {
    try {
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            'SELECT battletag FROM users ORDER BY battletag'
        );
        const battletagList = rows.map(row => row.battletag);
        res.json(battletagList);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch battletag list' });
    }
});

// 用户登录接口（JWT 认证）
app.post('/api/login', async (req, res) => {
    const { battletag, password } = req.body;

    // 1. 从数据库查询用户
    const [rows] = await pool.query<mysql.RowDataPacket[]>(
        'SELECT id, battletag, password_hash, role FROM users WHERE battletag = ?',
        [battletag]
    );
    const user = rows[0];

    if (!user) {
        return res.status(401).json({ error: '用户不存在' });
    }

    // 2. 比对密码
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
        return res.status(401).json({ error: '密码错误' });
    }

    // 3. 生成 JWT
    const token = jwt.sign(
        {
            userId: user.id,
            battletag: user.battletag,
            role: user.role
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    // 4. 返回 token 和用户信息
    res.json({ token, battletag: user.battletag });
});

// 获取当前登录用户自己的信息（需要 token）
app.get('/api/users/me', authenticateToken, async (req: AuthRequest, res) => {
    try {
        const userId = req.user?.userId;
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT id, battletag, role, rank_open_6v6, rank_tank_5v5, rank_dps_5v5, rank_support_5v5 
             FROM users WHERE id = ?`,
            [userId]
        );
        if (rows.length === 0) return res.status(404).json({ error: '用户不存在' });
        res.json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: '服务器错误' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});