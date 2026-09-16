/**
 * Hadoop 客户端（纯 TS，无第三方依赖）
 *
 * - HDFS 数据读写走 WebHDFS（NameNode HTTP 9870 → 307 跳转 DataNode 9864），
 *   跳转地址在服务端已配置为公网 IP，因此外网可直接跟随重定向完成上传/下载。
 * - 集群/作业信息走 YARN ResourceManager REST（公网 8050 → 内网 8088）。
 *
 * 所有地址可通过环境变量覆盖，默认值对应本项目部署的演示集群：
 *   103.236.98.149:9870（HDFS UI / WebHDFS）、:8050（YARN UI / REST）、:9864（DataNode）
 */

import http from 'http';
import { URL } from 'url';

export interface HadoopConfig {
    /** WebHDFS 基地址，例如 http://103.236.98.149:9870/webhdfs/v1 */
    webhdfsBase: string;
    /** YARN ResourceManager REST 基地址，例如 http://103.236.98.149:8050/ws/v1 */
    yarnBase: string;
    /** WebHDFS 请求使用的用户名（HDFS 里记录的文件属主） */
    user: string;
    /** 单次请求超时（毫秒） */
    timeoutMs: number;
}

export function getHadoopConfig(): HadoopConfig {
    const host = process.env.HADOOP_HOST ?? '103.236.98.149';
    return {
        webhdfsBase: process.env.HADOOP_WEBHDFS_BASE ?? `http://${host}:9870/webhdfs/v1`,
        yarnBase: process.env.HADOOP_YARN_BASE ?? `http://${host}:8050/ws/v1`,
        user: process.env.HADOOP_USER ?? 'hadoop',
        timeoutMs: Number(process.env.HADOOP_TIMEOUT_MS ?? 15000)
    };
}

function withUser(url: string, user: string): string {
    return `${url}${url.includes('?') ? '&' : '?'}user.name=${encodeURIComponent(user)}`;
}

async function timedFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

/* =========================
   HDFS（WebHDFS）
========================= */

export interface HdfsFileStatus {
    pathSuffix: string;
    type: 'FILE' | 'DIRECTORY';
    length: number;
    modificationTime: number;
    owner: string;
    permission: string;
}

/** 目录列表（不存在时返回空数组） */
export async function hdfsList(path: string): Promise<HdfsFileStatus[]> {
    const cfg = getHadoopConfig();
    const url = withUser(`${cfg.webhdfsBase}${encodeURI(path)}?op=LISTSTATUS`, cfg.user);
    const res = await timedFetch(url, { method: 'GET' }, cfg.timeoutMs);

    if (res.status === 404) return [];
    if (!res.ok) throw new Error(`LISTSTATUS 失败：HTTP ${res.status}`);

    const data = (await res.json()) as { FileStatuses?: { FileStatus?: HdfsFileStatus[] } };
    return data.FileStatuses?.FileStatus ?? [];
}

/** 创建目录（已存在则忽略） */
export async function hdfsMkdirs(path: string): Promise<void> {
    const cfg = getHadoopConfig();
    const url = withUser(`${cfg.webhdfsBase}${encodeURI(path)}?op=MKDIRS`, cfg.user);
    const res = await timedFetch(url, { method: 'PUT' }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`MKDIRS 失败：HTTP ${res.status}`);
}

/**
 * 用 Node 原生 http 发送带 body 的 PUT。
 *
 * 为什么不用 fetch：DataNode(Jetty) 对带 body 的请求会先回 `100 Continue` 再回 `201`，
 * undici 解析这段「先 100 后 201」的响应时会抛 `SocketError: bad response`
 * （实测：文件其实写成功了，但客户端报错）。Node 原生 http 客户端处理 100-continue 正常，
 * 且不会自行加上 `Expect: 100-continue`。
 */
function httpPut(url: string, body: Buffer, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
        const target = new URL(url);
        const req = http.request(
            {
                hostname: target.hostname,
                port: target.port || 80,
                path: `${target.pathname}${target.search}`,
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Content-Length': body.length
                }
            },
            (res) => {
                res.resume();
                res.on('end', () => resolve(res.statusCode ?? 0));
            }
        );

        req.setTimeout(timeoutMs, () => req.destroy(new Error('写入 DataNode 超时')));
        req.on('error', reject);
        req.end(body);
    });
}

