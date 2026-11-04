import { Router } from 'express';
import axios from 'axios';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { levelGet, levelSetEx } from '../services/levelCache';
import { getCacheKey } from '../utils/cacheHelpers';
import { userEventLogger } from '../utils/db';
import { AuthRequest, authenticateToken } from '../middleware/auth';
import { getUserIdByBattletag } from '../utils/userHelper';
import { PATCH_ROOT, normalizeKind } from './patchNotes';

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
    if (path.includes('/dashen-summary')) {
        return 2*3600; 
    }
    if (path.includes('/api/v2/dashen-match/detail/replies')) {
        return 3600;
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
    if (path.includes('/dashen-hero-treemap')) {
        return 24*3600;
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
    const eventType = req.path.includes('/dashen-hero-treemap') ? 'dashen-hero-treemap'
    : req.path.includes('/dashen-profile') ? 'view_profile' : req.path.includes('/dashen-summary') ? 'view_summary'
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
            try {
                await levelSetEx(cacheKey, cacheTTL, base64);
            } catch (cacheError) {
                console.error('[Cache] 图片缓存写入失败:', cacheError);
            }
            res.set('Content-Type', response.headers['content-type'] || 'image/png');
            res.send(buffer);
        } else {
            const jsonData = response.data;
            try {
                await levelSetEx(cacheKey, cacheTTL, JSON.stringify(jsonData));
            } catch (cacheError) {
                console.error('[Cache] JSON 缓存写入失败:', cacheError);
            }
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

function buildPatchRecordMd5(metadata: any): string {
    const selected = metadata?.selected;
    if (!selected || typeof selected !== 'object') {
        throw new Error('上游未返回补丁元数据');
    }

    // 补丁图每次渲染会随机更换地图背景，不能直接对图片字节取 MD5。
    // 这里对稳定的补丁内容字段取 MD5，保证同一补丁只存一份。
    const identity = [
        String(metadata.requested_kind ?? ''),
        String(metadata.selected_kind ?? ''),
        String(selected.source ?? ''),
        String(selected.source_name ?? ''),
        String(selected.url ?? ''),
        String(selected.date ?? ''),
        String(selected.date_text ?? ''),
        String(selected.title ?? ''),
        String(selected.text ?? ''),
        JSON.stringify(selected.sections ?? []),
        JSON.stringify(selected.hero_updates ?? [])
    ].join('\n');
    return crypto.createHash('md5').update(identity, 'utf8').digest('hex');
}

async function ensurePatchSidecar(dir: string, kind: string, md5: string, metadata: any) {
    if (!metadata?.selected || typeof metadata.selected !== 'object') return;
    const sidecarPath = path.join(dir, `${md5}.json`);
    try {
        await fs.access(sidecarPath);
        return;
    } catch {
        // 首次保存时写入
    }

    const selected = metadata.selected;
    const sidecar = {
        patch_kind: kind,
        md5,
        patchDate: typeof selected.date === 'string' ? selected.date : null,
        dateText: selected.date_text || '',
        title: selected.title || '',
        source: selected.source || '',
        sourceName: selected.source_name || '',
        savedAt: new Date().toISOString()
    };
    await fs.writeFile(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf8');
}

async function fetchAndStorePatchNotes(req: AuthRequest, res: any) {
    if (req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: '只有管理员可以获取版本更新' });
    }

    const kind = normalizeKind(req.body?.patch_kind);
    if (!kind) {
        return res.status(400).json({ error: 'patch_kind 必须是 small 或 big' });
    }

    const dir = path.join(PATCH_ROOT, kind);
    await fs.mkdir(dir, { recursive: true });

    let metadata: any = null;
    let md5: string | null = null;
    try {
        const metadataResponse = await axios.post(
            `${DaShenURL}/patch-notes`,
            { patch_kind: kind },
            {
                responseType: 'json',
                timeout: 30000,
                headers: { 'Content-Type': 'application/json' }
            }
        );
        metadata = metadataResponse.data;
        if (metadata?.ok === false) {
            throw new Error(metadata?.message || metadata?.error || '上游元数据失败');
        }
        md5 = buildPatchRecordMd5(metadata);
    } catch (error: any) {
        console.warn('[patch-notes] 元数据获取失败，回退图片 MD5:', error.message);
    }

    if (md5) {
        let existing: Buffer | null = null;
        try {
            existing = await fs.readFile(path.join(dir, `${md5}.png`));
        } catch (error: any) {
            if (error.code !== 'ENOENT') throw error;
        }
        if (existing) {
            try {
                await ensurePatchSidecar(dir, kind, md5, metadata);
            } catch (error) {
                console.error('[patch-notes] 元数据侧车写入失败:', error);
            }
            res.set('Content-Type', 'image/png');
            res.set('X-Patch-Kind', kind);
            res.set('X-Patch-MD5', md5);
            res.set('X-Patch-Added', '0');
            return res.send(existing);
        }
    }

    try {
        const response = await axios.post(
            `${DaShenURL}/patch-notes/image`,
            { patch_kind: kind },
            {
                responseType: 'arraybuffer',
                timeout: 90000,
                headers: { 'Content-Type': 'application/json' }
            }
        );

        const contentType = String(response.headers['content-type'] || 'image/png');
        if (!contentType.startsWith('image/')) {
            return res.status(502).json({ error: '上游未返回图片' });
        }

        const buffer = Buffer.from(response.data);
        if (buffer.length > 25 * 1024 * 1024) {
            return res.status(502).json({ error: '补丁图超过 25MB' });
        }

        if (!md5) {
            md5 = crypto.createHash('md5').update(buffer).digest('hex');
        }

        let added = false;
        try {
            await fs.writeFile(path.join(dir, `${md5}.png`), buffer, { flag: 'wx' });
            added = true;
        } catch (error: any) {
            if (error.code !== 'EEXIST') throw error;
        }

        try {
            await ensurePatchSidecar(dir, kind, md5, metadata);
        } catch (error) {
            console.error('[patch-notes] 元数据侧车写入失败:', error);
        }
        userEventLogger.logEvent({
            userId: req.user.userId,
            eventType: 'dashen-patch-notes',
            eventData: { patch_kind: kind, md5, added },
            ipAddress: req.ip
        }).catch(error => console.error('[patch-notes] 记录事件失败:', error));

        res.set('Content-Type', contentType);
        res.set('X-Patch-Kind', kind);
        res.set('X-Patch-MD5', md5);
        res.set('X-Patch-Added', added ? '1' : '0');
        res.send(buffer);
    } catch (error: any) {
        console.error('[patch-notes] 获取失败:', error.message);
        if (error.response) {
            return res.status(error.response.status).json({ error: '上游获取版本更新失败' });
        }
        res.status(502).json({ error: '获取版本更新失败' });
    }
}

// 注册路由
router.post('/patch-notes/image', authenticateToken, fetchAndStorePatchNotes);
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
router.post('/dashen-hero-treemap/image', proxyAndCache);
router.post('/dashen-match/detail/replies', proxyAndCache);

export default router;
