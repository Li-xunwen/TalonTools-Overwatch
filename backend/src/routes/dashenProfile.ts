import { Router } from 'express';
import axios from 'axios';
import { getRedisClient } from '../services/redisClient';
import { getCacheKey } from '../utils/cacheHelpers';

const router = Router();

const TARGET_BASE = 'http://127.0.0.1:8080/api/v2/dashen-profile';

async function proxyAndCache(
  req: any,
  res: any,
  isImage: boolean
) {
  const body = req.body;
  if (!body.bnet_id || !body.mode) {
    return res.status(400).json({ error: '缺少必要参数: bnet_id, mode' });
  }

  const cacheKey = getCacheKey(body);
  const targetUrl = `${TARGET_BASE}${isImage ? '/image' : ''}`;
  const redis = await getRedisClient();

  // 尝试读取缓存
  const cached = await redis.get(cacheKey);
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

  console.log(`[Cache MISS] ${cacheKey}, proxying to ${targetUrl}`);
  try {
    const response = await axios.post(targetUrl, body, {
      responseType: isImage ? 'arraybuffer' : 'json',
      headers: { 'Content-Type': 'application/json' }
    });

    if (isImage) {
      const buffer = response.data;
      const base64 = buffer.toString('base64');
      await redis.setEx(cacheKey, 36000, base64);
      res.set('Content-Type', response.headers['content-type'] || 'image/png');
      res.send(buffer);
    } else {
      const jsonData = response.data;
      await redis.setEx(cacheKey, 36000, JSON.stringify(jsonData));
      res.json(jsonData);
    }
  } catch (error: any) {
    console.error('代理请求失败:', error.message);
    res.status(502).json({ error: '上游服务请求失败', detail: error.message });
  }
}

router.post('/dashen-profile', (req, res) => proxyAndCache(req, res, false));
router.post('/dashen-profile/image', (req, res) => proxyAndCache(req, res, true));
router.post('/dashen-summary/today', (req, res) => proxyAndCache(req, res, true));
router.post('/dashen-summary/today/image', (req, res) => proxyAndCache(req, res, true));
export default router;