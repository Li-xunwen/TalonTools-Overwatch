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

// 返回所有用户的 battletag 列表
app.get('/api/users/battletaglist', async (req, res) => {
    try {
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            'SELECT battletag FROM users ORDER BY battletag'
        );
        const battletagList = rows.map((row: any) => row.battletag);
        res.json(battletagList);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: 'Failed to fetch battletag list' });
    }
});


// 获取指定用户的段位信息和擅长英雄列表（需要 token 认证）
app.get('/api/:battletag/rank_hero', authenticateToken, async (req: AuthRequest, res) => {
    let battletag = req.params.battletag as string;
    battletag = decodeURIComponent(battletag);
    if (!battletag) {
        return res.status(400).json({ error: '缺少 battletag 参数' });
    }

    try {
        // 1. 查询用户基本信息（包含段位字段）
        const [userRows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT id, battletag, role, rank_open_6v6, rank_tank_5v5, rank_dps_5v5, rank_support_5v5, created_at, updated_at
             FROM users 
             WHERE battletag = ?`,
            [battletag]
        );

        if (userRows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }

        const userInfo = userRows[0];
        const userId = userInfo.id;

        // 2. 查询用户擅长的英雄（按 sort_order 升序）
        const [heroRows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT h.name
             FROM user_favorite_heroes ufh
             JOIN heroes h ON ufh.hero_id = h.id
             WHERE ufh.user_id = ?
             ORDER BY ufh.sort_order ASC`,
            [userId]
        );

        const heroes = heroRows.map(row => row.name);

        // 3. 返回合并后的数据
        res.json({
            ...userInfo,
            heroes
        });
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: '获取用户信息失败' });
    }
});