/**
 * 写入文件：WebHDFS 的 CREATE 是「两步走」——
 * 第一次请求拿到 307 与 DataNode 地址，再把数据 PUT 到该地址。
 * 这里用 redirect: 'manual' 显式跟随，避免依赖 fetch 的自动重定向行为。
 */
export async function hdfsWrite(path: string, content: string | Buffer, overwrite = true): Promise<void> {
    const cfg = getHadoopConfig();
    const createUrl = withUser(
        `${cfg.webhdfsBase}${encodeURI(path)}?op=CREATE&overwrite=${overwrite ? 'true' : 'false'}`,
        cfg.user
    );

    const step1 = await timedFetch(createUrl, { method: 'PUT', redirect: 'manual' }, cfg.timeoutMs);
    const location = step1.headers.get('location');

    if (!location) {
        if (step1.ok) return; // 极少数实现会直接写入
        throw new Error(`CREATE 失败：HTTP ${step1.status}`);
    }

    const body = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const status = await httpPut(location, body, cfg.timeoutMs);
    if (status !== 201 && status !== 200) {
        throw new Error(`CREATE 写入数据失败：HTTP ${status}`);
    }
}

/** 读取文件文本（同样需要跟随 307 到 DataNode） */
export async function hdfsRead(path: string): Promise<string> {
    const cfg = getHadoopConfig();
    const url = withUser(`${cfg.webhdfsBase}${encodeURI(path)}?op=OPEN`, cfg.user);

    const step1 = await timedFetch(url, { method: 'GET', redirect: 'manual' }, cfg.timeoutMs);
    const location = step1.headers.get('location');

    if (!location) {
        if (step1.ok) return await step1.text();
        throw new Error(`OPEN 失败：HTTP ${step1.status}`);
    }

    const step2 = await timedFetch(location, { method: 'GET' }, cfg.timeoutMs);
    if (!step2.ok) throw new Error(`OPEN 读取数据失败：HTTP ${step2.status}`);
    return await step2.text();
}

/** 删除文件或目录（递归） */
export async function hdfsDelete(path: string, recursive = true): Promise<void> {
    const cfg = getHadoopConfig();
    const url = withUser(
        `${cfg.webhdfsBase}${encodeURI(path)}?op=DELETE&recursive=${recursive ? 'true' : 'false'}`,
        cfg.user
    );
    const res = await timedFetch(url, { method: 'DELETE' }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`DELETE 失败：HTTP ${res.status}`);
}

/* =========================
   YARN（ResourceManager REST）
========================= */

export interface YarnClusterInfo {
    id: string;
    state: string;
    version: string;
    startedOn: number;
}

export interface YarnApp {
    id: string;
    name: string;
    state: string;
    finalStatus: string;
    user: string;
    queue: string;
    startedTime: number;
    finishedTime: number;
}

export async function yarnClusterInfo(): Promise<YarnClusterInfo> {
    const cfg = getHadoopConfig();
    const res = await timedFetch(`${cfg.yarnBase}/cluster/info`, { method: 'GET' }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`YARN cluster info 失败：HTTP ${res.status}`);

    const data = (await res.json()) as { clusterInfo?: Record<string, unknown> };
    const info = data.clusterInfo ?? {};
    return {
        id: String(info.id ?? ''),
        state: String(info.state ?? ''),
        version: String(info.resourceManagerVersion ?? ''),
        startedOn: Number(info.startTime ?? 0)
    };
}

/** 最近的作业列表（默认取 20 条，最新在前） */
export async function yarnApps(limit = 20): Promise<YarnApp[]> {
    const cfg = getHadoopConfig();
    const url = `${cfg.yarnBase}/cluster/apps?limit=${limit}`;
    const res = await timedFetch(url, { method: 'GET' }, cfg.timeoutMs);
    if (!res.ok) throw new Error(`YARN apps 失败：HTTP ${res.status}`);

    const data = (await res.json()) as { apps?: { app?: Record<string, unknown>[] } | null };
    const list = data.apps?.app ?? [];
    return list.map((item) => ({
        id: String(item.id ?? ''),
        name: String(item.name ?? ''),
        state: String(item.state ?? ''),
        finalStatus: String(item.finalStatus ?? ''),
        user: String(item.user ?? ''),
        queue: String(item.queue ?? ''),
        startedTime: Number(item.startedTime ?? 0),
        finishedTime: Number(item.finishedTime ?? 0)
    }));
}
