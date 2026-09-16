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
const ERROR_CACHE_TTL_MS = 5 * 1000; // 失败结果只缓存 5 秒，服务器恢复后能尽快显示

/**
 * 解析 MINECRAFTHOST，支持三种写法：
 *   120.220.44.64                  → 端口取 MINECRAFTPORT 或默认 25565
 *   120.220.44.64:49028            → 端口写在同一个变量里（生产环境就是这种）
 *   minecraft://host:port / [IPv6]:port
 *
 * 之前直接把整串当成 host 传给 minecraft-server-util，端口又硬编码 25565，
 * 导致 DNS 去解析「120.220.44.64:49028」这个"主机名" → getaddrinfo ENOTFOUND。
 */
function resolveTarget(): { host: string; port: number } | null {
    const raw = (process.env.MINECRAFTHOST ?? '').trim().replace(/^minecraft:\/\//i, '');
    if (!raw) return null;

    let host = raw;
    let port = Number(process.env.MINECRAFTPORT ?? 0) || 0;

    const ipv6 = /^\[([^\]]+)\]:(\d+)$/.exec(raw);
    const simple = /^([^:]+):(\d+)$/.exec(raw);
    if (ipv6) {
        host = ipv6[1];
        port = Number(ipv6[2]);
    } else if (simple) {
        host = simple[1];
        port = Number(simple[2]);
    }

    if (!port) port = 25565;
    return { host, port };
}

// 核心查询函数（带缓存）
async function getServerStatus(): Promise<ServerStatusResult> {
    const now = Date.now();
    // 如果缓存存在且未过期，直接返回缓存（失败结果缓存时间更短）
    const ttl = cachedResult && !cachedResult.success ? ERROR_CACHE_TTL_MS : CACHE_TTL_MS;
    if (cachedResult && (now - lastFetchTime) < ttl) {
        return cachedResult;
    }

    // 否则执行实际查询
    const target = resolveTarget();
    if (!target) {
        const errorResult: ServerStatusResult = {
            success: false,
            error: 'MINECRAFTHOST 环境变量未设置（支持 host 或 host:port 写法）'
        };
        cachedResult = errorResult;
        lastFetchTime = now;
        return errorResult;
    }
    const { host, port } = target;

    try {
        const response = await status(host, port, {
            timeout: Number(process.env.MINECRAFT_TIMEOUT_MS ?? 5000),
            // 域名 + 默认端口时走 SRV 记录（IP:端口不受影响）
            enableSRV: port === 25565
        });
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
        const detail = error instanceof Error ? error.message : String(error);
        console.error(`[Minecraft] 状态查询失败 host=${host} port=${port}: ${detail}`);
        const errorResult: ServerStatusResult = {
            success: false,
            error: `无法连接 ${host}:${port}（${detail}）`
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