// 获取指定用户的被点赞信息（需要 token 认证）
app.get('/api/:battletag/likelist', authenticateToken, async (req: AuthRequest, res) => {
    let battletag = req.params.battletag as string;
    battletag = decodeURIComponent(battletag);
    if (!battletag) {
        return res.status(400).json({ error: '缺少 battletag 参数' });
    }

    try {
        // 1. 查询目标用户是否存在，获取其 id
        const [userRows] = await pool.query<mysql.RowDataPacket[]>(
            'SELECT id FROM users WHERE battletag = ?',
            [battletag]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const targetUserId = userRows[0].id;

        // 2. 查询点赞信息：点赞者战网ID、累计点赞次数，按 like_count 降序排列
        const [likeRows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT u.battletag AS ID, l.like_count AS \`Like\`
             FROM likes l
             JOIN users u ON l.from_user_id = u.id
             WHERE l.to_user_id = ?
             ORDER BY l.like_count DESC`,
            [targetUserId]
        );

        res.json(likeRows);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: '获取点赞信息失败' });
    }
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


/**
 * POST /api/:battletag/like
 * 功能：当前登录用户为目标用户点赞（每次只能增加 1 个赞，需要 token 认证）
 * 
 * 限制规则（基于 updated_at 秒数）：
 *   - 对于每一对 (from_user_id, to_user_id) 记录，updated_at 字段的**秒数**用于存储「当天已经给该目标用户点赞的次数」。
 *   - 每次点赞时，先判断 updated_at 中的日期是否为今天：
 *       如果是今天，则取出秒数作为已点赞次数；如果不是今天，则视为 0 次。
 *   - 如果已点赞次数 < 20，则允许点赞（增加 1 次），并将秒数 +1，同时将 updated_at 的小时和分钟设为当前时间（保留秒数作为计数）。
 *   - 如果已点赞次数 >= 20，则返回 429 错误。
 *   - 每个用户每天最多能对同一个目标用户点赞 20 次。
 * 
 * 注意：此设计会丢失原始的 updated_at 秒数（原本是真实秒数），但满足功能需求。
 * 
 * 并发安全：使用 SELECT ... FOR UPDATE 锁定行，防止超限。
 */
app.post('/api/:battletag/like', authenticateToken, async (req: AuthRequest, res) => {
    // 1. 获取当前登录用户信息
    const currentUserId = req.user?.userId;
    const currentUserTag = req.user?.battletag;
    if (!currentUserId || !currentUserTag) {
        return res.status(401).json({ error: '未授权' });
    }

    // 2. 获取目标用户 battletag 并解码
    let targetTag = req.params.battletag as string;
    targetTag = decodeURIComponent(targetTag);
    if (!targetTag) {
        return res.status(400).json({ error: '缺少 battletag 参数' });
    }

    // 3. 禁止给自己点赞
    if (targetTag === currentUserTag) {
        return res.status(400).json({ error: '不能给自己点赞' });
    }

    // 4. 查询目标用户是否存在
    const [targetRows] = await pool.query<mysql.RowDataPacket[]>(
        'SELECT id FROM users WHERE battletag = ?',
        [targetTag]
    );
    if (targetRows.length === 0) {
        return res.status(404).json({ error: '目标用户不存在' });
    }
    const targetUserId = targetRows[0].id;

    // 5. 开启事务，使用行锁防止并发
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // 查询记录并加锁（FOR UPDATE）
        let [rows] = await connection.query<mysql.RowDataPacket[]>(
            'SELECT id, like_count, updated_at FROM likes WHERE from_user_id = ? AND to_user_id = ? FOR UPDATE',
            [currentUserId, targetUserId]
        );
        let recordId: number;
        let currentLikeCount: number;
        let currentUpdatedAt: Date;

        if (rows.length === 0) {
            // 不存在则插入一条初始记录（like_count=0, updated_at 秒数=0）
            const now = new Date();
            now.setSeconds(0, 0);
            await connection.query(
                `INSERT INTO likes (from_user_id, to_user_id, like_count, updated_at) VALUES (?, ?, 0, ?)`,
                [currentUserId, targetUserId, now]
            );
            // 重新查询获取新记录的 id
            [rows] = await connection.query<mysql.RowDataPacket[]>(
                'SELECT id, like_count, updated_at FROM likes WHERE from_user_id = ? AND to_user_id = ?',
                [currentUserId, targetUserId]
            );
            recordId = rows[0].id;
            currentLikeCount = rows[0].like_count;
            currentUpdatedAt = new Date(rows[0].updated_at);
        } else {
            recordId = rows[0].id;
            currentLikeCount = rows[0].like_count;
            currentUpdatedAt = new Date(rows[0].updated_at);
        }

        const nowDate = new Date();
        const isToday = currentUpdatedAt.toDateString() === nowDate.toDateString();
        let todayCount = isToday ? currentUpdatedAt.getSeconds() : 0;

        // 检查今日是否已达上限
        if (todayCount >= 20) {
            await connection.rollback();
            connection.release();
            return res.status(429).json({ error: `今日已对 ${targetTag} 点赞 ${todayCount} 次，已达上限（20次/天）` });
        }

        // 本次只能增加 1 个赞
        const actualIncrement = 1;
        const newLikeCount = currentLikeCount + actualIncrement;
        // 更新 updated_at: 日期为今天，时分为当前时间，秒数为 todayCount + 1
        const newUpdatedAt = new Date(nowDate);
        newUpdatedAt.setSeconds(todayCount + actualIncrement);

        await connection.query(
            `UPDATE likes SET like_count = ?, updated_at = ? WHERE id = ?`,
            [newLikeCount, newUpdatedAt, recordId]
        );

        await connection.commit();
        connection.release();

        res.json({ message: '点赞成功', likeCount: newLikeCount, addedCount: actualIncrement });
    } catch (error) {
        await connection.rollback();
        connection.release();
        console.error('点赞失败:', error);
        res.status(500).json({ error: '点赞失败，请稍后重试' });
    }
});

