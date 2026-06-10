import jwt from 'jsonwebtoken';
import cors from 'cors';
import express, { Request, Response } from 'express';
import { userEventLogger, pool } from '../utils/db';
import bcrypt from 'bcrypt';
import { verifyCaptcha } from '../utils/captcha';
import { sendSmsVerifyCode } from '../utils/sendSmsVerifyCode';
const router = express.Router();
router.use(cors());
router.use(express.json());

/**
* POST /api/baind-phone/send-sms-code
 * 
 * 功能：为用户绑定新手机号时发送短信验证码。
 *       该接口要求用户提供当前账号的战网ID和密码以验证身份，
 *       并通过人机验证后，向指定新手机号发送4位数字验证码。
 *       成功后返回一个有效期为5分钟的加密令牌（smsToken），用于后续的绑定确认。
 * 
 * 请求体 (Request Body):
 *   - [battletag] (string, required): 用户的战网ID（如 "Node#51456"）。
 *   - [password](string, required): 用户的登录密码（明文，用于服务端 bcrypt 验证）。
 *   - [captchaVerifyParam](string, required): 人机验证码（由前端验证码组件生成并返回的验证凭证）。
 *   - `newPhone` (string, required): 待绑定的新手机号码（需符合中国大陆手机号格式 /^1[3-9]\d{9}$/）。
 * 
 * 响应 (Response):
 *   成功 (200 OK):
 *     {
 *       "success": true,
 *       "message": "验证码已发送",
 *       "token": "xxxxx",        // JWT 格式的 smsToken，包含 newPhone, code, expireTimestamp
 *       "expireIn": 60           // 令牌剩余有效时间（秒）
 *     }
 */

// 全局频率限制 Map（生产环境建议用 Redis）
const smsRequestMap = new Map<string, number>();

// 生成 4 位随机数字验证码
function generateSmsCode(): string {
    return Math.floor(1000 + Math.random() * 90000).toString();
}

// 生成加密令牌（有效时间 60 秒）
function generateSmsToken(newPhone: string, code: string, expireTimestamp: number): string {
    const payload = { newPhone, code, expireTimestamp };
    // 使用非空断言确保 JWT_SECRET 存在
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '60s' });
}

