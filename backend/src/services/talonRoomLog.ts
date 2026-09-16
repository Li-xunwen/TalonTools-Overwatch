/**
 * 黑爪会议室日志：采集、导出与聚合
 *
 * 日志由三类记录组成（统一 NDJSON，一行一条）：
 *   { "kind": "api",     "ts", "user", "method", "path", "status", "ms", "ip" }
 *   { "kind": "event",   "ts", "user", "eventType", "ip" }
 *   { "kind": "comment", "ts", "user", "text", "pageId" }
 *
 * 来源：
 *   - api     ：本项目 API 请求（中间件 apiLog 实时追加到本地文件）
 *   - event   ：MySQL user_events 表（登录 / 点赞 / 评论 / 上传等行为）
 *   - comment ：MySQL pages_comments 表（评论正文，用于词云）
 *
 * 用途：导出后经 WebHDFS 上传到 Hadoop，再由面板读取（或跑 MapReduce）生成视图。
 */

import fs from 'fs';
import path from 'path';
import { pool } from '../utils/db';

/* =========================
   类型
========================= */

export type TalonLogKind = 'api' | 'event' | 'comment' | 'like' | 'favorite';

export interface TalonLogRecord {
    kind: TalonLogKind;
    ts: string;
    user: string;
    userId?: number;
    /* api */
    method?: string;
    path?: string;
    status?: number;
    ms?: number;
    ip?: string;
    /* event */
    eventType?: string;
    /* comment */
    text?: string;
    pageId?: number;
    /** 文本来自哪张表：pages_comments（评论）/ ratings（评价） */
    textFrom?: 'comment' | 'rating';
    /* like：点赞关系 */
    toUser?: string;
    likeCount?: number;
    /* favorite：常用英雄 */
    hero?: string;
}

export interface ApiUsageItem {
    path: string;
    method: string;
    count: number;
    percent: number;
}

export interface ActiveUserItem {
    user: string;
    userId: number | null;
    count: number;
    percent: number;
    apiCount: number;
    eventCount: number;
    commentCount: number;
    lastSeen: string;
}

export interface WordCloudItem {
    word: string;
    count: number;
}

export interface TalonAnalytics {
    totalRecords: number;
    kinds: { api: number; event: number; comment: number; like: number; favorite: number };
    range: { from: string; to: string };
    apiUsage: ApiUsageItem[];
    activeUsers: ActiveUserItem[];
    wordCloud: WordCloudItem[];
    eventTypes: { type: string; count: number }[];
    /** 活跃时段（Asia/Shanghai）：全部活动 / 仅登录 */
    hourly: { hour: number; count: number }[];
    loginHourly: { hour: number; count: number }[];
    /** 点赞榜：被点赞最多的人 */
    likeRanking: { user: string; likes: number; fromUsers: number }[];
    /** 英雄热度：用户常用英雄排行 */
    heroRanking: { hero: string; count: number }[];
    /** 按天趋势（Asia/Shanghai，最近 14 天） */
    daily: { date: string; total: number; login: number; register: number }[];
}

/* =========================
   本地日志文件
========================= */

const LOG_DIR = process.env.TALON_LOG_DIR ?? path.join(process.cwd(), 'logs');

function logFilePath(date = new Date()): string {
    const day = date.toISOString().slice(0, 10);
    return path.join(LOG_DIR, `blacktalon-room-${day}.ndjson`);
}

/** API 请求日志落盘（中间件调用；失败只告警，不影响业务） */
export function appendApiLog(record: TalonLogRecord): void {
    try {
        fs.mkdirSync(LOG_DIR, { recursive: true });
        fs.appendFileSync(logFilePath(new Date(record.ts)), JSON.stringify(record) + '\n', 'utf8');
    } catch (error) {
        console.error('[黑爪会议室日志] 写入失败:', error);
    }
}

