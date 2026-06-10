import express, { Request, Response } from 'express';
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
import { verifyCaptcha } from './utils/captcha';
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

/**
 * POST /api/captcha/verify
 * 测试验证码接口
 * 请求体: { captchaVerifyParam: string, sceneId?: string }
 * 响应: { success: boolean, message?: string, result?: boolean, code?: string }
 */
app.post('/api/captcha/verify', async (req, res) => {
  const { captchaVerifyParam, sceneId } = req.body;

  if (!captchaVerifyParam || typeof captchaVerifyParam !== 'string') {
    return res.status(400).json({
      success: false,
      message: '缺少参数 captchaVerifyParam 或格式不正确',
    });
  }

  try {
    const verifyResult = await verifyCaptcha(captchaVerifyParam, sceneId);
    console.log('验证结果:', verifyResult);
    res.json({
      success: true,
      result: verifyResult,
      message: verifyResult ? '验证通过' : '验证失败',
    });
  } catch (error) {
    console.error('[Captcha Route] 验证异常:', error);
    res.status(500).json({
      success: false,
      message: '服务器内部错误，请稍后重试',
    });
  }
});


// 全局频率限制 Map（生产环境建议用 Redis）
const smsRequestMap = new Map<string, number>();

// 生成 5 位随机数字验证码
function generateSmsCode(): string {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// 生成加密令牌（有效时间 60 秒）
function generateSmsToken(newPhone: string, code: string, expireTimestamp: number): string {
    const payload = { newPhone, code, expireTimestamp };
    // 使用非空断言确保 JWT_SECRET 存在
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '60s' });
}

// 短信验证码接口（修复类型错误）
app.post('/api/send-sms-code', async (req: Request, res: Response): Promise<void> => {
    const { battletag, password, captchaVerifyParam, newPhone } = req.body;
    const ipAddress = req.ip || req.headers['x-forwarded-for']?.toString() || 'unknown';

    // 1. 参数校验
    if (!battletag || !password || !captchaVerifyParam || !newPhone) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
    }
    // 简单手机号格式校验（中国大陆）
    if (!/^1[3-9]\d{9}$/.test(newPhone)) {
        res.status(400).json({ error: '手机号格式不正确' });
        return;
    }

    // 2. 频率限制（基于 IP，60 秒）
    const now = Date.now();
    const lastRequestTime = smsRequestMap.get(ipAddress);
    if (lastRequestTime && (now - lastRequestTime) < 60000) {
        const remainingSeconds = Math.ceil((60000 - (now - lastRequestTime)) / 1000);
        res.status(429).json({
            error: `请求频率过快，请等待 ${remainingSeconds} 秒后重试`,
            remaining: remainingSeconds
        });
        return;
    }

    // 3. 验证用户（通过 battletag + 密码）
    let userId: number;
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT id, password_hash FROM users WHERE battletag = ?',
            [battletag]
        );
        if (rows.length === 0) {
            res.status(401).json({ error: '用户不存在' });
            return;
        }
        const user = rows[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ error: '密码错误' });
            return;
        }
        userId = user.id;
    } catch (dbError) {
        console.error('数据库查询错误:', dbError);
        res.status(500).json({ error: '服务器内部错误' });
        return;
    }

    // 4. 检查新手机号是否已被其他用户绑定
    try {
        const [existing] = await pool.query<any[]>(
            'SELECT id FROM users WHERE phone = ? AND id != ?',
            [newPhone, userId]
        );
        if (existing.length > 0) {
            res.status(409).json({ error: '该手机号已被其他账号绑定' });
            return;
        }
    } catch (dbError) {
        console.error('手机号查重错误:', dbError);
        res.status(500).json({ error: '服务器内部错误' });
        return;
    }

    // 5. 人机验证
    let captchaResult: boolean;
    try {
        captchaResult = await verifyCaptcha(captchaVerifyParam);
    } catch (err) {
        console.error('人机验证异常:', err);
        res.status(500).json({ error: '人机验证服务异常' });
        return;
    }
    if (!captchaResult) {
        res.status(403).json({ error: '人机验证失败，请重新验证' });
        return;
    }

    // 6. 生成验证码和加密令牌
    const smsCode = generateSmsCode();
    const expireTimestamp = now + 60000; // 60 秒后过期
    const smsToken = generateSmsToken(newPhone, smsCode, expireTimestamp);

    // 7. 模拟发送短信（实际调用阿里云/腾讯云短信 SDK）
    console.log(`[SMS] 验证码 ${smsCode} 已发送至 ${newPhone}，用户ID: ${userId}`);

    // 8. 记录请求时间（频率限制）
    smsRequestMap.set(ipAddress, now);
    setTimeout(() => {
        if (smsRequestMap.get(ipAddress) === now) {
            smsRequestMap.delete(ipAddress);
        }
    }, 60000);

    // 9. 返回成功响应
    res.json({
        success: true,
        message: '验证码已发送',
        token: smsToken,
        expireIn: 60
    });
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