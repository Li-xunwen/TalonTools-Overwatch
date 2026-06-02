import { SSDLookup } from 'ssd-lookup';
import path from 'path';

let client: SSDLookup | null = null;
const CACHE_DIR = path.join(process.cwd(), 'cache');

interface CacheEntry {
  value: string;      // 存储的值（JSON 字符串或 base64）
  expireAt: number;   // 过期时间戳（毫秒）
}

export async function getSSDLookupClient(): Promise<SSDLookup> {
  if (!client) {
    client = new SSDLookup({
      dir: CACHE_DIR,
      max: 5000,          // 最多缓存 5000 个条目，防止磁盘无限增长
    });
    await client.ready();
    console.log(`✅ SSDLookup cache initialized at ${CACHE_DIR}`);
  }
  return client;
}

// 读取缓存（自动检查过期）
export async function ssdGet(key: string): Promise<string | null> {
  const cache = await getSSDLookupClient();
  const raw = await cache.get(key);
  if (!raw) return null;
  const entry: CacheEntry = JSON.parse(raw);
  if (Date.now() > entry.expireAt) {
    // 过期则删除
    await cache.del(key);
    return null;
  }
  return entry.value;
}

// 写入缓存（带 TTL，单位秒）
export async function ssdSetEx(key: string, seconds: number, value: string): Promise<void> {
  const cache = await getSSDLookupClient();
  const expireAt = Date.now() + seconds * 1000;
  const entry: CacheEntry = { value, expireAt };
  await cache.set(key, JSON.stringify(entry));
}