/** 读取本地已落盘的 API 日志（默认最近 N 天） */
export function readLocalApiLogs(days = 7): TalonLogRecord[] {
    const records: TalonLogRecord[] = [];
    if (!fs.existsSync(LOG_DIR)) return records;

    const cutoff = Date.now() - days * 24 * 3600 * 1000;
    for (const name of fs.readdirSync(LOG_DIR)) {
        if (!name.startsWith('blacktalon-room-') || !name.endsWith('.ndjson')) continue;
        const full = path.join(LOG_DIR, name);
        if (fs.statSync(full).mtimeMs < cutoff) continue;
        for (const line of fs.readFileSync(full, 'utf8').split('\n')) {
            const text = line.trim();
            if (!text) continue;
            try {
                records.push(JSON.parse(text) as TalonLogRecord);
            } catch {
                // 跳过坏行
            }
        }
    }
    return records;
}

/* =========================
   从 MySQL 采集行为 / 评论
========================= */

export async function readUserEvents(limit = 5000): Promise<TalonLogRecord[]> {
    try {
        const [rows] = await pool.query<any[]>(
            `SELECT e.user_id, e.event_type, e.event_time, e.ip_address, u.battletag
               FROM user_events e
               LEFT JOIN users u ON u.id = e.user_id
              ORDER BY e.event_time DESC
              LIMIT ?`,
            [limit]
        );
        return rows.map((row) => ({
            kind: 'event' as const,
            ts: new Date(row.event_time).toISOString(),
            user: row.battletag ?? `#${row.user_id}`,
            userId: Number(row.user_id),
            eventType: String(row.event_type ?? 'unknown'),
            ip: row.ip_address ?? undefined
        }));
    } catch (error) {
        console.error('[黑爪会议室日志] 读取 user_events 失败:', error);
        return [];
    }
}

export async function readComments(limit = 5000): Promise<TalonLogRecord[]> {
    try {
        const [rows] = await pool.query<any[]>(
            `SELECT c.id, c.page_id, c.content, c.created_at, c.user_id, u.battletag
               FROM pages_comments c
               LEFT JOIN users u ON u.id = c.user_id
              WHERE c.deleted = 0
              ORDER BY c.created_at DESC
              LIMIT ?`,
            [limit]
        );
        return rows
            .map((row) => ({
                kind: 'comment' as const,
                ts: new Date(row.created_at).toISOString(),
                user: row.battletag ?? `#${row.user_id}`,
                userId: Number(row.user_id),
                pageId: Number(row.page_id),
                text: String(row.content ?? ''),
                textFrom: 'comment' as const
            }))
            .filter((item) => item.text.trim().length > 0);
    } catch (error) {
        console.error('[黑爪会议室日志] 读取 pages_comments 失败:', error);
        return [];
    }
}

/**
 * 用户评价（ratings.content）：也是「评论」语料，用于词云。
 * 表结构：from_user_id / to_user_id / content / created_at
 */
export async function readRatings(limit = 5000): Promise<TalonLogRecord[]> {
    try {
        const [rows] = await pool.query<any[]>(
            `SELECT r.from_user_id, r.to_user_id, r.content, r.created_at, u.battletag
               FROM ratings r
               LEFT JOIN users u ON u.id = r.from_user_id
              WHERE r.content IS NOT NULL AND r.content <> ''
              ORDER BY r.created_at DESC
              LIMIT ?`,
            [limit]
        );
        return rows
            .map((row) => ({
                kind: 'comment' as const,
                ts: new Date(row.created_at).toISOString(),
                user: row.battletag ?? `#${row.from_user_id}`,
                userId: Number(row.from_user_id),
                text: String(row.content ?? ''),
                textFrom: 'rating' as const
            }))
            .filter((item) => item.text.trim().length > 0);
    } catch (error) {
        console.error('[黑爪会议室日志] 读取 ratings 失败:', error);
        return [];
    }
}

/**
 * 点赞关系（likes）：from_user_id → to_user_id，like_count 为累计次数
 * 用于「点赞榜：被点赞最多的人」
 */
