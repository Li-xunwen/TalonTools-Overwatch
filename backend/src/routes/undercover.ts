import express, { Response } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { pool } from '../utils/db';
import {
    broadcastRoom,
    createRoom,
    findOwnedRoom,
    getRoomByNo,
    getVoiceClip,
    listRoomSummaries,
    pushSystemMessage,
    removeMember,
    serializeRoom
} from '../services/undercoverRooms';

const router = express.Router();

/* =========================
   常量配置
========================= */

// 前台心跳超时：8 秒（= 4 个心跳周期，2 秒 / 次）
const ONLINE_TIMEOUT_MS = 8 * 1000;

// 后台心跳超时：页面处于后台时允许存活 90 秒
const BACKGROUND_TIMEOUT_MS = 90 * 1000;

/* =========================
   内存数据结构（本期不落库，进程重启即清空）
========================= */

interface OnlineEntry {
    userId: number;
    battletag: string;
    lastHeartbeat: number; // 服务器时间戳（毫秒）
    background: boolean;   // 页面是否处于后台
}

const onlineMap = new Map<number, OnlineEntry>();

/* =========================
   工具函数
========================= */

function isAlive(entry: OnlineEntry, now: number): boolean {
    const ttl = entry.background ? BACKGROUND_TIMEOUT_MS : ONLINE_TIMEOUT_MS;
    return now - entry.lastHeartbeat <= ttl;
}

// 取当前在线玩家，同时清理已超时的记录
function getOnlinePlayers() {
    const now = Date.now();

    for (const [userId, entry] of onlineMap) {
        if (!isAlive(entry, now)) onlineMap.delete(userId);
    }

    return [...onlineMap.values()]
        .sort((a, b) => b.lastHeartbeat - a.lastHeartbeat)
        .map((entry) => ({
            userId: entry.userId,
            battletag: entry.battletag,
            background: entry.background,
            avatar: `/api/users/${encodeURIComponent(entry.battletag)}/avatar`
        }));
}

/* =========================
   心跳相关接口
========================= */

// POST /api/undercover/heartbeat —— 上报在线心跳，同时返回在线人数与在线玩家
router.post('/heartbeat', authenticateToken, (req: AuthRequest, res: Response) => {
    const { userId, battletag } = req.user!;
    const background = req.body?.background === true;

    onlineMap.set(userId, {
        userId,
        battletag,
        lastHeartbeat: Date.now(),
        background
    });

    const players = getOnlinePlayers();

    res.json({
        online: players.length,
        players,
        serverTime: new Date().toISOString()
    });
});

// POST /api/undercover/leave —— 离开页面立即下线
router.post('/leave', authenticateToken, (req: AuthRequest, res: Response) => {
    const { userId } = req.user!;
    onlineMap.delete(userId);
    res.json({ ok: true });
});

/* =========================
   房间相关接口
========================= */

// GET /api/undercover/rooms —— 房间列表
router.get('/rooms', authenticateToken, (req: AuthRequest, res: Response) => {
    res.json({ rooms: listRoomSummaries() });
});

// GET /api/undercover/rooms/:roomNo —— 单个房间详情（进入房间前校验）
router.get('/rooms/:roomNo', authenticateToken, (req: AuthRequest, res: Response) => {
    const room = getRoomByNo(String(req.params.roomNo));
    if (!room) return res.status(404).json({ error: '房间不存在或已解散' });

    res.json({ room: serializeRoom(room) });
});

// POST /api/undercover/rooms —— 创建房间（房主 = 当前登录用户）
// 若自己已经是某个房间的房主，则直接返回该房间并标记 existed，由前端跳转过去
router.post('/rooms', authenticateToken, (req: AuthRequest, res: Response) => {
    const { userId, battletag } = req.user!;

    const ownedRoom = findOwnedRoom(userId);
    if (ownedRoom) {
        return res.json({ room: serializeRoom(ownedRoom), existed: true });
    }

    const room = createRoom(userId, battletag);
    res.status(201).json({ room: serializeRoom(room), existed: false });
});

// POST /api/undercover/rooms/:roomNo/system-message —— 发送系统消息（仅房主，渲染为 [系统消息]：xxx）
// 例：{ "text": "比赛开始" }
router.post('/rooms/:roomNo/system-message', authenticateToken, (req: AuthRequest, res: Response) => {
    const { userId } = req.user!;
    const room = getRoomByNo(String(req.params.roomNo));
    if (!room) return res.status(404).json({ error: '房间不存在或已解散' });
    if (room.ownerUserId !== userId) return res.status(403).json({ error: '只有房主可以发送系统消息' });

    const message = pushSystemMessage(room, req.body?.text);
    if (!message) return res.status(400).json({ error: '系统消息内容不能为空' });

    res.json({ ok: true, message });
});

// GET /api/undercover/rooms/:roomNo/voice/:voiceId —— 取语音片段（base64 dataURL，按需拉取，不随 state 广播）
router.get('/rooms/:roomNo/voice/:voiceId', authenticateToken, (req: AuthRequest, res: Response) => {
    const room = getRoomByNo(String(req.params.roomNo));
    if (!room) return res.status(404).json({ error: '房间不存在或已解散' });

    const clip = getVoiceClip(room, Number(req.params.voiceId));
    if (!clip) return res.status(404).json({ error: '语音已过期' });

    res.json({
        id: clip.id,
        mime: clip.mime,
        duration: clip.duration,
        dataUrl: clip.dataUrl
    });
});

// GET /api/undercover/users/search?q=xxx —— 搜索用户（房主「强制添加成员」用）
router.get('/users/search', authenticateToken, async (req: AuthRequest, res: Response) => {
    const keyword = String(req.query.q ?? '').trim();
    if (!keyword) return res.json({ users: [] });

    try {
        const [rows] = await pool.query<any[]>(
            'SELECT id, battletag FROM users WHERE battletag LIKE ? ORDER BY battletag LIMIT 20',
            [`%${keyword}%`]
        );
        res.json({ users: rows.map((row) => ({ userId: row.id, battletag: row.battletag })) });
    } catch (error) {
        console.error('搜索用户失败:', error);
        res.status(500).json({ error: '搜索失败' });
    }
});

// DELETE /api/undercover/rooms/:roomNo/members/:userId —— 管理员移除房间成员
// （队伍栏玩家不会因断线自动移除，需要管理员在这里清理）
router.delete('/rooms/:roomNo/members/:userId', authenticateToken, async (req: AuthRequest, res: Response) => {
    const { role } = req.user!;
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
        return res.status(403).json({ error: '需要管理员权限' });
    }

    const room = getRoomByNo(String(req.params.roomNo));
    if (!room) return res.status(404).json({ error: '房间不存在或已解散' });

    const targetUserId = Number(req.params.userId);
    const removed = await removeMember(room, targetUserId);
    if (!removed) return res.status(404).json({ error: '该玩家不在房间内' });

    const sockets = room.sockets.get(targetUserId);
    room.sockets.delete(targetUserId);

    for (const ws of sockets ?? []) {
        try {
            ws.send(JSON.stringify({ type: 'kicked', message: '你已被管理员移出房间' }));
            ws.close(1000, 'removed by admin');
        } catch {
            // 忽略关闭异常
        }
    }

    broadcastRoom(room);
    res.json({ ok: true, removed: { userId: removed.userId, battletag: removed.battletag } });
});

export default router;
