/**
 * 语音频道接口
 *
 *   POST /api/voice/token    登录用户进入游戏房间后换取 LiveKit 语音 token
 *   POST /api/voice/webhook  LiveKit 事件回调（音轨发布 / 参与者进出 → 重算订阅权限）
 *
 * 说明：webhook 需要原始请求体做签名校验，因此单独导出 `voiceWebhookRouter`，
 * 由 index.ts 注册在 express.json() 之前。
 */
import { Router, raw } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { getRoomByNo } from '../services/undercoverRooms';
import {
    handleVoiceWebhook,
    issueVoiceToken,
    refreshVoiceMetadata,
    scheduleVoiceSync,
    voiceEnabled,
    voicePublicUrl,
} from '../services/voiceChannel';

/* =========================
   Webhook（需在 express.json() 前注册）
========================= */

export const voiceWebhookRouter = Router();

voiceWebhookRouter.post('/webhook', raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const body = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body ?? '');
    const authHeader = req.headers['authorization'];
    const ok = await handleVoiceWebhook(body, typeof authHeader === 'string' ? authHeader : undefined);
    if (!ok) return res.status(401).json({ error: 'webhook 校验失败' });
    res.json({ ok: true });
});

/* =========================
   Token（登录用户）
========================= */

const router = Router();
router.use(authenticateToken);

router.get('/status', (_req, res) => {
    res.json({ enabled: voiceEnabled(), url: voicePublicUrl() });
});

router.post('/token', async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: '未授权' });

    if (!voiceEnabled()) return res.status(503).json({ error: '语音服务未启用' });

    const roomNo = String(req.body?.roomNo ?? '').trim();
    if (!roomNo) return res.status(400).json({ error: '缺少房间号' });

    const room = getRoomByNo(roomNo);
    if (!room) return res.status(404).json({ error: '房间不存在或已解散' });

    const member = room.members.get(userId);
    if (!member) return res.status(403).json({ error: '你不在该房间中' });

    try {
        const issued = await issueVoiceToken(room, member);
        // 席位信息可能刚变过：顺手刷新 metadata 并触发一次权限同步
        refreshVoiceMetadata(room).catch(() => undefined);
        scheduleVoiceSync(room);

        res.json({
            ...issued,
            seat: member.seat,
            seatIndex: member.seatIndex,
            isOwner: member.isOwner,
        });
    } catch (error) {
        console.error('[语音] 签发 token 失败', error);
        res.status(500).json({ error: '语音 token 签发失败' });
    }
});

// 供调试：手动触发一次权限同步（仅房主，且不改变任何状态）
router.post('/sync', async (req: AuthRequest, res) => {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ error: '未授权' });
    const room = getRoomByNo(String(req.body?.roomNo ?? '').trim());
    if (!room) return res.status(404).json({ error: '房间不存在' });
    const member = room.members.get(userId);
    if (!member?.isOwner) return res.status(403).json({ error: '仅房主可触发同步' });
    scheduleVoiceSync(room);
    res.json({ ok: true });
});

export default router;