export async function readLikes(limit = 20000): Promise<TalonLogRecord[]> {
    try {
        const [rows] = await pool.query<any[]>(
            `SELECT l.from_user_id, l.to_user_id, l.like_count, l.updated_at,
                    uf.battletag AS from_tag, ut.battletag AS to_tag
               FROM likes l
               LEFT JOIN users uf ON uf.id = l.from_user_id
               LEFT JOIN users ut ON ut.id = l.to_user_id
              ORDER BY l.updated_at DESC
              LIMIT ?`,
            [limit]
        );
        return rows.map((row) => ({
            kind: 'like' as const,
            ts: new Date(row.updated_at ?? Date.now()).toISOString(),
            user: row.from_tag ?? `#${row.from_user_id}`,
            userId: Number(row.from_user_id),
            toUser: row.to_tag ?? `#${row.to_user_id}`,
            likeCount: Number(row.like_count ?? 1)
        }));
    } catch (error) {
        console.error('[黑爪会议室日志] 读取 likes 失败:', error);
        return [];
    }
}

/**
 * 用户常用英雄（user_favorite_heroes + heroes 中文名）
 * 用于「英雄热度排行」
 */
export async function readFavorites(limit = 20000): Promise<TalonLogRecord[]> {
    try {
        const [rows] = await pool.query<any[]>(
            `SELECT f.user_id, f.hero_id, f.created_at, h.zh_name, h.name, u.battletag
               FROM user_favorite_heroes f
               LEFT JOIN heroes h ON h.id = f.hero_id
               LEFT JOIN users u ON u.id = f.user_id
              ORDER BY f.created_at DESC
              LIMIT ?`,
            [limit]
        );
        return rows.map((row) => ({
            kind: 'favorite' as const,
            ts: new Date(row.created_at ?? Date.now()).toISOString(),
            user: row.battletag ?? `#${row.user_id}`,
            userId: Number(row.user_id),
            hero: String(row.zh_name || row.name || `英雄#${row.hero_id}`)
        }));
    } catch (error) {
        console.error('[黑爪会议室日志] 读取 user_favorite_heroes 失败:', error);
        return [];
    }
}

/** 汇总三类记录（本地 API 日志 + 行为 + 评论） */
export async function collectRecords(): Promise<TalonLogRecord[]> {
    const [api, events, comments, ratings, likes, favorites] = await Promise.all([
        Promise.resolve(readLocalApiLogs()),
        readUserEvents(),
        readComments(),
        readRatings(),
        readLikes(),
        readFavorites()
    ]);
    return [...api, ...events, ...comments, ...ratings, ...likes, ...favorites].sort((a, b) =>
        a.ts.localeCompare(b.ts)
    );
}

export function toNdjson(records: TalonLogRecord[]): string {
    return records.map((record) => JSON.stringify(record)).join('\n') + '\n';
}

/* =========================
   聚合：把日志变成视图数据
========================= */

// 路径归一化：/api/users/123/avatar → /api/users/:id/avatar
function normalizePath(raw: string): string {
    return raw
        .split('?')[0]
        .replace(/\/\d+(?=\/|$)/g, '/:id')
        .replace(/\/[0-9a-f]{16,}(?=\/|$)/gi, '/:id');
}

// 词云停用词（中英混合，够用即可）
const STOP_WORDS = new Set([
    'the', 'and', 'for', 'you', 'are', 'but', 'not', 'with', 'this', 'that', 'have', 'from',
    'was', 'were', 'his', 'her', 'has', 'had', 'they', 'them', 'its', 'our', 'your', 'can',
    'will', 'would', 'there', 'here', 'what', 'when', 'who', 'how', 'why', 'all', 'any',
    '的', '了', '是', '我', '你', '他', '她', '它', '们', '在', '有', '和', '就', '不', '也',
    '都', '而', '及', '与', '着', '或', '一个', '这个', '那个', '我们', '你们', '他们', '自己',
    '啊', '吧', '呢', '吗', '哦', '哈', '嗯', '这', '那', '上', '下', '很', '还', '会', '要'
]);

