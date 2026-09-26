/**
 * 语音频道（LiveKit）服务端编排
 *
 * 架构（详见 `临时\AIwork\talon\work6.md` §14）：
 *   信令：浏览器 ──wss://voice.nodebeta.top──▶ 生产后端 nginx ──▶ 媒体机 103.236.98.149:7880
 *   媒体：浏览器 ◀────────── UDP 7882 直连媒体机 ──────────▶ 媒体机
 *
 * 频道模型（§0.5）：
 *   公共频道（橙）：所有人可听
 *   蓝色频道（蓝）：说话者在队伍1 → 队伍1 + 观战席可听；队伍2 → 队伍2 + 观战席；观战席 → 仅观战席
 *
 * 隐私由服务端强制：靠 LiveKit 的逐轨订阅权限（RoomServiceClient.updateSubscriptions），
 * 只在前端过滤是不够的（敌方抓包就能听到队伍语音）。
 */
import { AccessToken, RoomServiceClient, WebhookReceiver } from 'livekit-server-sdk';
import type { Room, RoomMember, RoomMode, SeatType } from './undercoverRooms';

/* =========================
   配置
========================= */

// 后端访问 LiveKit 的地址（服务端 API，走内网或公网直连媒体机）
const LIVEKIT_API_URL = process.env.LIVEKIT_API_URL ?? 'http://103.236.98.149:7880';
// 浏览器连接的信令地址（经后端机 nginx 反代的 WSS）
const LIVEKIT_WS_URL = process.env.LIVEKIT_WS_URL ?? 'wss://voice.nodebeta.top';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY ?? '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET ?? '';

// 音轨命名：客户端发布麦克风轨时用这两个名字标记当前所在频道
export const VOICE_TRACK_PUBLIC = 'ch-public';
export const VOICE_TRACK_BLUE = 'ch-blue';

const VOICE_TRACK_NAMES = new Set([VOICE_TRACK_PUBLIC, VOICE_TRACK_BLUE]);

// token 有效期 6 小时（随房间会话足够）
const TOKEN_TTL = '6h';

// 房间状态变化后延迟多久同步一次权限（合并同一批变更）
const SYNC_DEBOUNCE_MS = 300;

// 兜底巡检间隔：防止漏掉 webhook（LiveKit 重启、网络抖动等）
const SYNC_SAFETY_MS = 20 * 1000;

/* =========================
   基础工具
========================= */

let roomService: RoomServiceClient | null = null;

function service(): RoomServiceClient | null {
    if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) return null;
    if (!roomService) {
        roomService = new RoomServiceClient(LIVEKIT_API_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
    }
    return roomService;
}

export function voiceEnabled(): boolean {
    return Boolean(LIVEKIT_API_KEY && LIVEKIT_API_SECRET);
}

export function voicePublicUrl(): string {
    return LIVEKIT_WS_URL;
}

/** 房间名：一个游戏房间对应一个 LiveKit 房间 */
export function voiceRoomName(mode: RoomMode, roomNo: string): string {
    return `talon-${mode}-${roomNo}`;
}

/** 参与者身份 = 用户 ID（字符串），便于把 LiveKit 参与者映射回房间成员 */
export function voiceIdentity(userId: number): string {
    return String(userId);
}

function displayNameOf(battletag: string): string {
    return battletag.split('#')[0] || battletag;
}

/** 随参与者下发的元数据：前端据此渲染发言栏颜色与标签 */
function voiceMetadata(member: { battletag: string; seat: SeatType; seatIndex: number; isOwner: boolean }) {
    return JSON.stringify({
        battletag: member.battletag,
        displayName: displayNameOf(member.battletag),
        seat: member.seat,
        seatIndex: member.seatIndex,
        isOwner: member.isOwner,
    });
}

/* =========================
   签发 token
========================= */