// ========== 评价相关接口（数据库版本） ==========
// 获取指定用户收到的所有评价（需要 token 认证）
app.get('/api/:battletag/evaluations', authenticateToken, async (req: AuthRequest, res) => {
    let battletag = req.params.battletag as string;
    battletag = decodeURIComponent(battletag);
    if (!battletag) {
        return res.status(400).json({ error: '缺少 battletag 参数' });
    }

    try {
        // 1. 查询目标用户是否存在，获取其 id
        const [userRows] = await pool.query<mysql.RowDataPacket[]>(
            'SELECT id FROM users WHERE battletag = ?',
            [battletag]
        );
        if (userRows.length === 0) {
            return res.status(404).json({ error: '用户不存在' });
        }
        const targetUserId = userRows[0].id;

        // 2. 查询评价信息：评价者战网ID、评价内容，按创建时间升序
        const [ratingRows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT u.battletag AS ID, r.content AS evaluation
             FROM ratings r
             JOIN users u ON r.from_user_id = u.id
             WHERE r.to_user_id = ?
             ORDER BY r.created_at ASC`,
            [targetUserId]
        );

        res.json(ratingRows);
    } catch (error) {
        console.error('Database error:', error);
        res.status(500).json({ error: '获取评价信息失败' });
    }
});

/**
 * PUT /api/:battletag/evaluation
 * 功能：当前登录用户为目标用户提交评价（需要 token 认证）
 * 请求体：{ "evaluation": "评价内容" }，内容为空字符串时表示删除评价
 * 规则：
 *   - 评价内容长度不超过 32 字符（由前端限制，后端也做校验）
 *   - 如果评价内容非空且用户对目标用户的评价记录已存在，则更新内容；
 *   - 如果评价内容非空且记录不存在，则插入新记录；
 *   - 如果评价内容为空字符串，则删除该用户对目标用户的评价记录。
 * 返回：成功时返回 { message: "评价提交成功" } 或 { message: "评价删除成功" }
 */
app.put('/api/:battletag/evaluation', authenticateToken, async (req: AuthRequest, res) => {
    // 1. 获取当前登录用户信息
    const currentUserId = req.user?.userId;
    const currentUserTag = req.user?.battletag;
    if (!currentUserId || !currentUserTag) {
        return res.status(401).json({ error: '未授权' });
    }

    // 2. 获取目标用户 battletag 并解码
    let targetTag = req.params.battletag as string;
    targetTag = decodeURIComponent(targetTag);
    if (!targetTag) {
        return res.status(400).json({ error: '缺少 battletag 参数' });
    }

    // 3. 获取评价内容
    const { evaluation } = req.body;
    if (evaluation === undefined || typeof evaluation !== 'string') {
        return res.status(400).json({ error: '缺少 evaluation 字段或类型错误' });
    }
    // 长度限制（与前端一致，32字符）
    if (evaluation.length > 32) {
        return res.status(400).json({ error: '评价内容不能超过32个字符' });
    }

    // 4. 查询目标用户是否存在
    const [targetRows] = await pool.query<mysql.RowDataPacket[]>(
        'SELECT id FROM users WHERE battletag = ?',
        [targetTag]
    );
    if (targetRows.length === 0) {
        return res.status(404).json({ error: '目标用户不存在' });
    }
    const targetUserId = targetRows[0].id;

    const trimmed = evaluation.trim();
    try {
        if (trimmed === '') {
            // 删除评价：使用 ResultSetHeader 类型获取 affectedRows
            const [result] = await pool.query<mysql.ResultSetHeader>(
                'DELETE FROM ratings WHERE from_user_id = ? AND to_user_id = ?',
                [currentUserId, targetUserId]
            );
            if (result.affectedRows === 0) {
                return res.status(404).json({ error: '没有找到可删除的评价' });
            }
            res.json({ message: '评价删除成功' });
        } else {
            // 插入或更新评价（UPSERT），同样使用 ResultSetHeader（可选）
            await pool.query<mysql.ResultSetHeader>(
                `INSERT INTO ratings (from_user_id, to_user_id, content, updated_at)
                 VALUES (?, ?, ?, NOW())
                 ON DUPLICATE KEY UPDATE
                     content = VALUES(content),
                     updated_at = NOW()`,
                [currentUserId, targetUserId, trimmed]
            );
            res.json({ message: '评价提交成功' });
        }
    } catch (error) {
        console.error('评价操作失败:', error);
        res.status(500).json({ error: '评价操作失败，请稍后重试' });
    }
});

/**
 * PUT /api/user/rank
 * 功能：修改当前登录用户的段位信息（需要 token 认证）
 * 请求体示例：
 * {
 *   "rank_open_6v6": { "rank": "gold", "level": 5 },
 *   "rank_tank_5v5": null,
 *   "rank_dps_5v5": { "rank": "platinum", "level": 2 }
 * }
 * 说明：只更新请求体中提供的字段，未提供的字段保持不变。
 *      每个段位值必须是合法的对象 { rank: string, level: number } 或 null。
 *      如果值为 null，表示清除该段位。
 */
app.put('/api/user/rank', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: '未授权' });
    }

    const allowedFields = ['rank_open_6v6', 'rank_tank_5v5', 'rank_dps_5v5', 'rank_support_5v5'];
    const updates: any = {};
    let hasUpdate = false;

    for (const field of allowedFields) {
        if (req.body.hasOwnProperty(field)) {
            const value = req.body[field];
            // 校验值：必须是 null 或 { rank: string, level: number }
            if (value !== null && (typeof value !== 'object' || !value.rank || typeof value.level !== 'number')) {
                return res.status(400).json({ error: `${field} 格式错误，应为 { rank: string, level: number } 或 null` });
            }
            updates[field] = value;
            hasUpdate = true;
        }
    }

    if (!hasUpdate) {
        return res.status(400).json({ error: '未提供任何段位字段' });
    }

    try {
        // 构建动态 SET 子句
        const setClauses: string[] = [];
        const values: any[] = [];
        for (const field of allowedFields) {
            if (updates.hasOwnProperty(field)) {
                setClauses.push(`${field} = ?`);
                values.push(updates[field] === null ? null : JSON.stringify(updates[field]));
            }
        }
        values.push(userId);
        const query = `UPDATE users SET ${setClauses.join(', ')} WHERE id = ?`;
        await pool.query(query, values);

        res.json({ message: '段位信息更新成功' });
    } catch (error) {
        console.error('更新段位失败:', error);
        res.status(500).json({ error: '服务器错误，请稍后重试' });
    }
});


/**
 * PUT /api/user/heroes
 * 功能：修改当前登录用户的擅长英雄列表（需要 token 认证）
 * 请求体示例：
 * {
 *   "heroes": ["genji", "tracer", "mercy"]
 * }
 * 说明：
 *   - heroes 数组长度为 0~5，元素为英雄英文名（必须存在于 heroes 表中）。
 *   - 数组顺序即为擅长顺序（sort_order 从 1 开始）。
 *   - 如果 heroes 为空数组，则删除该用户的所有擅长记录。
 */
app.put('/api/user/heroes', authenticateToken, async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) {
        return res.status(401).json({ error: '未授权' });
    }

    let { heroes } = req.body;
    if (!Array.isArray(heroes)) {
        return res.status(400).json({ error: 'heroes 必须是一个数组' });
    }
    if (heroes.length > 5) {
        return res.status(400).json({ error: '擅长英雄不能超过5个' });
    }

    // 去重并保留顺序
    heroes = [...new Map(heroes.map((name, idx) => [name, idx])).keys()];
    if (heroes.length > 5) {
        return res.status(400).json({ error: '去重后超过5个英雄' });
    }

    // 批量查询英雄是否存在于 heroes 表
    let heroIds: number[] = [];
    if (heroes.length > 0) {
        const placeholders = heroes.map(() => '?').join(',');
        const [rows] = await pool.query<mysql.RowDataPacket[]>(
            `SELECT id, name FROM heroes WHERE name IN (${placeholders})`,
            heroes
        );
        const foundMap = new Map(rows.map(row => [row.name, row.id]));
        const notFound = heroes.filter((name: string) => !foundMap.has(name));
        if (notFound.length > 0) {
            return res.status(400).json({ error: `以下英雄不存在：${notFound.join(', ')}` });
        }
        heroIds = heroes.map((name: string) => foundMap.get(name)!);
    }

    const connection = await pool.getConnection();
    await connection.beginTransaction();
    try {
        // 1. 删除用户原有的擅长记录
        await connection.query('DELETE FROM user_favorite_heroes WHERE user_id = ?', [userId]);

        // 2. 插入新的擅长记录
        if (heroIds.length > 0) {
            const insertValues: any[] = [];
            for (let i = 0; i < heroIds.length; i++) {
                insertValues.push(userId, heroIds[i], i + 1);
            }
            const insertSql = `INSERT INTO user_favorite_heroes (user_id, hero_id, sort_order) VALUES ${insertValues.map(() => '(?, ?, ?)').join(', ')}`;
            await connection.query(insertSql, insertValues);
        }

        await connection.commit();
        res.json({ message: '擅长英雄更新成功', heroes });
    } catch (error) {
        await connection.rollback();
        console.error('更新擅长英雄失败:', error);
        res.status(500).json({ error: '服务器错误，请稍后重试' });
    } finally {
        connection.release();
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`🚀 Server is running at http://localhost:${port}`);
});