/** 中英混合分词：拉丁词按非字母切分，连续中文切成 2 字词（近似 bigram） */
export function tokenize(text: string): string[] {
    const tokens: string[] = [];
    const lower = text.toLowerCase();

    // 拉丁词
    for (const match of lower.matchAll(/[a-z][a-z0-9_'-]{1,}/g)) {
        const word = match[0];
        if (!STOP_WORDS.has(word)) tokens.push(word);
    }

    // 中文：先取连续中文串，再切成相邻 2 字组合
    for (const match of text.matchAll(/[\u4e00-\u9fa5]{2,}/g)) {
        const seg = match[0];
        for (let i = 0; i + 2 <= seg.length; i++) {
            const gram = seg.slice(i, i + 2);
            if (!STOP_WORDS.has(gram)) tokens.push(gram);
        }
    }

    return tokens;
}

/** 解析 NDJSON 文本为记录数组（坏行忽略） */
export function parseNdjson(text: string): TalonLogRecord[] {
    const records: TalonLogRecord[] = [];
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            records.push(JSON.parse(trimmed) as TalonLogRecord);
        } catch {
            // 忽略坏行
        }
    }
    return records;
}

// 统计口径统一用北京时间（服务器与日志为 UTC）
const CN_OFFSET_MS = 8 * 3600 * 1000;

function cnHour(ts: string): number {
    return new Date(new Date(ts).getTime() + CN_OFFSET_MS).getUTCHours();
}

function cnDate(ts: string): string {
    return new Date(new Date(ts).getTime() + CN_OFFSET_MS).toISOString().slice(0, 10);
}

