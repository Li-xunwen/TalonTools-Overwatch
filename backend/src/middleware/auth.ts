    // src/middleware/auth.ts
    import { Request, Response, NextFunction } from 'express';
    import jwt from 'jsonwebtoken';
    import dotenv from 'dotenv';
    dotenv.config();
    
    // 从环境变量读取 JWT 密钥
    const SECRET_KEY = process.env.JWT_SECRET;
    if (!SECRET_KEY) {
        throw new Error('JWT_SECRET is not defined in environment variables');
    }
    
    // 扩展 Express Request 类型，添加 user 属性
    export interface AuthRequest extends Request {
        user?: {
            userId: number;
            battletag: string;
            role: string;
        };
    }
    
    export function authenticateToken(req: AuthRequest, res: Response, next: NextFunction) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
    
        if (!token) {
            return res.status(401).json({ error: '未提供认证令牌' });
        }
    
        // 使用非空断言操作符 (!) 告诉 TS SECRET_KEY 在此处一定存在
        jwt.verify(token, SECRET_KEY!, (err, decoded) => {
            if (err) {
                return res.status(403).json({ error: '令牌无效或已过期' });
            }
            // 将解码后的用户信息挂载到 req.user
            req.user = decoded as AuthRequest['user'];
            next();
        });
    }