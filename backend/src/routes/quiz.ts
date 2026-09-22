import express, { Response, Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool, userEventLogger } from '../utils/db';

const router = Router();

/* =========================
   工具：题目数据的读取与校验
========================= */

export interface QuizOption {
    key: string;
    text: string;
}

export interface QuizResources {
    images: string[];
    videos: string[];
    audios: string[];
}

const MAX_TITLE = 255;
const MAX_OPTIONS = 8;
const MAX_TAGS = 12;
const MAX_RESOURCE = 20;
// 答题时长：默认 10s，允许 5~60s
const DEFAULT_ANSWER_SECONDS = 10;
const MIN_ANSWER_SECONDS = 5;
const MAX_ANSWER_SECONDS = 60;

function parseJsonColumn<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value as T;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function asStringArray(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, limit);
}

function normalizeOptions(value: unknown): QuizOption[] {
    if (!Array.isArray(value)) return [];
    const list = value
        .map((item, index) => {
            const raw = item as { key?: unknown; text?: unknown };
            const text = String(raw?.text ?? '').trim().slice(0, 500);
            const key = String(raw?.key ?? '').trim().toUpperCase() || String.fromCharCode(65 + index);
            return { key, text };
        })
        .filter((item) => item.text)
        .slice(0, MAX_OPTIONS);

    // 选项 key 统一成 A/B/C/D…，避免前端传进来乱序
    return list.map((item, index) => ({ key: String.fromCharCode(65 + index), text: item.text }));
}

function normalizeResources(value: unknown): QuizResources {
    const raw = (value ?? {}) as Record<string, unknown>;
    return {
        images: asStringArray(raw.images, MAX_RESOURCE),
        videos: asStringArray(raw.videos, MAX_RESOURCE),
        audios: asStringArray(raw.audios, MAX_RESOURCE)
    };
}

function clampDifficulty(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return 128;
    return Math.max(0, Math.min(255, Math.round(num)));
}

function normalizeAnswerSeconds(value: unknown): number {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return DEFAULT_ANSWER_SECONDS;
    return Math.max(MIN_ANSWER_SECONDS, Math.min(MAX_ANSWER_SECONDS, Math.round(num)));
}

interface QuestionPayload {
    title: string;
    subtitle: string;
    options: QuizOption[];
    answer: string;
    explanation: string;
    resources: QuizResources;
    tags: string[];
    difficulty: number;
    answerSeconds: number;
    status: 'published' | 'draft';
}

function normalizePayload(body: any): { ok: boolean; message?: string; data?: QuestionPayload } {
    const title = String(body?.title ?? '').trim().slice(0, MAX_TITLE);
    if (!title) return { ok: false, message: '题干不能为空' };

    const options = normalizeOptions(body?.options);
    if (options.length < 2) return { ok: false, message: '至少需要两个选项' };

    const answer = String(body?.answer ?? '').trim().toUpperCase();
    if (!options.some((option) => option.key === answer)) {
        return { ok: false, message: '正确答案必须是选项之一' };
    }

    return {
        ok: true,
        data: {
            title,
            subtitle: String(body?.subtitle ?? '').trim().slice(0, MAX_TITLE),
            options,
            answer,
            explanation: String(body?.explanation ?? '').slice(0, 20000),
            resources: normalizeResources(body?.resources),
            tags: asStringArray(body?.tags, MAX_TAGS),
            difficulty: clampDifficulty(body?.difficulty),
            answerSeconds: normalizeAnswerSeconds(body?.answerSeconds),
            status: body?.status === 'draft' ? 'draft' : 'published'
        }
    };
}

function mapQuestion(row: any) {
    return {
        id: Number(row.id),
        title: String(row.title ?? ''),
        subtitle: String(row.subtitle ?? ''),
        options: parseJsonColumn<QuizOption[]>(row.options, []),
        answer: String(row.answer ?? ''),
        explanation: String(row.explanation ?? ''),
        resources: parseJsonColumn<QuizResources>(row.resources, { images: [], videos: [], audios: [] }),
        tags: parseJsonColumn<string[]>(row.tags, []),
        difficulty: Number(row.difficulty ?? 0),
        // 没有该字段（历史数据 / 未迁移）时按 10s
        answerSeconds: normalizeAnswerSeconds(row.answer_seconds),
        disputeCount: Number(row.dispute_count ?? 0),
        answerCount: Number(row.answer_count ?? 0),
        correctCount: Number(row.correct_count ?? 0),
        accuracy: Number(row.accuracy ?? 0),
        status: String(row.status ?? 'published'),
        version: Number(row.version ?? 1),
        createdBy: row.created_by === null ? null : Number(row.created_by),
        updatedBy: row.updated_by === null ? null : Number(row.updated_by),
        updatedByName: row.updated_by_battletag ? displayNameOf(String(row.updated_by_battletag)) : '',
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
    };
}