/** 核心聚合：接口使用率 / 常用用户 / 评论词云 / 活跃时段 / 点赞榜 / 英雄热度 / 按天趋势 */
export function analyticsOf(records: TalonLogRecord[], topN = 20): TalonAnalytics {
    const apiMap = new Map<string, ApiUsageItem>();
    const userMap = new Map<string, ActiveUserItem>();
    const wordMap = new Map<string, number>();
    const eventMap = new Map<string, number>();
    const hourBuckets = new Array(24).fill(0) as number[];
    const loginHourBuckets = new Array(24).fill(0) as number[];
    const likeMap = new Map<string, { user: string; likes: number; from: Set<string> }>();
    const heroMap = new Map<string, number>();
    const dailyMap = new Map<string, { date: string; total: number; login: number; register: number }>();

    let apiTotal = 0;
    let minTs = '';
    let maxTs = '';

    for (const record of records) {
        if (!record.ts) continue;
        if (!minTs || record.ts < minTs) minTs = record.ts;
        if (!maxTs || record.ts > maxTs) maxTs = record.ts;

        const hour = cnHour(record.ts);
        if (hour >= 0 && hour < 24) hourBuckets[hour] += 1;

        const dayKey = cnDate(record.ts);
        const day = dailyMap.get(dayKey) ?? { date: dayKey, total: 0, login: 0, register: 0 };
        day.total += 1;
        dailyMap.set(dayKey, day);

        // 常用用户
        const userKey = record.user || '未知用户';
        let userItem = userMap.get(userKey);
        if (!userItem) {
            userItem = {
                user: userKey,
                userId: record.userId ?? null,
                count: 0,
                percent: 0,
                apiCount: 0,
                eventCount: 0,
                commentCount: 0,
                lastSeen: record.ts
            };
            userMap.set(userKey, userItem);
        }
        userItem.count += 1;
        if (record.ts > userItem.lastSeen) userItem.lastSeen = record.ts;

        if (record.kind === 'api') {
            apiTotal += 1;
            userItem.apiCount += 1;
            const normalized = normalizePath(record.path ?? '/');
            const key = `${record.method ?? 'GET'} ${normalized}`;
            const item = apiMap.get(key) ?? {
                path: normalized,
                method: record.method ?? 'GET',
                count: 0,
                percent: 0
            };
            item.count += 1;
            apiMap.set(key, item);
        } else if (record.kind === 'event') {
            userItem.eventCount += 1;
            const type = record.eventType ?? 'unknown';
            eventMap.set(type, (eventMap.get(type) ?? 0) + 1);
            if (type === 'login') {
                loginHourBuckets[cnHour(record.ts)] += 1;
                day.login += 1;
            } else if (type === 'create_user') {
                day.register += 1;
            }
        } else if (record.kind === 'comment') {
            userItem.commentCount += 1;
            for (const token of tokenize(record.text ?? '')) {
                wordMap.set(token, (wordMap.get(token) ?? 0) + 1);
            }
        } else if (record.kind === 'like') {
            const target = record.toUser || '未知用户';
            const item = likeMap.get(target) ?? { user: target, likes: 0, from: new Set<string>() };
            item.likes += record.likeCount ?? 1;
            if (record.user) item.from.add(record.user);
            likeMap.set(target, item);
        } else if (record.kind === 'favorite') {
            const hero = record.hero ?? '未知英雄';
            heroMap.set(hero, (heroMap.get(hero) ?? 0) + 1);
        }
    }

    const totalUserRecords = records.length || 1;
    const apiUsage = [...apiMap.values()]
        .map((item) => ({ ...item, percent: apiTotal ? Number(((item.count / apiTotal) * 100).toFixed(2)) : 0 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);

    const activeUsers = [...userMap.values()]
        .map((item) => ({ ...item, percent: Number(((item.count / totalUserRecords) * 100).toFixed(2)) }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);

    const wordCloud = [...wordMap.entries()]
        .map(([word, count]) => ({ word, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 60);

    const eventTypes = [...eventMap.entries()]
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count);

    const likeRanking = [...likeMap.values()]
        .map((item) => ({ user: item.user, likes: item.likes, fromUsers: item.from.size }))
        .sort((a, b) => b.likes - a.likes)
        .slice(0, topN);

    const heroRanking = [...heroMap.entries()]
        .map(([hero, count]) => ({ hero, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, topN);

    // 最近 14 天（北京时间），缺失的日期补 0，保证趋势图连续
    const daily: TalonAnalytics['daily'] = [];
    const today = new Date(Date.now() + CN_OFFSET_MS).toISOString().slice(0, 10);
    for (let i = 13; i >= 0; i--) {
        const date = new Date(new Date(`${today}T00:00:00Z`).getTime() - i * 86400000)
            .toISOString()
            .slice(0, 10);
        daily.push(dailyMap.get(date) ?? { date, total: 0, login: 0, register: 0 });
    }

    return {
        totalRecords: records.length,
        kinds: {
            api: records.filter((r) => r.kind === 'api').length,
            event: records.filter((r) => r.kind === 'event').length,
            comment: records.filter((r) => r.kind === 'comment').length,
            like: records.filter((r) => r.kind === 'like').length,
            favorite: records.filter((r) => r.kind === 'favorite').length
        },
        range: { from: minTs, to: maxTs },
        apiUsage,
        activeUsers,
        wordCloud,
        eventTypes,
        hourly: hourBuckets.map((count, hour) => ({ hour, count })),
        loginHourly: loginHourBuckets.map((count, hour) => ({ hour, count })),
        likeRanking,
        heroRanking,
        daily
    };
}

/** 把 MapReduce(wordcount) 的输出文本转成词云数据 */
export function wordCloudFromMrOutput(text: string, topN = 60): WordCloudItem[] {
    const items: WordCloudItem[] = [];
    for (const line of text.split('\n')) {
        const [word, count] = line.split('\t');
        if (!word || !count) continue;
        const n = Number(count);
        if (!Number.isFinite(n)) continue;
        if (STOP_WORDS.has(word.toLowerCase())) continue;
        items.push({ word, count: n });
    }
    return items.sort((a, b) => b.count - a.count).slice(0, topN);
}
