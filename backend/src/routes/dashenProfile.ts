// dashenProfile.ts
import { Router } from 'express';
import axios from 'axios';
import { levelGet, levelSetEx } from '../services/levelCache';
import { getCacheKey } from '../utils/cacheHelpers';

const router = Router();
const DaShenURL = process.env.DASHEN_URL;

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

  const targetUrl = `${DaShenURL}${targetPath}`;
  const isImage = targetPath.endsWith('/image');
  const cacheKey = getCacheKey(body);

  // 1. 尝试从 LevelDB 读取缓存
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

  console.log(`[Cache MISS] ${cacheKey}, proxying to ${targetUrl}`);
  try {
    const response = await axios.post(targetUrl, body, {
      responseType: isImage ? 'arraybuffer' : 'json',
      headers: { 'Content-Type': 'application/json' }
    });

    if (isImage) {
      const buffer = response.data;
      const base64 = buffer.toString('base64');
      await levelSetEx(cacheKey, 36000, base64);
      res.set('Content-Type', response.headers['content-type'] || 'image/png');
      res.send(buffer);
    } else {
      const jsonData = response.data;
      await levelSetEx(cacheKey, 36000, JSON.stringify(jsonData));
      res.json(jsonData);
    }
  } catch (error: any) {
    console.error('代理请求失败:', error);
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

router.post('/dashen-profile', proxyAndCache);
router.post('/dashen-profile/image', proxyAndCache);
router.post('/dashen-summary/today', proxyAndCache);
router.post('/dashen-summary/today/image', proxyAndCache);

export default router;