export async function issueVoiceToken(
    room: Room,
    member: { userId: number; battletag: string; seat: SeatType; seatIndex: number; isOwner: boolean }
): Promise<{ url: string; token: string; room: string }> {
    if (!voiceEnabled()) throw new Error('语音服务未配置（缺少 LIVEKIT_API_KEY / LIVEKIT_API_SECRET）');

    const roomName = voiceRoomName(room.mode, room.roomNo);
    const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
        identity: voiceIdentity(member.userId),
        name: displayNameOf(member.battletag),
        metadata: voiceMetadata(member),
        ttl: TOKEN_TTL,
    });
    at.addGrant({
        roomJoin: true,
        room: roomName,
        canPublish: true,
        canSubscribe: true,
        // 房间内的状态同步走游戏房间自己的 WS，不占用 LiveKit 数据通道
        canPublishData: false,
    });

    return { url: LIVEKIT_WS_URL, token: await at.toJwt(), room: roomName };
}

/* =========================
   订阅权限计算
========================= */

type LiveTrack = { sid: string; name: string; publisherIdentity: string };

/**
 * 某个听众能否收听某条音轨。
 * 公共轨：所有人；蓝色轨：按发布者所在席位的听众范围。
 */
function canListen(listenerSeat: SeatType, publisherSeat: SeatType, trackName: string): boolean {
    if (listenerSeat === publisherSeat) return true;
    if (trackName === VOICE_TRACK_PUBLIC) return true;
    if (trackName !== VOICE_TRACK_BLUE) return false;
    // 蓝色频道：观战席是两支队伍的共同听众
    if (listenerSeat === 'spectator') return true;
    // 队伍成员只能听本队的蓝色频道；观战席发布的蓝色频道仅观战席可听
    return false;
}

/** 已下发的订阅状态：listenerIdentity -> 已允许订阅的 trackSid 集合 */
const appliedSubscriptions = new Map<string, Set<string>>();

/** 待同步的房间（mode + roomNo） */
const pendingSync = new Set<string>();
const roomRefs = new Map<string, Room>();
let syncTimer: NodeJS.Timeout | null = null;

const roomKey = (room: Room) => `${room.mode}:${room.roomNo}`;

/* =========================
   权限同步
========================= */

async function syncRoom(room: Room): Promise<void> {
    const svc = service();
    if (!svc) return;

    const roomName = voiceRoomName(room.mode, room.roomNo);
    let participants: Awaited<ReturnType<RoomServiceClient['listParticipants']>>;
    try {
        participants = await svc.listParticipants(roomName);
    } catch {
        // 房间还不存在（没人进语音）——清掉记忆状态避免残留
        appliedSubscriptions.clear();
        return;
    }
    if (!participants.length) return;

    // 参与者的席位归属以游戏房间为准（LiveKit 侧的 metadata 只是快照）
    const seatOf = new Map<string, SeatType>();
    const memberOf = new Map<string, RoomMember>();
    for (const m of room.members.values()) {
        seatOf.set(voiceIdentity(m.userId), m.seat);
        memberOf.set(voiceIdentity(m.userId), m);
    }

    const tracks: LiveTrack[] = [];
    for (const p of participants) {
        for (const t of p.tracks ?? []) {
            if (!VOICE_TRACK_NAMES.has(t.name ?? '')) continue;
            tracks.push({ sid: t.sid!, name: t.name!, publisherIdentity: p.identity });
        }
    }

    for (const listener of participants) {
        const listenerSeat = seatOf.get(listener.identity);
        if (!listenerSeat) continue; // 不在游戏房间名单里（已退出），交给 LiveKit 断开

        const desired = new Set<string>();
        for (const track of tracks) {
            if (track.publisherIdentity === listener.identity) continue;
            const publisherSeat = seatOf.get(track.publisherIdentity);
            if (!publisherSeat) continue;
            if (canListen(listenerSeat, publisherSeat, track.name)) desired.add(track.sid);
        }

        const applied = appliedSubscriptions.get(listener.identity) ?? new Set<string>();
        const toSubscribe = [...desired].filter((sid) => !applied.has(sid));
        const toUnsubscribe = [...applied].filter((sid) => !desired.has(sid));

        try {
            if (toSubscribe.length) await svc.updateSubscriptions(roomName, listener.identity, toSubscribe, true);
            if (toUnsubscribe.length) await svc.updateSubscriptions(roomName, listener.identity, toUnsubscribe, false);
        } catch (error) {
            console.error('[语音] 更新订阅权限失败', listener.identity, error);
            continue;
        }
        appliedSubscriptions.set(listener.identity, desired);
    }
}