// 短信验证码接口（修复类型错误）
router.post('/send-sms-code', async (req: Request, res: Response): Promise<void> => {
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

    // 2. 验证用户（通过 battletag + 密码）
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

    // 3. 频率限制（基于 IP，60 秒）
    const now = Date.now();
    const lastRequestTime = smsRequestMap.get(ipAddress);
    if (lastRequestTime && (now - lastRequestTime) < 60000) {
        const remainingSeconds = Math.ceil((60000 - (now - lastRequestTime)) / 1000);
        await userEventLogger.logEvent({
            userId: userId,
            eventType: 'SMS_REQUEST',
            targetUserId: null,
            eventData: {
                phoneNumber: newPhone,
                purpose: '修改手机号',
                result: '频率过快',
            },
            ipAddress: ipAddress,
        });
        console.log(`[SMS] 频率限制，IP: ${ipAddress}，剩余时间: ${remainingSeconds} 秒`);
        res.status(429).json({
            error: `请求频率过快，请等待 ${remainingSeconds} 秒后重试`,
            remaining: remainingSeconds
        });
        return;
    }

    // 4. 检查新手机号是否已被其他用户绑定
    try {
        const [existing] = await pool.query<any[]>(
            'SELECT id FROM users WHERE phone = ? AND id != ?',
            [newPhone, userId]
        );
        if (existing.length > 0) {
            await userEventLogger.logEvent({
                userId: userId,
                eventType: 'SMS_REQUEST',
                targetUserId: null,
                eventData: {
                    phoneNumber: newPhone,
                    purpose: '修改手机号',
                    result: '该手机号已被其他账号绑定',
                },
                ipAddress: ipAddress,
            });
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
    const expireTimestamp = now + 60000 * 5; // 5分钟后过期
    const smsToken = generateSmsToken(newPhone, smsCode, expireTimestamp);

    // 7. 发送短信
    console.log(`[SMS] 验证码 ${smsCode} 已发送至 ${newPhone}，用户ID: ${userId}`);
    await sendSmsVerifyCode(newPhone, smsCode);


    // 8. 记录请求时间（频率限制）
    smsRequestMap.set(ipAddress, now);
    setTimeout(() => {
        if (smsRequestMap.get(ipAddress) === now) {
            smsRequestMap.delete(ipAddress);
        }
    }, 60000);

    await userEventLogger.logEvent({
        userId: userId,
        eventType: 'SMS_REQUEST',
        targetUserId: null,
        eventData: {
            phoneNumber: newPhone,
            purpose: '修改手机号',
            result: '验证码已发放',
        },
        ipAddress: ipAddress,
    });

    // 9. 返回成功响应
    res.json({
        success: true,
        message: '验证码已发送',
        token: smsToken,
        expireIn: 60
    });
});

// ========== 提交绑定接口 ==========
/**
 * POST /api/baind-phone/confirm
 * 
 * 功能：确认并绑定新手机号。
 * 请求体:
 *   - battletag (string, required): 用户战网ID。
 *   - password (string, required): 用户密码。
 *   - smsCode (string, required): 用户输入的4位短信验证码。
 *   - smsToken (string, required): 发送验证码时返回的加密令牌。
 * 
 * 响应:
 *   成功 (200 OK): { success: true, message: '手机号绑定成功' }
 *   错误: 各种4xx/5xx错误，如验证码错误、令牌过期、用户验证失败等。
 */
router.post('/confirm', async (req: Request, res: Response): Promise<void> => {
    const { battletag, password, smsCode, smsToken } = req.body;

    // 1. 基础参数校验
    if (!battletag || !password || !smsCode || !smsToken) {
        res.status(400).json({ error: '缺少必要参数' });
        return;
    }

    // 2. 验证用户身份 (battletag + password)
    let userId: number;
    let newPhoneFromToken: string;
    try {
        const [userRows] = await pool.query<any[]>(
            'SELECT id, password_hash FROM users WHERE battletag = ?',
            [battletag]
        );
        if (userRows.length === 0) {
            res.status(401).json({ error: '用户不存在' });
            return;
        }
        const user = userRows[0];
        const isValidPassword = await bcrypt.compare(password, user.password_hash);
        if (!isValidPassword) {
            res.status(401).json({ error: '密码错误' });
            return;
        }
        userId = user.id;
    } catch (dbError) {
        console.error('用户验证数据库错误:', dbError);
        res.status(500).json({ error: '服务器内部错误' });
        return;
    }

    // 3. 解密并验证 smsToken
    let decodedToken: any;
    try {
        // 使用 JWT_SECRET 验证并解码令牌
        decodedToken = jwt.verify(smsToken, process.env.JWT_SECRET!) as { newPhone: string; code: string; expireTimestamp: number };
        newPhoneFromToken = decodedToken.newPhone;
    } catch (tokenError) {
        console.error('令牌验证失败:', tokenError);
        res.status(400).json({ error: '验证码令牌无效或已过期' });
        return;
    }

    // 4. 验证短信验证码
    const { code: expectedCode, expireTimestamp } = decodedToken;
    const now = Date.now();
    if (now > expireTimestamp) {
        res.status(400).json({ error: '验证码已过期，请重新获取' });
        return;
    }
    if (smsCode !== expectedCode) {
        res.status(400).json({ error: '短信验证码错误' });
        return;
    }

    await userEventLogger.logEvent({
        userId: userId,
        eventType: 'SMS_REQUEST',
        targetUserId: null,
        eventData: {
            phoneNumber: newPhoneFromToken,
            purpose: '修改手机号',
            result: '修改成功',
        },
        ipAddress: req.ip,
    });

    // 5. 执行数据库更新
    try {
        const [updateResult] = await pool.query(
            'UPDATE users SET phone = ? WHERE id = ?',
            [newPhoneFromToken, userId]
        );
        // 理论上 updateResult.affectedRows 应为 1
        console.log(`[BIND] 用户 ${battletag} (ID: ${userId}) 的手机号已成功绑定为 ${newPhoneFromToken}`);
        res.json({ success: true, message: '手机号绑定成功' });
    } catch (updateError) {
        console.error('绑定手机号数据库更新错误:', updateError);
        res.status(500).json({ error: '绑定手机号失败' });
        return;
    }
});

export default router;
