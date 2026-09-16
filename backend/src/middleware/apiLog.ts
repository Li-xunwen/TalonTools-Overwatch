/**
 * API 访问日志：为「黑爪会议室日志」提供接口使用率 / 常用用户数据
 *
 * 只记录业务接口（/api 开头），跳过静态资源、健康检查与日志面板自身的查询，
 * 避免「看日志」这个动作反过来污染统计。写入是同步 append（一行 < 200 字节），
 * 出任何问题都只告警，绝不影响业务响应。
 */

import { Request, Response, NextFunction } from 'express';
import { appendApiLog } from '../services/talonRoomLog';
import type { AuthRequest } from './auth';

// 不统计的路径：健康检查、登录/注册等噪音接口、以及日志面板自身的读接口
const SKIP_PREFIXES = [
    '/api/health',
    '/api/admin/events',
    '/api/hadoop/status',
    '/api/hadoop/fs',
    '/api/hadoop/analytics',
    '/api/hadoop/jobs'
];

function shouldSkip(pathname: string): boolean {
    if (!pathname.startsWith('/api')) return true;
    return SKIP_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function apiLog(req: Request, res: Response, next: NextFunction): void {
    const pathname = req.path ?? req.url.split('?')[0];
    if (shouldSkip(pathname)) {
        next();
        return;
    }

    const startedAt = Date.now();
    res.on('finish', () => {
        try {
            const auth = (req as AuthRequest).user;
            appendApiLog({
                kind: 'api',
                ts: new Date().toISOString(),
                user: auth?.battletag ?? '匿名/未登录',
                userId: auth?.userId,
                method: req.method,
                path: pathname,
                status: res.statusCode,
                ms: Date.now() - startedAt,
                ip: req.ip
            });
        } catch (error) {
            console.error('[黑爪会议室日志] API 日志记录失败:', error);
        }
    });

    next();
}
