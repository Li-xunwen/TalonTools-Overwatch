/**
 * 黑爪会议室 · Hadoop 数据面板接口
 *
 * 链路：黑爪会议室日志（API 访问 / 用户行为 / 评论）
 *   → WebHDFS 上传到 HDFS
 *   → 面板读取（或提交 MapReduce）
 *   → 生成视图：接口使用率、常用用户、评论词云、事件分布、活跃时段
 *
 * 路由前缀：/api/hadoop
 */

import { Router, Response } from 'express';
import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../utils/db';
import {
    hdfsDelete,
    hdfsList,
    hdfsMkdirs,
    hdfsRead,
    hdfsWrite,
    yarnApps,
    yarnClusterInfo,
    getHadoopConfig
} from '../services/hadoopClient';
import {
    analyticsOf,
    collectRecords,
    parseNdjson,
    toNdjson,
    wordCloudFromMrOutput,
    type TalonAnalytics
} from '../services/talonRoomLog';

const router = Router();
const execFileAsync = promisify(execFile);

// 默认所有登录用户可用；设置 HADOOP_PANEL_ADMIN_ONLY=1 后仅管理员/版主可访问
async function requirePanelAccess(req: AuthRequest, res: Response, next: () => void): Promise<void> {
    if (process.env.HADOOP_PANEL_ADMIN_ONLY !== '1') {
        next();
        return;
    }

    const userId = req.user?.userId;
    if (!userId) {
        res.status(401).json({ error: '未提供认证令牌' });
        return;
    }

    try {
        const [rows] = await pool.query<any[]>('SELECT role FROM users WHERE id = ?', [userId]);
        const role = rows[0]?.role;
        if (role !== 'ADMIN' && role !== 'MODERATOR') {
            res.status(403).json({ error: '只有管理员或版主可以查看数据面板' });
            return;
        }
        next();
    } catch (error) {
        console.error('[Hadoop 面板] 权限校验失败:', error);
        res.status(500).json({ error: '权限校验失败' });
    }
}

router.use(authenticateToken, requirePanelAccess);

// 日志在 HDFS 上的根目录
const HDFS_LOG_ROOT = process.env.HADOOP_LOG_ROOT ?? '/blacktalon/logs';
// 词云作业（Hadoop Streaming + python3 中文分词）
const STREAMING_JAR =
    process.env.HADOOP_STREAMING_JAR ??
    '/opt/hadoop/share/hadoop/tools/lib/hadoop-streaming-3.3.6.jar';
const STREAM_DIR = process.env.HADOOP_STREAM_DIR ?? '/opt/hadoop/streaming';
const WORDCLOUD_DEFAULT_OUTPUT = process.env.HADOOP_WORDCLOUD_OUTPUT ?? `${HDFS_LOG_ROOT}/wordcloud-out`;

/* =========================
   工具
========================= */

/** 只允许绝对路径 + 安全字符，杜绝把用户输入拼进远端 shell 命令 */
function safeHdfsPath(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    // 允许 = 与 - . _（Hive 风格分区目录名如 dt=2026-09-16）
    if (!/^\/[A-Za-z0-9._\-/=]*$/.test(trimmed)) return null;
    if (trimmed.includes('..')) return null;
    return trimmed;
}

function today(): string {
    return new Date().toISOString().slice(0, 10);
}

