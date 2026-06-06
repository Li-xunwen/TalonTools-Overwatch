import { Router } from 'express';
import axios from 'axios';
import { levelGet, levelSetEx } from '../services/levelCache';
import { getCacheKey } from '../utils/cacheHelpers';
import { userEventLogger } from '../utils/db';
import { AuthRequest } from '../middleware/auth';
import { getUserIdByBattletag } from '../utils/userHelper';

const router = Router();
const DaShenURL = process.env.DASHEN_URL;

/**
 * 根据请求路径获取缓存时间（秒）
 * @param path - req.path
 * @returns TTL in seconds
 */
function getCacheTTL(path: string): number {
    if (path.includes('/dashen-profile')) {
        return 36 * 3600;
    }
    // 今日总结（summary）相关：2 小时
    if (path.includes('/dashen-summary')) {
        return 2*3600; 
    }
    if (path.includes('/dashen-match')) {
        return 3600;
    }
    if (path.includes('/dashen-quick-strength')) {
        return 6*3600;
    }
    if (path.includes('/dashen-competitive-strength')) {
        return 6*3600;
    }

    // 默认（可扩展其他路径）
    return 36000;
}

async function proxyAndCache(req: AuthRequest, res: any) {
    const body = req.body;
    const targetUrl = `${DaShenURL}${req.path}`;
    const isImage = req.path.endsWith('/image');
    const cacheKey = getCacheKey(req.path, body);
    const cacheTTL = getCacheTTL(req.path);   // 动态获取缓存时间
    // 从 token 中获取当前用户 ID
    const currentUserId = req.user?.userId;
    const eventType = req.path.includes('/dashen-profile') ? 'view_profile' : req.path.includes('/dashen-summary') ? 'view_summary' 
    : req.path.includes('/dashen-match') ? 'view_match' : req.path.includes('/dashen-quick-strength') ? 'dashen-quick-strength' : 'dashen-competitive-strength';

    // 记录日志（异步，不阻塞）
    if (currentUserId && body.bnet_id) {
        getUserIdByBattletag(body.bnet_id)
            .then(targetUserId => {
                userEventLogger.logEvent({
                    userId: currentUserId,
                    eventType: eventType,
                    targetUserId,
                    eventData: { path: req.path, bnet_id: body.bnet_id },
                    ipAddress: req.ip
                });
            })
            .catch(err => console.error('Failed to resolve target user id:', err));
    }

    const cached = await levelGet(cacheKey);
    if (cached) {
        console.log(`[Cache HIT] ${cacheKey}`);
        if (isImage) {
            const buffer = Buffer.from(cached, 'base64');
            res.set('Content-Type', 'image/png');
            return res.send(buffer);
        } else {
            return res.json(JSON.parse(cached));
        }
    }

    console.log(`[Cache MISS] ${cacheKey}, proxying to ${targetUrl},TTL: ${cacheTTL}s`);
    try {
        const response = await axios.post(targetUrl, body, {
            responseType: isImage ? 'arraybuffer' : 'json',
            headers: { 'Content-Type': 'application/json' }
        });

        if (isImage) {
            const buffer = response.data;
            const base64 = buffer.toString('base64');
            await levelSetEx(cacheKey, cacheTTL, base64);
            res.set('Content-Type', response.headers['content-type'] || 'image/png');
            res.send(buffer);
        } else {
            const jsonData = response.data;
            await levelSetEx(cacheKey, cacheTTL, JSON.stringify(jsonData));
            res.json(jsonData);
        }
    } catch (error: any) {
        console.error('代理请求失败:', error.message);
        if (error.response) {
            const status = error.response.status;
            const headers = error.response.headers;
            const data = error.response.data;
            res.status(status).set(headers).send(data);
        } else {
            res.status(502).json({ error: 'Bad Gateway', detail: error.message });
        }
    }
}

// 注册路由
router.post('/dashen-profile', proxyAndCache);
router.post('/dashen-profile/image', proxyAndCache);
router.post('/dashen-summary/today', proxyAndCache);
router.post('/dashen-summary/today/image', proxyAndCache);
router.post('/dashen-match', proxyAndCache);
router.post('/dashen-match/image', proxyAndCache);
router.post('/dashen-quick-strength', proxyAndCache);
router.post('/dashen-competitive-strength', proxyAndCache);
router.post('/dashen-quick-strength/image', proxyAndCache);
router.post('/dashen-competitive-strength/image', proxyAndCache);
export default router;