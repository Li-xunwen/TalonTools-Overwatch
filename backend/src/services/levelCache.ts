import { Level } from 'level';
import path from 'path';

const dbPath = path.join(process.cwd(), 'cache-db');
const db = new Level<string, any>(dbPath, { valueEncoding: 'json' });

interface CacheEntry {
  value: string;
  expireAt: number;
}

// 读取缓存（自动检查过期，并处理无效数据）
export async function levelGet(key: string): Promise<string | null> {
  try {
    const entry: unknown = await db.get(key);
    // 校验数据格式
    if (
      entry &&
      typeof entry === 'object' &&
      'value' in entry &&
      'expireAt' in entry &&
      typeof (entry as CacheEntry).expireAt === 'number'
    ) {
      const typedEntry = entry as CacheEntry;
      if (Date.now() > typedEntry.expireAt) {
        await db.del(key);
        return null;
      }
      return typedEntry.value;
    } else {
      // 数据格式无效，删除并返回 null
      await db.del(key);
      console.warn(`[Cache] Invalid entry format for key: ${key}, removed`);
      return null;
    }
  } catch (err: any) {
    if (err.code === 'LEVEL_NOT_FOUND') return null;
    console.error(`[Cache] levelGet error for key ${key}:`, err);
    return null; // 出错时返回 null，不影响主流程
  }
}

// 写入缓存（带 TTL，单位秒）
export async function levelSetEx(key: string, seconds: number, value: string): Promise<void> {
  const expireAt = Date.now() + seconds * 1000;
  await db.put(key, { value, expireAt });
}

// 清理过期条目
export async function cleanExpiredEntries() {
  try {
    for await (const [key, entry] of db.iterator()) {
      if (entry && typeof entry === 'object' && 'expireAt' in entry && Date.now() > entry.expireAt) {
        await db.del(key);
        console.log(`[Cache Cleanup] Deleted expired key: ${key}`);
      }
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

// 每小时执行一次清理
setInterval(() => {
  cleanExpiredEntries().catch(console.error);
}, 3600000);