function mapRevision(row: any) {
    return {
        id: Number(row.id),
        questionId: Number(row.question_id),
        version: Number(row.version ?? 1),
        action: String(row.action ?? 'update'),
        snapshot: parseJsonColumn<Record<string, unknown>>(row.snapshot, {}),
        summary: String(row.summary ?? ''),
        createdBy: row.created_by === null ? null : Number(row.created_by),
        createdByName: String(row.created_by_name ?? ''),
        createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now()
    };
}

function displayNameOf(battletag: string): string {
    return String(battletag ?? '').split('#')[0] || String(battletag ?? '');
}

// 改动摘要：便于在提交历史里一眼看出改了什么
function buildSummary(previous: any | null, next: QuestionPayload): string {
    if (!previous) return '创建题目';

    const before = mapQuestion(previous);
    const changes: string[] = [];
    if (before.title !== next.title) changes.push('题干');
    if (before.subtitle !== next.subtitle) changes.push('副标题');
    if (JSON.stringify(before.options) !== JSON.stringify(next.options)) changes.push('选项');
    if (before.answer !== next.answer) changes.push('答案');
    if (before.explanation !== next.explanation) changes.push('答案解析');
    if (JSON.stringify(before.resources) !== JSON.stringify(next.resources)) changes.push('资源');
    if (JSON.stringify(before.tags) !== JSON.stringify(next.tags)) changes.push('标签');
    if (before.difficulty !== next.difficulty) changes.push('难度');
    if (before.answerSeconds !== next.answerSeconds) changes.push('答题时长');
    if (before.status !== next.status) changes.push('状态');

    return changes.length ? `修改：${changes.join('、')}` : '提交（内容无变化）';
}

async function loadQuestion(id: number) {
    const [rows] = await pool.query<any[]>(
        `SELECT q.*, u.battletag AS updated_by_battletag
           FROM quiz_questions q
           LEFT JOIN users u ON u.id = q.updated_by
          WHERE q.id = ? LIMIT 1`,
        [id]
    );
    return rows.length ? rows[0] : null;
}

