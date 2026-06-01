import { Router } from 'express';
import axios from 'axios';
import { getRedisClient } from '../services/redisClient';
import { getCacheKey } from '../utils/cacheHelpers';

const router = Router();
const BACKEND_BASE = 'http://127.0.0.1:8080/api/v2';

async function proxyAndCache(req: any, res: any) {
  const body = req.body;

  // 动态构造目标 URL
  let targetPath = '';
  if (req.path === '/dashen-profile') {
    targetPath = '/dashen-profile/';
  } else if (req.path === '/dashen-profile/image') {
    targetPath = '/dashen-profile/image';
  } else if (req.path === '/dashen-summary/today') {
    targetPath = '/dashen-summary/today';
  } else if (req.path === '/dashen-summary/today/image') {
    targetPath = '/dashen-summary/today/image';
  } else {
    return res.status(404).json({ error: '未知的路由' });
  }

  const targetUrl = `${BACKEND_BASE}${targetPath}`;
  const isImage = targetPath.endsWith('/image');
  const cacheKey = getCacheKey(body);

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
    console.error('代理请求失败:', error);
    // 检查是否有来自上游服务的响应
    if (error.response) {
      const status = error.response.status;
      const headers = error.response.headers;
      const data = error.response.data;
      res.status(status).set(headers).send(data);
    } else {
      res.status(502).json({ 
        error: 'Bad Gateway', 
        detail: error.message 
      });
  }
}

// 定义路由
router.post('/dashen-profile', proxyAndCache);
router.post('/dashen-profile/image', proxyAndCache);
router.post('/dashen-summary/today', proxyAndCache);
router.post('/dashen-summary/today/image', proxyAndCache);

export default router;