function nowText(): string {
    return new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

function fail(res: Response, error: unknown, fallback: string): void {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[Hadoop 面板] ${fallback}:`, message);
    res.status(502).json({ error: fallback, detail: message });
}

/* =========================
   集群状态
========================= */

router.get('/status', async (_req: AuthRequest, res: Response) => {
    const cfg = getHadoopConfig();
    const result: Record<string, unknown> = {
        checkedAt: nowText(),
        webhdfsBase: cfg.webhdfsBase,
        yarnBase: cfg.yarnBase,
        hdfsUser: cfg.user,
        logRoot: HDFS_LOG_ROOT
    };

    try {
        const root = await hdfsList('/');
        result.hdfs = {
            online: true,
            rootDirs: root.map((item) => item.pathSuffix)
        };
    } catch (error) {
        result.hdfs = { online: false, error: (error as Error).message };
    }

    try {
        const cluster = await yarnClusterInfo();
        result.yarn = { online: cluster.state === 'STARTED', ...cluster };
    } catch (error) {
        result.yarn = { online: false, error: (error as Error).message };
    }

    res.json(result);
});

/* =========================
   HDFS 浏览
========================= */

router.get('/fs', async (req: AuthRequest, res: Response) => {
    const target = safeHdfsPath(req.query.path ?? '/') ?? '/';
    try {
        const items = await hdfsList(target);
        res.json({
            path: target,
            items: items
                .map((item) => ({
                    name: item.pathSuffix,
                    type: item.type,
                    length: item.length,
                    modified: new Date(item.modificationTime).toISOString(),
                    owner: item.owner,
                    permission: item.permission
                }))
                .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'DIRECTORY' ? -1 : 1))
        });
    } catch (error) {
        fail(res, error, '读取 HDFS 目录失败');
    }
});

/* =========================
   日志：采集 / 上传
========================= */

// 采集（只统计，不写 HDFS）
router.post('/logs/collect', async (_req: AuthRequest, res: Response) => {
    try {
        const records = await collectRecords();
        res.json({
            collectedAt: nowText(),
            total: records.length,
            kinds: {
                api: records.filter((r) => r.kind === 'api').length,
                event: records.filter((r) => r.kind === 'event').length,
                comment: records.filter((r) => r.kind === 'comment').length,
                like: records.filter((r) => r.kind === 'like').length,
                favorite: records.filter((r) => r.kind === 'favorite').length
            }
        });
    } catch (error) {
        fail(res, error, '采集日志失败');
    }
});

// 采集 + 经 WebHDFS 上传到 HDFS
router.post('/logs/upload', async (req: AuthRequest, res: Response) => {
    try {
        const records = await collectRecords();
        if (!records.length) {
            res.status(400).json({ error: '没有可上传的日志（本地 API 日志与数据库均为空）' });
            return;
        }

        const day = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
            ? req.body.date
            : today();
        const target = `${HDFS_LOG_ROOT}/dt=${day}/blacktalon-room.ndjson`;
        const content = toNdjson(records);

        await hdfsMkdirs(`${HDFS_LOG_ROOT}/dt=${day}`);
        await hdfsWrite(target, content, true);

        const files = await hdfsList(`${HDFS_LOG_ROOT}/dt=${day}`);
        res.json({
            uploadedAt: nowText(),
            hdfsPath: target,
            lines: records.length,
            bytes: Buffer.byteLength(content, 'utf8'),
            files: files.map((f) => ({ name: f.pathSuffix, length: f.length }))
        });
    } catch (error) {
        fail(res, error, '上传日志到 HDFS 失败');
    }
});

/* =========================
   视图：接口使用率 / 常用用户 / 词云
========================= */

function analyticsPayload(source: string, analytics: TalonAnalytics): Record<string, unknown> {
    return {
        source,
        generatedAt: nowText(),
        ...analytics
    };
}

router.get('/analytics', async (req: AuthRequest, res: Response) => {
    const source = String(req.query.source ?? 'hdfs');
    const date = typeof req.query.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date)
        ? req.query.date
        : today();

    try {
        if (source === 'local') {
            const records = await collectRecords();
            res.json(analyticsPayload('local（本地日志 + 数据库）', analyticsOf(records)));
            return;
        }

        // 默认从 HDFS 读：优先当天分区，找不到就用最近一个 dt= 分区
        const root = `${HDFS_LOG_ROOT}`;
        const partitions = (await hdfsList(root)).filter((item) => item.type === 'DIRECTORY');
        if (!partitions.length) {
            res.status(404).json({ error: `HDFS 上还没有日志，请先执行「采集并上传」（${HDFS_LOG_ROOT}）` });
            return;
        }

        const preferred = partitions.find((item) => item.pathSuffix === `dt=${date}`);
        const chosen = preferred ?? partitions.sort((a, b) => b.pathSuffix.localeCompare(a.pathSuffix))[0];
        const files = (await hdfsList(`${root}/${chosen.pathSuffix}`)).filter((item) => item.type === 'FILE');
        if (!files.length) {
            res.status(404).json({ error: `${root}/${chosen.pathSuffix} 下没有日志文件` });
            return;
        }

        let text = '';
        for (const file of files) {
            text += await hdfsRead(`${root}/${chosen.pathSuffix}/${file.pathSuffix}`);
        }

        const records = parseNdjson(text);
        res.json({
            ...analyticsPayload(`hdfs（${root}/${chosen.pathSuffix}，${files.length} 个文件）`, analyticsOf(records)),
            hdfsPath: `${root}/${chosen.pathSuffix}`
        });
    } catch (error) {
        fail(res, error, '生成视图失败');
    }
});

/* =========================
   MapReduce：提交作业 / 读取结果
========================= */

router.get('/jobs/apps', async (req: AuthRequest, res: Response) => {
    const limit = Math.min(Math.max(Number(req.query.limit ?? 20), 1), 100);
    try {
        const apps = await yarnApps(limit);
        res.json({ apps: apps.map((app) => ({ ...app, durationMs: app.finishedTime > 0 ? app.finishedTime - app.startedTime : null })) });
    } catch (error) {
        fail(res, error, '读取 YARN 作业列表失败');
    }
});

interface SshConfig {
    host: string;
    port: string;
    user: string;
    key: string;
}

function getSshConfig(): SshConfig | null {
    const host = process.env.HADOOP_SSH_HOST;
    const key = process.env.HADOOP_SSH_KEY;
    if (!host || !key) return null;
    return {
        host,
        port: process.env.HADOOP_SSH_PORT ?? '22',
        user: process.env.HADOOP_SSH_USER ?? 'root',
        key
    };
}

/**
 * SSH 私钥可用性预检：把「路径写错 / 文件不存在 / 权限不对」提前翻译成中文提示，
 * 而不是让 ssh 抛一堆 "Identity file not accessible" 再给个 Permission denied。
 * 常见场景：Windows 开发机复制过来的 `.env`（C:\Users\...) 直接用在 Linux 服务器上。
 */
function checkSshKey(ssh: SshConfig): { ok: true } | { ok: false; error: string; hint: string } {
    // 只有在非 Windows 主机上才把 `C:\...` 视为路径写错（开发机就是 Windows，那种写法是对的）
    if (process.platform !== 'win32' && /^[A-Za-z]:\\/.test(ssh.key)) {
        return {
            ok: false,
            error: `SSH 私钥路径是 Windows 格式：${ssh.key}`,
            hint: '当前后端运行在 Linux 上，请把 .env 的 HADOOP_SSH_KEY 改成该服务器上的私钥绝对路径（例如 /root/.ssh/talontools_hadoop）'
        };
    }
    if (!fs.existsSync(ssh.key)) {
        return {
            ok: false,
            error: `SSH 私钥不存在：${ssh.key}`,
            hint: '确认私钥文件名与路径（ls -l ~/.ssh/），或在 .env 里把 HADOOP_SSH_KEY 指向正确位置后重启后端'
        };
    }
    try {
        fs.accessSync(ssh.key, fs.constants.R_OK);
    } catch {
        return {
            ok: false,
            error: `SSH 私钥不可读：${ssh.key}`,
            hint: '检查文件属主与权限（建议 chown 给运行后端的用户 + chmod 600）'
        };
    }
    return { ok: true };
}

/** 在集群侧执行一条远程命令（需要已配置 SSH 免密） */
async function sshExec(remoteCommand: string): Promise<{ stdout: string; stderr: string }> {
    const ssh = getSshConfig();
    if (!ssh) throw new Error('未配置 SSH 提交方式');

    return execFileAsync(
        'ssh',
        [
            '-i', ssh.key,
            '-p', ssh.port,
            '-o', 'StrictHostKeyChecking=accept-new',
            '-o', 'BatchMode=yes',
            `${ssh.user}@${ssh.host}`,
            remoteCommand
        ],
        { timeout: Number(process.env.HADOOP_JOB_TIMEOUT_MS ?? 300000), maxBuffer: 8 * 1024 * 1024 }
    );
}

function parseJobResult(combined: string) {
    return {
        jobId: /(job_\d+_\d+)/.exec(combined)?.[1] ?? '',
        success: /completed successfully/.test(combined),
        counters: {
            mapTasks: Number(/Launched map tasks=(\d+)/.exec(combined)?.[1] ?? 0),
            reduceTasks: Number(/Launched reduce tasks=(\d+)/.exec(combined)?.[1] ?? 0)
        }
    };
}

/* =========================
   词云作业：Hadoop Streaming + python3 中文分词
   —— WordCount 按空格切词，中文评论切不出词，所以词云改用自己的 mapper/reducer
========================= */

const WORDCLOUD_MAPPER = `#!/usr/bin/env python3
# 黑爪会议室词云 mapper（与后端 talonRoomLog.tokenizeWeighted 同一套规则）
#   1) 短句整体作为一个条目（权重 3）：重复的整句能直接变成高频词
#   2) 中文按 2 字词切分；单个字也收录
#   3) 英文按单词切分
import sys, json, re

STOP = set("""的 了 是 我 你 他 她 它 们 在 有 和 就 不 也 都 而 及 与 着 或 一个 这个 那个 我们 你们 他们 自己 啊 吧 呢 吗 哦 哈 嗯 这 那 上 下 很 还 会 要 给 很 the and for you are but not with this that have from was were his her has had they them its our your can will would there here what when who how why all any""".split())
LATIN = re.compile(r"[a-z][a-z0-9_'-]+")
CJK_SEG = re.compile(r"[\\u4e00-\\u9fa5]+")
CJK_CHAR = re.compile(r"[\\u4e00-\\u9fa5]")

PHRASE_WEIGHT = 3
PHRASE_MAX_CJK = 12
PHRASE_MAX_CHARS = 24
PHRASE_MAX_WORDS = 4


def emit(word, weight=1):
    if word and word not in STOP:
        print("%s\\t%d" % (word, weight))


def normalize(text):
    t = text.strip().lower()
    t = re.sub(r"[^\\w\\u4e00-\\u9fa5]+", " ", t)
    t = re.sub(r"\\s+", " ", t).strip()
    if CJK_CHAR.search(t):
        t = t.replace(" ", "")
    return t


def is_short_phrase(phrase):
    if not phrase:
        return False
    cjk = len(CJK_CHAR.findall(phrase))
    words = [w for w in phrase.split(" ") if w]
    if cjk > 0:
        return cjk <= PHRASE_MAX_CJK and len(phrase) <= PHRASE_MAX_CHARS
    return 1 < len(words) <= PHRASE_MAX_WORDS


for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        record = json.loads(line)
    except Exception:
        continue
    if record.get("kind") != "comment":
        continue
    raw = record.get("text") or ""
    text = raw.lower()

    # 1) 短句整体作为一个条目
    phrase = normalize(raw)
    if len(phrase) >= 2 and is_short_phrase(phrase) and not phrase.isdigit():
        emit(phrase, PHRASE_WEIGHT)

    # 2) 英文单词
    for m in LATIN.finditer(text):
        emit(m.group(0))

    # 3) 中文：2 字词；单字句收单字
    for m in CJK_SEG.finditer(text):
        seg = m.group(0)
        if len(seg) == 1:
            emit(seg)
            continue
        for i in range(len(seg) - 1):
            emit(seg[i:i + 2])
`;

const WORDCLOUD_REDUCER = `#!/usr/bin/env python3
# 黑爪会议室词云 reducer：对相同词计数求和
import sys

current = None
total = 0

for line in sys.stdin:
    line = line.rstrip("\\n")
    if "\\t" not in line:
        continue
    word, _, raw = line.rpartition("\\t")
    try:
        count = int(raw)
    except ValueError:
        continue
    if word == current:
        total += count
    else:
        if current is not None:
            print("%s\\t%d" % (current, total))
        current = word
        total = count

if current is not None:
    print("%s\\t%d" % (current, total))
`;

/** 把 mapper/reducer 传到集群（base64 传输，避免引号/换行问题），已存在则覆盖 */
async function provisionWordCloudScripts(): Promise<void> {
    const mapper = Buffer.from(WORDCLOUD_MAPPER, 'utf8').toString('base64');
    const reducer = Buffer.from(WORDCLOUD_REDUCER, 'utf8').toString('base64');

    const remote =
        `su - hadoop -c 'mkdir -p ${STREAM_DIR} && ` +
        `echo ${mapper} | base64 -d > ${STREAM_DIR}/wordcloud_mapper.py && ` +
        `echo ${reducer} | base64 -d > ${STREAM_DIR}/wordcloud_reducer.py && ` +
        `chmod +x ${STREAM_DIR}/wordcloud_mapper.py ${STREAM_DIR}/wordcloud_reducer.py'`;

    await sshExec(remote);
}

// 提交词云作业：输入是黑爪会议室日志（NDJSON），输出是 word<TAB>count
router.post('/jobs/wordcloud', async (req: AuthRequest, res: Response) => {
    const ssh = getSshConfig();
    if (!ssh) {
        res.status(501).json({
            error: '未配置 SSH 提交方式',
            hint: '在 backend/.env 里补 HADOOP_SSH_* 后重启后端'
        });
        return;
    }

    const keyCheck = checkSshKey(ssh);
    if (!keyCheck.ok) {
        res.status(400).json({ error: keyCheck.error, hint: keyCheck.hint });
        return;
    }

    const day = typeof req.body?.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)
        ? req.body.date
        : today();
    const input = safeHdfsPath(req.body?.input ?? `${HDFS_LOG_ROOT}/dt=${day}`);
    const output = safeHdfsPath(req.body?.output ?? WORDCLOUD_DEFAULT_OUTPUT);
    if (!input || !output) {
        res.status(400).json({ error: 'HDFS 路径不合法' });
        return;
    }

    try {
        await provisionWordCloudScripts();

        const remote =
            `su - hadoop -c 'export JAVA_HOME=/usr/lib/jvm/java-11-openjdk-amd64; ` +
            `export HADOOP_CONF_DIR=/opt/hadoop/etc/hadoop; export PATH=/opt/hadoop/bin:$PATH; ` +
            `hdfs dfs -rm -r -f ${output} >/dev/null 2>&1; ` +
            `hadoop jar ${STREAMING_JAR} ` +
            `-files ${STREAM_DIR}/wordcloud_mapper.py,${STREAM_DIR}/wordcloud_reducer.py ` +
            `-mapper wordcloud_mapper.py -reducer wordcloud_reducer.py ` +
            `-input ${input} -output ${output}'`;

        const { stdout, stderr } = await sshExec(remote);
        const combined = `${stdout}\n${stderr}`;
        const parsed = parseJobResult(combined);

        if (!parsed.success) {
            res.status(502).json({
                error: '词云作业未成功完成',
                jobId: parsed.jobId,
                input,
                output,
                tail: combined.slice(-1500)
            });
            return;
        }

        res.json({
            submittedAt: nowText(),
            kind: 'streaming',
            jobId: parsed.jobId,
            input,
            output,
            counters: parsed.counters,
            tail: combined.slice(-400)
        });
    } catch (error) {
        fail(res, error, '提交词云作业失败');
    }
});

