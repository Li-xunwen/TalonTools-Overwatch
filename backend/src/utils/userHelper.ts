import jwt from 'jsonwebtoken';
import { pool } from './db';

const JWT_SECRET = process.env.JWT_SECRET!;
if (!JWT_SECRET) throw new Error('JWT_SECRET is not defined');

/**
 * 根据战网ID获取用户ID
 * @param battletag 战网ID（例如 "Node#51456"）
 * @returns 用户ID，若不存在则返回 null
 */
export async function getUserIdByBattletag(battletag: string): Promise<number | null> {
    const [rows] = await pool.query<any[]>(
        'SELECT id FROM users WHERE battletag = ?',
        [battletag]
    );
    return rows.length ? rows[0].id : null;
}

/**
 * 根据用户ID获取战网ID
 * @param userId 用户ID
 * @returns 战网ID，若不存在则返回 null
 */
export async function getBattletagByUserId(userId: number): Promise<string | null> {
    const [rows] = await pool.query<any[]>(
        'SELECT battletag FROM users WHERE id = ?',
        [userId]
    );
    return rows.length ? rows[0].battletag : null;
}

/**
 * 从JWT Token中解析用户信息（userId, battletag, role）
 * @param token JWT字符串
 * @returns 解析出的用户信息，若无效则返回 null
 */
export function decodeToken(token: string): { userId: number; battletag: string; role: string } | null {
    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded && typeof decoded.userId === 'number' && typeof decoded.battletag === 'string') {
            return {
                userId: decoded.userId,
                battletag: decoded.battletag,
                role: decoded.role || 'USER',
            };
        }
        return null;
    } catch (err) {
        return null;
    }
}

/**
 * 从请求头中提取Bearer Token并解析用户信息
 * @param req Express Request对象
 * @returns 用户信息，若不存在或无效则返回 null
 */
export function getUserFromRequest(req: any): { userId: number; battletag: string; role: string } | null {
    const authHeader = req.headers.authorization;
    if (!authHeader) return null;
    const token = authHeader.split(' ')[1];
    if (!token) return null;
    return decodeToken(token);
}

// 兼容 authenticateToken 中间件已经挂载 req.user 的情况
// 直接取 req.user 即可（需要确保中间件已执行）