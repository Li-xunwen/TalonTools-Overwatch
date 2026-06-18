import express, { Request, Response } from 'express';
import { status } from 'minecraft-server-util';

const router = express.Router();

// 定义返回类型
interface ServerStatusResult {
    success: boolean;
    data?: {
        online: number;
        max: number;
        motd: string;
        latency: number;
        players?: { name: string; id: string }[];
    };
    error?: string;
}

// ---------- 缓存相关 ----------
let cachedResult: ServerStatusResult | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 10 * 1000; // 10 秒

// 核心查询函数（带缓存）
async function getServerStatus(): Promise<ServerStatusResult> {
    const now = Date.now();
    // 如果缓存存在且未过期，直接返回缓存
    if (cachedResult && (now - lastFetchTime) < CACHE_TTL_MS) {
        return cachedResult;
    }

    // 否则执行实际查询
    const host = process.env.MINECRAFTHOST;
    if (!host) {
        const errorResult: ServerStatusResult = {
            success: false,
            error: 'MINECRAFTHOST 环境变量未设置'
        };
        cachedResult = errorResult;
        lastFetchTime = now;
        return errorResult;
    }
    const port = 25565;

    try {
        const response = await status(host, port);
        const result: ServerStatusResult = {
            success: true,
            data: {
                online: response.players.online,
                max: response.players.max,
                motd: response.motd?.clean || '无描述',
                latency: response.roundTripLatency,
                players: response.players.sample?.map(p => ({ name: p.name, id: p.id }))
            }
        };
        cachedResult = result;
        lastFetchTime = now;
        return result;
    } catch (error) {
        const errorResult: ServerStatusResult = {
            success: false,
            error: error instanceof Error ? error.message : '未知错误'
        };
        cachedResult = errorResult;
        lastFetchTime = now;
        return errorResult;
    }
}

// GET /api/minecraft/status
router.get('/status', async (req: Request, res: Response) => {
    try {
        const result = await getServerStatus();
        if (result.success) {
            res.json(result.data);
        } else {
            res.status(503).json({ error: result.error });
        }
    } catch (error) {
        console.error('Minecraft status API error:', error);
        res.status(500).json({ error: '服务器内部错误' });
    }
});

export default router;