// 读取词云作业结果
router.get('/jobs/wordcloud/result', async (req: AuthRequest, res: Response) => {
    const dir = safeHdfsPath(req.query.path ?? WORDCLOUD_DEFAULT_OUTPUT);
    if (!dir) {
        res.status(400).json({ error: 'HDFS 路径不合法' });
        return;
    }

    try {
        const files = await hdfsList(dir);
        const partFiles = files.filter((item) => item.type === 'FILE' && item.pathSuffix.startsWith('part-'));
        if (!partFiles.length) {
            res.status(404).json({ error: `${dir} 下没有 part-* 结果文件` });
            return;
        }

        let text = '';
        for (const file of partFiles) text += await hdfsRead(`${dir}/${file.pathSuffix}`);

        res.json({
            generatedAt: nowText(),
            kind: 'streaming',
            path: dir,
            files: partFiles.map((f) => f.pathSuffix),
            words: wordCloudFromMrOutput(text, 80)
        });
    } catch (error) {
        fail(res, error, '读取词云作业结果失败');
    }
});

// 清理 HDFS 上的日志分区（谨慎操作，面板上不暴露删除按钮，仅接口预留）
router.delete('/logs', async (req: AuthRequest, res: Response) => {
    const target = safeHdfsPath(req.query.path);
    if (!target || !target.startsWith(HDFS_LOG_ROOT)) {
        res.status(400).json({ error: `只能删除 ${HDFS_LOG_ROOT} 下的路径` });
        return;
    }
    try {
        await hdfsDelete(target);
        res.json({ deleted: target });
    } catch (error) {
        fail(res, error, '删除 HDFS 路径失败');
    }
});

export default router;