async function saveRevision(params: {
    questionId: number;
    version: number;
    action: 'create' | 'update';
    snapshot: QuestionPayload;
    summary: string;
    userId: number;
    battletag: string;
}) {
    await pool.query(
        `INSERT INTO quiz_question_revisions (question_id, version, action, snapshot, summary, created_by, created_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
            params.questionId,
            params.version,
            params.action,
            JSON.stringify(params.snapshot),
            params.summary.slice(0, 255),
            params.userId,
            displayNameOf(params.battletag).slice(0, 64)
        ]
    );
}

/* =========================
   列表 / 详情
========================= */

router.get('/questions', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const keyword = String(req.query.q ?? '').trim();
        const tag = String(req.query.tag ?? '').trim();
        const minDifficulty = Number(req.query.minDifficulty);
        const maxDifficulty = Number(req.query.maxDifficulty);
        const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 300);

        const where: string[] = [`q.status = 'published'`];
        const params: any[] = [];

        if (keyword) {
            where.push('(q.title LIKE ? OR q.subtitle LIKE ?)');
            params.push(`%${keyword}%`, `%${keyword}%`);
        }
        if (tag) {
            where.push('JSON_CONTAINS(q.tags, JSON_QUOTE(?))');
            params.push(tag);
        }
        if (Number.isFinite(minDifficulty)) {
            where.push('q.difficulty >= ?');
            params.push(Math.max(0, Math.min(255, Math.round(minDifficulty))));
        }
        if (Number.isFinite(maxDifficulty)) {
            where.push('q.difficulty <= ?');
            params.push(Math.max(0, Math.min(255, Math.round(maxDifficulty))));
        }

        const [rows] = await pool.query<any[]>(
            `SELECT q.*, u.battletag AS updated_by_battletag
               FROM quiz_questions q
               LEFT JOIN users u ON u.id = q.updated_by
              WHERE ${where.join(' AND ')}
              ORDER BY q.updated_at DESC
              LIMIT ${limit}`,
            params
        );

        res.json({ questions: rows.map(mapQuestion) });
    } catch (error) {
        console.error('[题库] 读取列表失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

router.get('/tags', authenticateToken, async (_req: AuthRequest, res: Response) => {
    try {
        const [rows] = await pool.query<any[]>(`SELECT tags FROM quiz_questions WHERE status = 'published'`);
        const counter = new Map<string, number>();
        for (const row of rows) {
            for (const tag of parseJsonColumn<string[]>(row.tags, [])) {
                counter.set(tag, (counter.get(tag) ?? 0) + 1);
            }
        }
        const tags = [...counter.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

        res.json({ tags });
    } catch (error) {
        console.error('[题库] 读取标签失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

router.get('/questions/:id', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const row = await loadQuestion(id);
        if (!row) return res.status(404).json({ error: '题目不存在' });

        const [revisions] = await pool.query<any[]>(
            `SELECT * FROM quiz_question_revisions WHERE question_id = ? ORDER BY version DESC, id DESC LIMIT 50`,
            [id]
        );

        res.json({ question: mapQuestion(row), revisions: revisions.map(mapRevision) });
    } catch (error) {
        console.error('[题库] 读取题目失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

router.get('/questions/:id/revisions', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const [revisions] = await pool.query<any[]>(
            `SELECT * FROM quiz_question_revisions WHERE question_id = ? ORDER BY version DESC, id DESC LIMIT 100`,
            [id]
        );
        res.json({ revisions: revisions.map(mapRevision) });
    } catch (error) {
        console.error('[题库] 读取提交历史失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

/* =========================
   创建 / 修改
========================= */

router.post('/questions', express.json(), authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const normalized = normalizePayload(req.body);
        if (!normalized.ok || !normalized.data) {
            return res.status(400).json({ error: normalized.message ?? '参数无效' });
        }

        const data = normalized.data;
        const { userId, battletag } = req.user!;

        const [result] = await pool.query<any>(
            `INSERT INTO quiz_questions
               (title, subtitle, options, answer, explanation, resources, tags, difficulty, answer_seconds, status, version, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
            [
                data.title,
                data.subtitle,
                JSON.stringify(data.options),
                data.answer,
                data.explanation,
                JSON.stringify(data.resources),
                JSON.stringify(data.tags),
                data.difficulty,
                data.answerSeconds,
                data.status,
                userId,
                userId
            ]
        );

        const questionId = Number(result.insertId);
        await saveRevision({
            questionId,
            version: 1,
            action: 'create',
            snapshot: data,
            summary: '创建题目',
            userId,
            battletag
        });

        // 操作日志：题库新增
        userEventLogger.logEvent({
            userId,
            eventType: 'quiz_question_create',
            eventData: {
                questionId,
                version: 1,
                title: data.title,
                tags: data.tags,
                difficulty: data.difficulty,
                optionCount: data.options.length,
                imageCount: data.resources.images.length
            },
            ipAddress: req.ip
        });

        const row = await loadQuestion(questionId);
        res.status(201).json({ question: row ? mapQuestion(row) : null });
    } catch (error) {
        console.error('[题库] 创建题目失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

router.put('/questions/:id', express.json(), authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const previous = await loadQuestion(id);
        if (!previous) return res.status(404).json({ error: '题目不存在' });

        const normalized = normalizePayload(req.body);
        if (!normalized.ok || !normalized.data) {
            return res.status(400).json({ error: normalized.message ?? '参数无效' });
        }

        const data = normalized.data;
        const { userId, battletag } = req.user!;
        const version = Number(previous.version ?? 1) + 1;
        const summary = buildSummary(previous, data);

        await pool.query(
            `UPDATE quiz_questions
                SET title = ?, subtitle = ?, options = ?, answer = ?, explanation = ?, resources = ?,
                    tags = ?, difficulty = ?, answer_seconds = ?, status = ?, version = ?, updated_by = ?
              WHERE id = ?`,
            [
                data.title,
                data.subtitle,
                JSON.stringify(data.options),
                data.answer,
                data.explanation,
                JSON.stringify(data.resources),
                JSON.stringify(data.tags),
                data.difficulty,
                data.answerSeconds,
                data.status,
                version,
                userId,
                id
            ]
        );

        await saveRevision({
            questionId: id,
            version,
            action: 'update',
            snapshot: data,
            summary,
            userId,
            battletag
        });

        userEventLogger.logEvent({
            userId,
            eventType: 'quiz_question_update',
            eventData: { questionId: id, version, title: data.title, summary, tags: data.tags, difficulty: data.difficulty },
            ipAddress: req.ip
        });

        const row = await loadQuestion(id);
        res.json({ question: row ? mapQuestion(row) : null, summary });
    } catch (error) {
        console.error('[题库] 修改题目失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

/* =========================
   争议 / 作答统计
========================= */

router.post('/questions/:id/dispute', express.json(), authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const row = await loadQuestion(id);
        if (!row) return res.status(404).json({ error: '题目不存在' });

        await pool.query(`UPDATE quiz_questions SET dispute_count = dispute_count + 1 WHERE id = ?`, [id]);

        userEventLogger.logEvent({
            userId: req.user!.userId,
            eventType: 'quiz_question_dispute',
            eventData: { questionId: id, reason: String(req.body?.reason ?? '').slice(0, 200) },
            ipAddress: req.ip
        });

        const updated = await loadQuestion(id);
        res.json({ disputeCount: Number(updated?.dispute_count ?? 0) });
    } catch (error) {
        console.error('[题库] 记录争议失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

// 管理员：把某题的争议计数清零
router.delete('/questions/:id/dispute', authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const role = String(req.user!.role ?? '');
        if (role !== 'ADMIN' && role !== 'MODERATOR') {
            return res.status(403).json({ error: '只有管理员可以清零争议计数' });
        }

        const id = Number(req.params.id);
        const row = await loadQuestion(id);
        if (!row) return res.status(404).json({ error: '题目不存在' });

        await pool.query(`UPDATE quiz_questions SET dispute_count = 0 WHERE id = ?`, [id]);

        userEventLogger.logEvent({
            userId: req.user!.userId,
            eventType: 'quiz_question_dispute_reset',
            eventData: { questionId: id, before: Number(row.dispute_count ?? 0) },
            ipAddress: req.ip
        });

        res.json({ disputeCount: 0 });
    } catch (error) {
        console.error('[题库] 清零争议失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

// 记录一次作答：更新作答次数、答对次数与正确率
router.post('/questions/:id/answer', express.json(), authenticateToken, async (req: AuthRequest, res: Response) => {
    try {
        const id = Number(req.params.id);
        const row = await loadQuestion(id);
        if (!row) return res.status(404).json({ error: '题目不存在' });

        const correct = req.body?.correct === true;
        // 显式计算，避免依赖 MySQL「同一条 UPDATE 里读到已更新值」的隐式行为
        const answerCount = Number(row.answer_count ?? 0) + 1;
        const correctCount = Number(row.correct_count ?? 0) + (correct ? 1 : 0);
        const accuracy = answerCount > 0 ? correctCount / answerCount : 0;

        await pool.query(
            `UPDATE quiz_questions SET answer_count = ?, correct_count = ?, accuracy = ? WHERE id = ?`,
            [answerCount, correctCount, accuracy, id]
        );

        userEventLogger.logEvent({
            userId: req.user!.userId,
            eventType: 'quiz_question_answer',
            eventData: { questionId: id, correct, answer: String(req.body?.answer ?? '').slice(0, 16) },
            ipAddress: req.ip
        });

        const updated = await loadQuestion(id);
        res.json({
            answerCount: Number(updated?.answer_count ?? 0),
            correctCount: Number(updated?.correct_count ?? 0),
            accuracy: Number(updated?.accuracy ?? 0)
        });
    } catch (error) {
        console.error('[题库] 记录作答失败:', error);
        res.status(500).json({ error: 'server error' });
    }
});

export default router;