/** 席位 / 成员变化后调用（已防抖） */
export function scheduleVoiceSync(room: Room): void {
    if (!voiceEnabled()) return;
    const key = roomKey(room);
    roomRefs.set(key, room);
    pendingSync.add(key);
    if (syncTimer) return;
    syncTimer = setTimeout(() => {
        syncTimer = null;
        const keys = [...pendingSync];
        pendingSync.clear();
        for (const k of keys) {
            const target = roomRefs.get(k);
            if (!target) continue;
            syncRoom(target).catch((error) => console.error('[语音] 同步权限失败', k, error));
        }
    }, SYNC_DEBOUNCE_MS);
}

/** 座位变化后顺带刷新参与者的 metadata（前端发言栏靠它显示席位与标签） */
export async function refreshVoiceMetadata(room: Room): Promise<void> {
    const svc = service();
    if (!svc) return;
    const roomName = voiceRoomName(room.mode, room.roomNo);
    for (const member of room.members.values()) {
        try {
            await svc.updateParticipant(roomName, voiceIdentity(member.userId), {
                metadata: voiceMetadata(member),
            });
        } catch {
            // 该成员当前不在语音房间，忽略
        }
    }
}

/* =========================
   Webhook（LiveKit → 后端）
========================= */

const webhookReceiver = LIVEKIT_API_KEY && LIVEKIT_API_SECRET
    ? new WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET)
    : null;

/**
 * 处理 LiveKit 事件：参与者进出、音轨发布/取消发布。
 * 返回 true 表示事件被识别并已安排同步。
 */
export async function handleVoiceWebhook(rawBody: string, authHeader: string | undefined): Promise<boolean> {
    if (!webhookReceiver || !authHeader) return false;
    let event: Awaited<ReturnType<WebhookReceiver['receive']>>;
    try {
        event = await webhookReceiver.receive(rawBody, authHeader);
    } catch (error) {
        console.error('[语音] webhook 校验失败', error);
        return false;
    }

    const relevant = new Set([
        'participant_joined',
        'participant_left',
        'track_published',
        'track_unpublished',
        'room_finished',
    ]);
    if (!event.event || !relevant.has(event.event)) return true;

    const roomName = event.room?.name;
    if (roomName) {
        for (const room of roomRefs.values()) {
            if (voiceRoomName(room.mode, room.roomNo) === roomName) scheduleVoiceSync(room);
        }
        // 房间不在缓存里（后端重启过）：从房间名反查
        const match = /^talon-(undercover|quiz)-(.+)$/.exec(roomName);
        if (match) {
            const [, mode, roomNo] = match;
            if (![...roomRefs.values()].some((r) => r.mode === mode && r.roomNo === roomNo)) {
                const { getRoomByNo } = await import('./undercoverRooms');
                const room = getRoomByNo(roomNo);
                if (room && room.mode === mode) scheduleVoiceSync(room);
            }
        }
    }
    return true;
}

/* =========================
   初始化
========================= */

export function initVoiceChannel(registerHook: (fn: (room: Room) => void) => void): void {
    registerHook(scheduleVoiceSync);
    if (!voiceEnabled()) {
        console.warn('[语音] 未配置 LIVEKIT_API_KEY / LIVEKIT_API_SECRET，语音功能关闭');
        return;
    }
    // 兜底巡检：房间列表里的房间定期对一次权限（防止漏 webhook）
    setInterval(() => {
        for (const room of roomRefs.values()) scheduleVoiceSync(room);
    }, SYNC_SAFETY_MS).unref?.();
}
