import { WebSocket } from 'ws';
import { pool } from '../utils/db';

/* =========================
   常量配置
========================= */

// 每队席位数量（左队 6 / 右队 6，卧底模式）
export const TEAM_SIZE = 6;

// 刷题战模式：每队 3 人
export const QUIZ_TEAM_SIZE = 3;

// 观战席固定位置数量（1 × 5）
export const SPECTATOR_MIN_SIZE = 5;

// 刷题战模式：观战席 2 人
export const QUIZ_SPECTATOR_SIZE = 2;

// 房间人数上限（12 个队伍席位 + 5 个观战席 = 17）
export const ROOM_MAX_PLAYERS = TEAM_SIZE * 2 + SPECTATOR_MIN_SIZE;

// 房间玩法：卧底（默认）/ 刷题战
export type RoomMode = 'undercover' | 'quiz';

// 房间无用户后 1 分钟销毁
const ROOM_EMPTY_DESTROY_MS = 60 * 1000;

// 房主断线后多久自动移交房主（默认 1 分钟；可用环境变量覆盖，便于调试）
// 注意：房主只是切到后台（仍在线）时始终不移交
const HOST_DISCONNECT_TRANSFER_MS = Number(process.env.UNDERCOVER_HOST_TRANSFER_MS ?? 60 * 1000);

// 观战席玩家断线后 1 分钟清除（队伍栏玩家断线不移除，由管理员处理）
const SPECTATOR_DISCONNECT_TTL_MS = 60 * 1000;

// 定时巡检间隔
const TICK_MS = 5 * 1000;

// 聊天记录保留条数
const CHAT_HISTORY_LIMIT = 999;

// 单条聊天消息最大长度
const CHAT_TEXT_MAX = 200;

// 语音：最长 15 秒，base64 数据上限 512KB（约 380KB 原始音频），每房间最多保留 30 条片段
const VOICE_MAX_SECONDS = 15;
const VOICE_MAX_BASE64_LENGTH = 512 * 1024;
const VOICE_CLIP_LIMIT = 30;

export type SeatType = 'team1' | 'team2' | 'spectator';

// 聊天频道：全局 / 友方 / 敌方 / 私密（私密只发给收发双方）
export type ChatChannel = 'global' | 'friendly' | 'enemy' | 'private';

const CHAT_CHANNELS: ChatChannel[] = ['global', 'friendly', 'enemy', 'private'];

// 聊天消息类型：文字 / 语音
export type ChatKind = 'text' | 'voice';

// 房间内的游戏阶段：选图 → 选择卧底 → 准备 → 开始 → 结算
export type GameState = 'map' | 'undercover' | 'ready' | 'start' | 'settle';

export const GAME_STATES: GameState[] = ['map', 'undercover', 'ready', 'start', 'settle'];

// 地图清单由前端从 public/map 目录生成（frontend/src/data/owMaps.ts），
// 服务端只做「非空 + 长度」校验，避免两边清单不一致
const MAP_NAME_MAX = 40;

interface MapVote {
    active: boolean;
    votes: Record<number, string>;   // userId -> 地图名
}

// 互动道具：鸡蛋 / 玫瑰花
export type ItemType = 'egg' | 'rose';

const ITEM_TYPES: ItemType[] = ['egg', 'rose'];

export interface ItemEvent {
    id: number;
    item: ItemType;
    fromUserId: number;
    fromBattletag: string;
    toUserId: number;
    toBattletag: string;
    at: number;
}

/* =========================
   数据结构（内存存储，重启即清空）
========================= */

export interface RoomMember {
    userId: number;
    battletag: string;
    seat: SeatType;
    seatIndex: number;
    isOwner: boolean;
    connected: boolean;          // 是否在线（队伍栏玩家断线后仍保留在房间里）
    disconnectedSince: number | null;
    ready: boolean;              // 准备阶段是否已准备
    background: boolean;         // 页面是否处于后台
    backgroundSince: number | null;
    joinedAt: number;
}

export interface ChatMessage {
    id: number;
    system: boolean;          // 系统消息（渲染为 [系统消息]：xxx）
    kind: ChatKind;           // text / voice
    userId: number | null;    // 系统消息为 null
    battletag: string;        // 完整战网ID（含 #1234）
    seat: SeatType | null;    // 发送时所在席位（决定 ID 颜色，历史消息不再随席位变化）
    isOwner: boolean;         // 发送时是否为房主（聊天里房主标签放在 ID 后面）
    channel: ChatChannel;     // 发送频道
    toUserId: number | null;  // 私密消息接收者
    text: string;             // 语音消息为空串
    voiceId: number | null;   // 语音消息对应的片段 id（音频另存，不进 state 广播）
    duration: number | null;  // 语音时长（秒）
    at: number;
}

export interface VoiceClip {
    id: number;
    userId: number;
    mime: string;
    dataUrl: string;
    duration: number;
    at: number;
}

export interface Room {
    id: number;
    roomNo: string;
    name: string;
    mode: RoomMode;                 // 玩法：卧底 / 刷题战
    teamSize: number;               // 每队席位数量（卧底 6、刷题战 3）
    spectatorSize: number;          // 观战席数量（卧底 5、刷题战 2）
    ownerUserId: number;
    team1Name: string;
    team2Name: string;
    createdAt: number;
    emptySince: number | null;   // 变为空的时间（用于 1 分钟销毁计时）
    members: Map<number, RoomMember>;
    sockets: Map<number, Set<WebSocket>>;
    chat: ChatMessage[];
    voiceClips: Map<number, VoiceClip>;
    gameState: GameState;
    map: string;                     // 已确定的地图，空串表示未选
    mapOwnerUserId: number;          // 选图权在谁手里（默认房主）
    mapVote: MapVote;
    mapRecommendations: Map<number, string>;   // userId -> 推荐的地图
    undercoverIds: number[];                    // 本局卧底（可能 1 个或多个）
    undercoverPickMode: '' | 'random' | 'assigned';   // 卧底是怎么选出来的
    undercoverVote: { active: boolean; votes: Record<number, number> };   // 结算阶段投票：投票人 -> 目标（0 = 弃权）
    revealedUndercoverIds: number[];            // 公布结果后对所有人公开的卧底
    rosterLocked: boolean;                      // 进入准备阶段后锁定成员名单
    swapRequests: Map<number, SeatSwapRequest>; // 待处理的位置交换申请（key = 被申请人）
    quiz: RoomQuizState;                        // 刷题战流程状态（卧底房间不使用）
}

// 位置交换申请（申请人 → 被申请人，同意后互换席位）
export interface SeatSwapRequest {
    id: number;
    fromUserId: number;
    toUserId: number;
    at: number;
}

// 申请超时时间：30 秒内没有回应就失效
const SEAT_SWAP_TTL_MS = 30 * 1000;

const rooms = new Map<string, Room>();
let roomSeq = 1;
let chatSeq = 1;
let voiceSeq = 1;
let itemSeq = 1;
let swapSeq = 1;

/* =========================
   工具函数
========================= */

// 去掉战网 ID 的数字后缀（Talon#51456 → Talon）
export function nameWithoutIdNumber(battletag: string): string {
    const name = battletag.split('#')[0].trim();
    return name || battletag;
}

function avatarUrl(battletag: string): string {
    return `/api/users/${encodeURIComponent(battletag)}/avatar`;
}

// 生成不重复的 4 位房间号
function generateRoomNo(): string {
    let roomNo = '';
    do {
        roomNo = String(Math.floor(1000 + Math.random() * 9000));
    } while (rooms.has(roomNo));
    return roomNo;
}

function isTeamSeat(seat: SeatType): boolean {
    return seat === 'team1' || seat === 'team2';
}

// 房间人数上限：两支队伍 + 观战席
function roomMaxPlayers(room: Room): number {
    return room.teamSize * 2 + room.spectatorSize;
}

function seatTaken(room: Room, seat: SeatType, seatIndex: number, exceptUserId?: number): boolean {
    for (const member of room.members.values()) {
        if (member.userId === exceptUserId) continue;
        if (member.seat === seat && member.seatIndex === seatIndex) return true;
    }
    return false;
}

// 是否仍「属于」房间：队伍栏玩家断线也保留（由管理员管理）；
// 观战席玩家断线后进入待清除状态，不再计入房间人数
function belongsToRoom(member: RoomMember): boolean {
    return member.connected || member.seat !== 'spectator';
}

function roomPlayerCount(room: Room): number {
    let count = 0;
    for (const member of room.members.values()) {
        if (belongsToRoom(member)) count++;
    }
    return count;
}

// 找第一个空席位：队伍席 0~teamSize-1、观战席 0~4（位置固定，满员返回 -1）
function firstFreeSeatIndex(room: Room, seat: SeatType): number {
    const limit = isTeamSeat(seat) ? room.teamSize : room.spectatorSize;
    for (let i = 0; i < limit; i++) {
        if (!seatTaken(room, seat, i)) return i;
    }
    return -1;
}

function seatSlots(room: Room, seat: SeatType, size: number) {
    const slots: (ReturnType<typeof serializeMember> | null)[] = new Array(size).fill(null);
    for (const member of room.members.values()) {
        if (member.seat !== seat) continue;
        if (member.seatIndex < 0 || member.seatIndex >= size) continue;
        slots[member.seatIndex] = serializeMember(member);
    }
    return slots;
}

function serializeMember(member: RoomMember) {
    return {
        userId: member.userId,
        battletag: member.battletag,
        displayName: nameWithoutIdNumber(member.battletag),
        avatar: avatarUrl(member.battletag),
        seat: member.seat,
        seatIndex: member.seatIndex,
        isOwner: member.isOwner,
        connected: member.connected,
        ready: member.ready,
        background: member.background
    };
}

/* =========================
   对外序列化
========================= */

export function serializeRoom(room: Room) {
    const mapOwner = room.members.get(room.mapOwnerUserId);

    // 刷题战状态：作答阶段不下发正确答案，投票/结算阶段才公布
    const quiz = room.quiz;
    const quizQuestion = quiz.questions[quiz.index] ?? null;
    const revealAnswer = quiz.phase === 'vote' || quiz.phase === 'finished';
    const quizState = {
        phase: quiz.phase,
        config: quiz.config,
        index: quiz.index,
        total: quiz.questions.length,
        questionEndsAt: quiz.questionEndsAt,
        voteEndsAt: quiz.voteEndsAt,
        startedAt: quiz.startedAt,
        answeredUserIds: Object.keys(quiz.answers).map((id) => Number(id)),
        votedUserIds: Object.keys(quiz.votes).map((id) => Number(id)),
        // 只有公布答案后才下发谁答对了
        correctUserIds: revealAnswer
            ? Object.entries(quiz.answers)
                  .filter(([, answer]) => answer.correct)
                  .map(([id]) => Number(id))
            : [],
        // 公布答案后才下发「每个选项都有谁选」——用于在选项上方浮现小头像
        optionChoices: revealAnswer
            ? Object.entries(quiz.answers).reduce<Record<string, number[]>>((acc, [id, answer]) => {
                  const key = answer.option;
                  if (!acc[key]) acc[key] = [];
                  acc[key].push(Number(id));
                  return acc;
              }, {})
            : {},
        scores: quiz.scores,
        readyUserIds: quiz.readyUserIds,
        readyCount: quiz.readyUserIds.length,
        // 观战席不需要准备，准备名单只统计队伍里的玩家
        memberCount: [...room.members.values()].filter((member) => member.seat !== 'spectator').length,
        question: quizQuestion
            ? {
                  id: quizQuestion.id,
                  title: quizQuestion.title,
                  subtitle: quizQuestion.subtitle,
                  options: quizQuestion.options,
                  resources: quizQuestion.resources,
                  tags: quizQuestion.tags,
                  difficulty: quizQuestion.difficulty,
                  // 结束后才公开答案与解析
                  answer: revealAnswer ? quizQuestion.answer : '',
                  explanation: revealAnswer ? quizQuestion.explanation : ''
              }
            : null
    };

    // 队伍总人数 / 已准备人数（都只统计两支队伍的成员，包含离线成员）
    const teamMembers = [...room.members.values()].filter(
        (member) => member.seat === 'team1' || member.seat === 'team2'
    );
    const readyCount = teamMembers.filter((member) => member.ready).length;

    return {
        id: room.id,
        roomNo: room.roomNo,
        name: room.name,
        mode: room.mode,
        teamSize: room.teamSize,
        ownerUserId: room.ownerUserId,
        ownerBattletag: room.members.get(room.ownerUserId)?.battletag ?? '',
        ownerDisplayName: nameWithoutIdNumber(room.members.get(room.ownerUserId)?.battletag ?? ''),
        playerCount: roomPlayerCount(room),
        maxPlayers: roomMaxPlayers(room),
        team1: { name: room.team1Name, slots: seatSlots(room, 'team1', room.teamSize) },
        team2: { name: room.team2Name, slots: seatSlots(room, 'team2', room.teamSize) },
        spectators: seatSlots(room, 'spectator', room.spectatorSize),
        members: [...room.members.values()].map(serializeMember),
        chat: room.chat,
        game: {
            state: room.gameState,
            map: room.map,
            mapOwnerUserId: room.mapOwnerUserId,
            mapOwnerDisplayName: nameWithoutIdNumber(mapOwner?.battletag ?? ''),
            vote: {
                active: room.mapVote.active,
                votes: room.mapVote.votes
            },
            recommendations: [...room.mapRecommendations.entries()].map(([userId, map]) => ({
                userId,
                displayName: nameWithoutIdNumber(room.members.get(userId)?.battletag ?? ''),
                map
            })),
            // 只公开「卧底是否已选出」，具体身份在 broadcastRoom 里按人下发
            undercoverPicked: room.undercoverIds.length > 0,
            undercoverPickMode: room.undercoverPickMode,
            rosterLocked: room.rosterLocked,
            readyCount,
            teamTotal: teamMembers.length,
            // 结算阶段的投票：票数与投给谁都公开（聊天栏也会提示），卧底身份仍只在下发时逐个注入
            undercoverVote: {
                active: room.undercoverVote.active,
                votes: room.undercoverVote.votes
            },
            revealedUndercoverIds: room.revealedUndercoverIds
        },
        quiz: quizState
    };
}

// 房间列表摘要（大厅用）
export function serializeRoomSummary(room: Room) {
    return {
        id: room.id,
        roomNo: room.roomNo,
        name: room.name,
        mode: room.mode,
        teamSize: room.teamSize,
        ownerUserId: room.ownerUserId,
        ownerBattletag: room.members.get(room.ownerUserId)?.battletag ?? '',
        playerCount: roomPlayerCount(room),
        maxPlayers: roomMaxPlayers(room),
        status: 'WAITING',
        createdAt: room.createdAt
    };
}

/* =========================
   查询
========================= */

export function getRoomByNo(roomNo: string): Room | undefined {
    return rooms.get(roomNo);
}

export function listRoomSummaries(mode?: RoomMode) {
    return [...rooms.values()]
        .filter((room) => !mode || room.mode === mode)
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(serializeRoomSummary);
}

// 用户作为房主所属的房间（用于「已是房主时再次创建则跳回原房间」）
// 房主离开后只要房间还没销毁（无人满 1 分钟才销毁），房间归属不变，因此这里不要求本人当前在房内
export function findOwnedRoom(userId: number, mode?: RoomMode): Room | undefined {
    for (const room of rooms.values()) {
        if (room.ownerUserId !== userId) continue;
        if (mode && room.mode !== mode) continue;
        return room;
    }
    return undefined;
}

/* =========================
   房间创建 / 加入 / 离开
========================= */

export function createRoom(userId: number, battletag: string, mode: RoomMode = 'undercover'): Room {
    const teamSize = mode === 'quiz' ? QUIZ_TEAM_SIZE : TEAM_SIZE;
    const spectatorSize = mode === 'quiz' ? QUIZ_SPECTATOR_SIZE : SPECTATOR_MIN_SIZE;
    const room: Room = {
        id: roomSeq++,
        roomNo: generateRoomNo(),
        name: `${nameWithoutIdNumber(battletag)} 的${mode === 'quiz' ? '刷题战' : ''}房间`,
        mode,
        teamSize,
        spectatorSize,
        ownerUserId: userId,
        team1Name: '队伍1',
        team2Name: '队伍2',
        createdAt: Date.now(),
        emptySince: null,
        members: new Map(),
        sockets: new Map(),
        chat: [],
        voiceClips: new Map(),
        gameState: 'map',
        map: '',
        mapOwnerUserId: userId,
        mapVote: { active: false, votes: {} },
        mapRecommendations: new Map(),
        undercoverIds: [],
        undercoverPickMode: '',
        undercoverVote: { active: false, votes: {} },
        revealedUndercoverIds: [],
        rosterLocked: false,
        swapRequests: new Map(),
        quiz: emptyQuizState()
    };

    rooms.set(room.roomNo, room);
    joinRoom(room, userId, battletag);
    pushSystemMessage(room, '房间已创建，等待玩家加入');
    startTicker();
    return room;
}

/* =========================
   聊天（房间内广播，内存保留最近 30 条）
========================= */

function normalizeChatText(text: unknown): string {
    return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, CHAT_TEXT_MAX);
}

function normalizeChannel(channel: unknown): ChatChannel {
    return CHAT_CHANNELS.includes(channel as ChatChannel) ? (channel as ChatChannel) : 'global';
}

function appendChat(room: Room, message: ChatMessage, broadcast = true): void {
    room.chat.push(message);
    if (room.chat.length > CHAT_HISTORY_LIMIT) {
        room.chat.splice(0, room.chat.length - CHAT_HISTORY_LIMIT);
    }
    if (broadcast) broadcastRoom(room);
}

// 玩家消息：battletag 用完整战网ID（含 #1234）
export function pushChatMessage(
    room: Room,
    userId: number,
    battletag: string,
    text: unknown,
    channel: unknown = 'global',
    toUserId: number | null = null
): ChatMessage | null {
    const content = normalizeChatText(text);
    if (!content) return null;

    const member = room.members.get(userId);

    const message: ChatMessage = {
        id: chatSeq++,
        system: false,
        kind: 'text',
        userId,
        battletag,
        seat: member?.seat ?? null,
        isOwner: member ? member.isOwner : room.ownerUserId === userId,
        channel: normalizeChannel(channel),
        toUserId,
        text: content,
        voiceId: null,
        duration: null,
        at: Date.now()
    };

    appendChat(room, message);
    return message;
}

// 系统消息：渲染为 [系统消息]：xxx（如「比赛开始」）
export function pushSystemMessage(room: Room, text: unknown, broadcast = true): ChatMessage | null {
    const content = normalizeChatText(text);
    if (!content) return null;

    const message: ChatMessage = {
        id: chatSeq++,
        system: true,
        kind: 'text',
        userId: null,
        battletag: '',
        seat: null,
        isOwner: false,
        channel: 'global',
        toUserId: null,
        text: content,
        voiceId: null,
        duration: null,
        at: Date.now()
    };

    appendChat(room, message, broadcast);
    return message;
}

/* =========================
   语音消息：音频以 dataURL(base64) 另存，state 只下发 voiceId + 时长
========================= */

export function pushVoiceMessage(
    room: Room,
    userId: number,
    battletag: string,
    voice: { dataUrl?: unknown; duration?: unknown },
    channel: unknown = 'global',
    toUserId: number | null = null
): { ok: boolean; message?: ChatMessage; error?: string } {
    const dataUrl = String(voice?.dataUrl ?? '');
    if (!dataUrl.startsWith('data:audio/')) return { ok: false, error: '语音格式不支持' };
    if (dataUrl.length > VOICE_MAX_BASE64_LENGTH) return { ok: false, error: '语音数据过大，发送失败' };

    const duration = Math.min(Math.max(Number(voice?.duration) || 0, 0), VOICE_MAX_SECONDS);
    const mime = dataUrl.slice(5, dataUrl.indexOf(';')) || 'audio/webm';

    const clip: VoiceClip = {
        id: voiceSeq++,
        userId,
        mime,
        dataUrl,
        duration,
        at: Date.now()
    };

    room.voiceClips.set(clip.id, clip);

    // 只保留最近 N 条语音片段，避免内存无限增长
    while (room.voiceClips.size > VOICE_CLIP_LIMIT) {
        const oldest = room.voiceClips.keys().next().value;
        if (oldest === undefined) break;
        room.voiceClips.delete(oldest);
    }

    const member = room.members.get(userId);
    const message: ChatMessage = {
        id: chatSeq++,
        system: false,
        kind: 'voice',
        userId,
        battletag,
        seat: member?.seat ?? null,
        isOwner: member ? member.isOwner : room.ownerUserId === userId,
        channel: normalizeChannel(channel),
        toUserId,
        text: '',
        voiceId: clip.id,
        duration,
        at: Date.now()
    };

    appendChat(room, message);
    return { ok: true, message };
}

export function getVoiceClip(room: Room, voiceId: number): VoiceClip | undefined {
    return room.voiceClips.get(voiceId);
}

// 加入房间：默认进观战席，观战席满 5 人后自动进队伍（先队伍1再队伍2）；
// 已在房间里则保持原席位
export function joinRoom(room: Room, userId: number, battletag: string): RoomMember | null {
    const existing = room.members.get(userId);
    if (existing) {
        // 重新连上：保留原席位，清掉断线/后台标记
        existing.connected = true;
        existing.disconnectedSince = null;
        existing.background = false;
        existing.backgroundSince = null;
        room.emptySince = null;
        return existing;
    }

    if (room.members.size >= roomMaxPlayers(room)) return null;

    // 观战席 → 队伍1 → 队伍2，都满了说明房间已满
    let seat: SeatType | null = null;
    let seatIndex = -1;
    for (const candidate of ['spectator', 'team1', 'team2'] as SeatType[]) {
        const index = firstFreeSeatIndex(room, candidate);
        if (index >= 0) {
            seat = candidate;
            seatIndex = index;
            break;
        }
    }
    if (!seat) return null;

    const member: RoomMember = {
        userId,
        battletag,
        seat,
        seatIndex,
        isOwner: room.ownerUserId === userId,
        connected: true,
        disconnectedSince: null,
        ready: false,
        background: false,
        backgroundSince: null,
        joinedAt: Date.now()
    };

    room.members.set(userId, member);
    room.emptySince = null;
    return member;
}

// 断线（最后一个连接关闭）：只标记状态，不立即移除
// - 队伍栏玩家：始终保留席位（由管理员通过管理接口移除）
// - 观战席玩家：保留 1 分钟，超时由巡检清除
export async function leaveRoom(room: Room, userId: number): Promise<void> {
    const member = room.members.get(userId);
    if (!member) return;

    member.connected = false;
    member.disconnectedSince = Date.now();
    member.background = false;
    member.backgroundSince = null;

    // 房主断线不再立刻移交：满 HOST_DISCONNECT_TRANSFER_MS（默认 1 分钟）后由巡检移交
}

// 主动退出房间（点「退出房间」按钮）：直接移除，不走断线保留逻辑
export async function exitRoom(room: Room, userId: number): Promise<RoomMember | null> {
    const removed = await removeMember(room, userId);
    if (removed) {
        room.sockets.delete(userId);
        broadcastRoom(room);
    }
    return removed;
}

// 房主解散房间：通知并关闭所有连接，随后销毁
export function dissolveRoom(room: Room, message = '房主已解散房间'): void {
    destroyRoom(room, message);
}

// 真正移除成员（观战席超时 / 管理员操作）
export async function removeMember(room: Room, userId: number): Promise<RoomMember | null> {
    const member = room.members.get(userId);
    if (!member) return null;

    room.members.delete(userId);
    dropSeatSwapRequests(room, userId);

    if (room.ownerUserId === userId) await transferOwner(room);
    if (room.members.size === 0) room.emptySince = Date.now();

    return member;
}

/* =========================
   房主移交（按赞数）
========================= */

async function fetchLikeRanking(userIds: number[]): Promise<Map<number, number>> {
    const ranking = new Map<number, number>();
    if (!userIds.length) return ranking;

    try {
        const [rows] = await pool.query<any[]>(
            `SELECT u.id AS userId, COALESCE(SUM(l.like_count), 0) AS likes
             FROM users u
             LEFT JOIN likes l ON l.to_user_id = u.id
             WHERE u.id IN (?)
             GROUP BY u.id`,
            [userIds]
        );
        for (const row of rows) ranking.set(Number(row.userId), Number(row.likes));
    } catch (error) {
        console.error('[Undercover] 查询赞数失败，改用加入顺序决定新房主:', error);
    }

    return ranking;
}

// 把房主交给房间内赞数最高的人（赞数相同则先加入者优先）
async function transferOwner(room: Room): Promise<void> {
    const others = [...room.members.values()].filter((m) => m.userId !== room.ownerUserId);
    if (!others.length) return;

    // 优先交给还在线的玩家，全离线时才考虑断线玩家
    const online = others.filter((m) => m.connected);
    const candidates = online.length ? online : others;

    const ranking = await fetchLikeRanking(candidates.map((c) => c.userId));
    candidates.sort((a, b) => {
        const likeDiff = (ranking.get(b.userId) ?? 0) - (ranking.get(a.userId) ?? 0);
        return likeDiff !== 0 ? likeDiff : a.joinedAt - b.joinedAt;
    });

    const nextOwner = candidates[0];
    room.ownerUserId = nextOwner.userId;
    for (const member of room.members.values()) {
        member.isOwner = member.userId === nextOwner.userId;
    }
}

/* =========================
   席位与队伍名称
========================= */

export function moveMemberSeat(
    room: Room,
    userId: number,
    seat: SeatType,
    seatIndex: number
): { ok: boolean; message?: string } {
    // 进入准备阶段后名单锁定，不允许更换席位
    if (room.rosterLocked) return { ok: false, message: '名单已经锁定，不可更换席位' };

    const member = room.members.get(userId);
    if (!member) return { ok: false, message: '你不在房间里' };

    if (seat !== 'team1' && seat !== 'team2' && seat !== 'spectator') {
        return { ok: false, message: '席位类型无效' };
    }
    if (!Number.isInteger(seatIndex) || seatIndex < 0) {
        return { ok: false, message: '席位编号无效' };
    }
    if (isTeamSeat(seat) && seatIndex >= room.teamSize) {
        return { ok: false, message: '该队伍席位不存在' };
    }
    if (seat === 'spectator' && seatIndex >= room.spectatorSize) {
        return { ok: false, message: '该观战席不存在' };
    }
    if (member.seat === seat && member.seatIndex === seatIndex) {
        return { ok: true };
    }
    if (seatTaken(room, seat, seatIndex, userId)) {
        return { ok: false, message: '该席位已被占用' };
    }

    member.seat = seat;
    member.seatIndex = seatIndex;
    return { ok: true };
}

// 房主移动其他玩家：切换队伍 / 移到观战席（目标席位取第一个空位）
export function moveOtherMemberSeat(
    room: Room,
    byUserId: number,
    targetUserId: number,
    seat: SeatType
): { ok: boolean; message?: string } {
    if (room.rosterLocked) return { ok: false, message: '名单已经锁定，不可更换席位' };
    if (room.ownerUserId !== byUserId) return { ok: false, message: '只有房主可以调整其他玩家' };

    const target = room.members.get(targetUserId);
    if (!target) return { ok: false, message: '该玩家已离开房间' };

    if (seat !== 'team1' && seat !== 'team2' && seat !== 'spectator') {
        return { ok: false, message: '席位类型无效' };
    }
    if (target.seat === seat) return { ok: false, message: '对方已在该席位' };

    const seatIndex = firstFreeSeatIndex(room, seat);
    if (seatIndex < 0) return { ok: false, message: seat === 'spectator' ? '观战席已满' : '该队伍席位已满' };

    target.seat = seat;
    target.seatIndex = seatIndex;
    return { ok: true };
}

// 申请与某位玩家交换位置：向对方推送确认请求，对方同意后才互换席位
export function requestSeatSwap(
    room: Room,
    fromUserId: number,
    toUserId: number
): { ok: boolean; message?: string } {
    if (room.rosterLocked) return { ok: false, message: '名单已经锁定，不可更换席位' };

    const from = room.members.get(fromUserId);
    const target = room.members.get(toUserId);
    if (!from) return { ok: false, message: '你不在房间里' };
    if (!target) return { ok: false, message: '该玩家已离开房间' };
    if (fromUserId === toUserId) return { ok: false, message: '不能和自己交换位置' };
    if (!target.connected) return { ok: false, message: '对方不在线，无法申请交换位置' };

    // 同一时间只保留一条待处理申请（后发覆盖先发）
    const request: SeatSwapRequest = {
        id: swapSeq++,
        fromUserId,
        toUserId,
        at: Date.now()
    };
    room.swapRequests.set(toUserId, request);

    for (const ws of room.sockets.get(toUserId) ?? []) {
        sendTo(ws, {
            type: 'swapRequest',
            request: {
                id: request.id,
                fromUserId,
                fromBattletag: from.battletag,
                fromDisplayName: nameWithoutIdNumber(from.battletag),
                fromSeat: from.seat
            }
        });
    }

    return { ok: true };
}

// 被申请人回应交换位置：同意则互换双方席位
export function respondSeatSwap(
    room: Room,
    userId: number,
    requestId: number,
    accept: boolean
): {
    ok: boolean;
    message?: string;
    accepted?: boolean;
    fromUserId?: number;
    fromBattletag?: string;
} {
    const request = room.swapRequests.get(userId);
    if (!request || request.id !== requestId) return { ok: false, message: '交换请求已失效' };

    room.swapRequests.delete(userId);

    if (Date.now() - request.at > SEAT_SWAP_TTL_MS) return { ok: false, message: '交换请求已超时' };

    const from = room.members.get(request.fromUserId);
    const target = room.members.get(userId);
    if (!from || !target) return { ok: false, message: '对方已离开房间' };

    if (!accept) {
        return { ok: true, accepted: false, fromUserId: from.userId, fromBattletag: from.battletag };
    }

    if (room.rosterLocked) return { ok: false, message: '名单已经锁定，不可更换席位' };

    // 互换席位
    const fromSeat = from.seat;
    const fromIndex = from.seatIndex;
    from.seat = target.seat;
    from.seatIndex = target.seatIndex;
    target.seat = fromSeat;
    target.seatIndex = fromIndex;

    return { ok: true, accepted: true, fromUserId: from.userId, fromBattletag: from.battletag };
}

// 成员离开时清掉与他相关的交换申请
function dropSeatSwapRequests(room: Room, userId: number): void {
    room.swapRequests.delete(userId);
    for (const [targetId, request] of room.swapRequests) {
        if (request.fromUserId === userId) room.swapRequests.delete(targetId);
    }
}

// 房主拖拽卡片：把某个成员的卡片放到目标格子
// - 目标格子有人 → 两人互换位置
// - 目标格子是空位 → 直接移动过去
export function hostDragToSeat(
    room: Room,
    byUserId: number,
    sourceUserId: number,
    targetSeat: SeatType,
    targetSeatIndex: number
): { ok: boolean; message?: string; swappedWithUserId?: number | null; moved?: boolean } {
    if (room.rosterLocked) return { ok: false, message: '名单已经锁定，不可更换席位' };
    if (room.ownerUserId !== byUserId) return { ok: false, message: '只有房主可以拖动交换位置' };

    const source = room.members.get(sourceUserId);
    if (!source) return { ok: false, message: '该玩家已离开房间' };

    if (targetSeat !== 'team1' && targetSeat !== 'team2' && targetSeat !== 'spectator') {
        return { ok: false, message: '席位类型无效' };
    }
    if (!Number.isInteger(targetSeatIndex) || targetSeatIndex < 0) {
        return { ok: false, message: '席位编号无效' };
    }
    if (isTeamSeat(targetSeat) && targetSeatIndex >= room.teamSize) {
        return { ok: false, message: '该队伍席位不存在' };
    }
    if (targetSeat === 'spectator' && targetSeatIndex >= room.spectatorSize) {
        return { ok: false, message: '该观战席不存在' };
    }

    // 放回原位：什么都不做
    if (source.seat === targetSeat && source.seatIndex === targetSeatIndex) {
        return { ok: true, swappedWithUserId: null, moved: false };
    }

    let occupant: RoomMember | null = null;
    for (const member of room.members.values()) {
        if (member.seat === targetSeat && member.seatIndex === targetSeatIndex) {
            occupant = member;
            break;
        }
    }

    // 空位：直接移动
    if (!occupant) {
        source.seat = targetSeat;
        source.seatIndex = targetSeatIndex;
        return { ok: true, swappedWithUserId: null, moved: true };
    }

    // 有人：互换席位
    const seat = source.seat;
    const seatIndex = source.seatIndex;
    source.seat = occupant.seat;
    source.seatIndex = occupant.seatIndex;
    occupant.seat = seat;
    occupant.seatIndex = seatIndex;

    return { ok: true, swappedWithUserId: occupant.userId, moved: false };
}

// 房主强制添加成员到指定队伍：按战网ID在 users 表里找人，人不在房间也能加
// （席位先占住，等他进房间时自动落位）
export async function forceAddMemberByTag(
    room: Room,
    byUserId: number,
    battletag: string,
    seat: SeatType
): Promise<{ ok: boolean; message?: string; battletag?: string }> {
    if (room.rosterLocked) return { ok: false, message: '名单已经锁定，不可更换席位' };
    if (room.ownerUserId !== byUserId) return { ok: false, message: '只有房主可以强制添加成员' };
    if (seat !== 'team1' && seat !== 'team2') return { ok: false, message: '只能加到队伍里' };

    const tag = String(battletag ?? '').trim();
    if (!tag) return { ok: false, message: '请选择要添加的用户' };

    // 从 users 表确认这个战网ID存在，并拿到 userId
    let target: { id: number; battletag: string } | undefined;
    try {
        const [rows] = await pool.query<any[]>(
            'SELECT id, battletag FROM users WHERE battletag = ? LIMIT 1',
            [tag]
        );
        target = rows[0];
    } catch (error) {
        console.error('[Undercover] 查询用户失败:', error);
        return { ok: false, message: '查询用户失败' };
    }

    if (!target) return { ok: false, message: `users 表里没有 ${tag}` };

    const seatIndex = firstFreeSeatIndex(room, seat);
    if (seatIndex < 0) return { ok: false, message: '该队伍席位已满' };

    const existing = room.members.get(target.id);
    if (existing) {
        existing.seat = seat;
        existing.seatIndex = seatIndex;
        existing.battletag = target.battletag;
        return { ok: true, battletag: target.battletag };
    }

    if (room.members.size >= roomMaxPlayers(room)) return { ok: false, message: '房间人数已满' };

    const member: RoomMember = {
        userId: target.id,
        battletag: target.battletag,
        seat,
        seatIndex,
        isOwner: false,
        connected: false,        // 还没进房间，等他连接后自动转为在线并保留席位
        disconnectedSince: null,
        ready: false,
        background: false,
        backgroundSince: null,
        joinedAt: Date.now()
    };

    room.members.set(target.id, member);
    room.emptySince = null;
    return { ok: true, battletag: target.battletag };
}

export function renameTeam(
    room: Room,
    userId: number,
    team: 'team1' | 'team2',
    name: string
): { ok: boolean; message?: string } {
    const member = room.members.get(userId);
    if (!member) return { ok: false, message: '你不在房间里' };
    if (!member.isOwner && room.ownerUserId !== userId) {
        return { ok: false, message: '只有房主可以修改队伍名称' };
    }
    if (team !== 'team1' && team !== 'team2') {
        return { ok: false, message: '队伍无效' };
    }

    const trimmed = String(name ?? '').trim().slice(0, 12);
    if (!trimmed) return { ok: false, message: '队伍名称不能为空' };

    if (team === 'team1') room.team1Name = trimmed;
    else room.team2Name = trimmed;
    return { ok: true };
}

export function setMemberBackground(room: Room, userId: number, background: boolean): void {
    const member = room.members.get(userId);
    if (!member) return;

    member.background = background;
    member.backgroundSince = background ? Date.now() : null;
}

// 房主主动把房主转让给指定玩家
export function transferOwnerTo(
    room: Room,
    byUserId: number,
    targetUserId: number
): { ok: boolean; message?: string } {
    if (room.ownerUserId !== byUserId) return { ok: false, message: '只有房主可以转让房主' };
    if (targetUserId === byUserId) return { ok: false, message: '你已经是房主' };

    const target = room.members.get(targetUserId);
    if (!target) return { ok: false, message: '该玩家已不在房间' };
    if (!target.connected) return { ok: false, message: '对方已断线，无法转让' };

    room.ownerUserId = targetUserId;
    for (const member of room.members.values()) {
        member.isOwner = member.userId === targetUserId;
    }
    return { ok: true };
}

/* =========================
   游戏阶段动作（选图等）
========================= */

// 使用道具（砸鸡蛋 / 献花）：返回一次性事件，由 WS 广播给房间内所有人播放动画
export function useItem(
    room: Room,
    fromUserId: number,
    item: unknown,
    targetUserId: number
): { ok: boolean; message?: string; event?: ItemEvent } {
    const type = ITEM_TYPES.includes(item as ItemType) ? (item as ItemType) : null;
    if (!type) return { ok: false, message: '道具不存在' };

    const from = room.members.get(fromUserId);
    if (!from) return { ok: false, message: '你不在房间里' };

    const target = room.members.get(targetUserId);
    if (!target) return { ok: false, message: '目标已离开房间' };
    if (target.userId === from.userId) return { ok: false, message: '不能对自己使用道具' };

    return {
        ok: true,
        event: {
            id: itemSeq++,
            item: type,
            fromUserId: from.userId,
            fromBattletag: from.battletag,
            toUserId: target.userId,
            toBattletag: target.battletag,
            at: Date.now()
        }
    };
}

// 广播一次性事件（道具动画等），不写进 state
export function broadcastEvent(room: Room, payload: unknown): void {
    const data = JSON.stringify(payload);

    for (const sockets of room.sockets.values()) {
        for (const ws of sockets) {
            if (ws.readyState === WebSocket.OPEN) ws.send(data);
        }
    }
}

function normalizeMapName(value: unknown): string {
    return String(value ?? '').trim().slice(0, MAP_NAME_MAX);
}

// 结束投票：票数最高的地图当选（并列则随机取其一）
function finishMapVote(room: Room): void {
    const tally = new Map<string, number>();
    for (const map of Object.values(room.mapVote.votes)) {
        tally.set(map, (tally.get(map) ?? 0) + 1);
    }

    if (tally.size === 0) {
        room.mapVote = { active: false, votes: {} };
        pushSystemMessage(room, '投票结束：本轮无人投票');
        return;
    }

    const max = Math.max(...tally.values());
    const top = [...tally.entries()].filter(([, count]) => count === max).map(([map]) => map);
    room.map = top[Math.floor(Math.random() * top.length)];

    // 投票结果发到系统消息（冠军票数 + 其余得票的地图，最多再列 3 个）
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const rest = ranked
        .filter(([map]) => map !== room.map)
        .slice(0, 3)
        .map(([map, count]) => `${map} ${count} 票`)
        .join('、');

    const result = `投票结果：${room.map}（${max} 票）${rest ? `，其余：${rest}` : ''}`;

    room.mapVote = { active: false, votes: {} };
    room.mapRecommendations.clear();
    pushSystemMessage(room, result);
}

function nextGameState(state: GameState): GameState {
    const index = GAME_STATES.indexOf(state);
    return GAME_STATES[(index + 1) % GAME_STATES.length];
}

// 公布某支队伍名单（按席位顺序，包含离线成员），如「队伍1名单为：Node#51456、Wode#51456」
function pushTeamRosterMessage(room: Room, seat: SeatType, label: string, broadcast = true): void {
    const names = [...room.members.values()]
        .filter((member) => member.seat === seat)
        .sort((a, b) => a.seatIndex - b.seatIndex)
        .map((member) => member.battletag)
        .join('、');

    pushSystemMessage(room, `${label}名单为：${names || '（暂无成员）'}`, broadcast);
}

export function handleGameAction(
    room: Room,
    userId: number,
    action: string,
    payload: { map?: unknown; userId?: unknown }
): { ok: boolean; message?: string } {
    const member = room.members.get(userId);
    if (!member) return { ok: false, message: '你不在房间里' };

    const isHost = room.ownerUserId === userId;
    // 房主始终共同拥有选图权
    const hasMapRight = isHost || room.mapOwnerUserId === userId;
    const mapName = normalizeMapName(payload.map);

    switch (action) {
        case 'chooseMap': {
            if (!hasMapRight) return { ok: false, message: '只有拥有选图权的人可以选图' };
            if (!mapName) return { ok: false, message: '地图不存在' };

            room.map = mapName;
            room.mapVote = { active: false, votes: {} };
            room.mapRecommendations.clear();
            return { ok: true };
        }

        // 向持图权者推荐地图：公屏发一条「推荐选择[地图]」，并在选图卡片底部展示
        case 'recommendMap': {
            if (!mapName) return { ok: false, message: '地图不存在' };

            room.mapRecommendations.set(userId, mapName);
            pushChatMessage(room, userId, member.battletag, `推荐选择[${mapName}]`, 'global');
            return { ok: true };
        }

        // 随机选择卧底：两支队伍各随机一名（包含离线与后台成员）
        case 'randomUndercover': {
            if (!isHost) return { ok: false, message: '只有房主可以选择卧底' };

            const picked: number[] = [];
            for (const team of ['team1', 'team2'] as SeatType[]) {
                const candidates = [...room.members.values()].filter((item) => item.seat === team);
                if (!candidates.length) continue;
                picked.push(candidates[Math.floor(Math.random() * candidates.length)].userId);
            }

            if (!picked.length) return { ok: false, message: '两支队伍都还没有成员' };

            room.undercoverIds = picked;
            room.undercoverPickMode = 'random';
            pushSystemMessage(room, '卧底已选出');
            return { ok: true };
        }

        // 指定卧底：仅房主、且房主坐在观战席时可用；点成员即指定该人为本局卧底
        case 'assignUndercover': {
            if (!isHost) return { ok: false, message: '只有房主可以指定卧底' };
            if (member.seat !== 'spectator') return { ok: false, message: '房主需坐在观战席才能指定卧底' };

            const target = room.members.get(Number(payload.userId));
            if (!target) return { ok: false, message: '该玩家不在房间' };

            const firstPick = room.undercoverIds.length === 0;
            room.undercoverIds = [target.userId];
            room.undercoverPickMode = 'assigned';

            if (firstPick) pushSystemMessage(room, '卧底已选出');
            return { ok: true };
        }

        // 准备 / 取消准备：仅准备阶段、且只有队伍里的成员可以准备
        case 'toggleReady': {
            if (room.gameState !== 'ready') return { ok: false, message: '当前不是准备阶段' };
            if (member.seat !== 'team1' && member.seat !== 'team2') {
                return { ok: false, message: '只有队伍成员需要准备' };
            }

            member.ready = !member.ready;
            return { ok: true };
        }

        // 开始比赛（房主）：全员准备后是「比赛开始」，否则是「强制开始」
        case 'startMatch': {
            if (!isHost) return { ok: false, message: '只有房主可以开始比赛' };
            if (room.gameState !== 'ready') return { ok: false, message: '当前不是准备阶段' };

            room.gameState = 'start';
            // 开始后清除准备标志
            for (const item of room.members.values()) item.ready = false;
            // 比赛开始 + 公布两队名单（一次广播下发，保持消息连续）
            pushSystemMessage(room, '比赛开始', false);
            pushTeamRosterMessage(room, 'team1', '队伍1', false);
            pushTeamRosterMessage(room, 'team2', '队伍2', false);
            broadcastRoom(room);
            return { ok: true };
        }

        // 结算阶段投票：只能投本队成员，或弃权（targetUserId = 0）
        case 'voteUndercover': {
            if (room.gameState !== 'settle') return { ok: false, message: '当前不是结算阶段' };
            if (!room.undercoverVote.active) return { ok: false, message: '投票已结束' };
            if (member.seat !== 'team1' && member.seat !== 'team2') {
                return { ok: false, message: '只有队伍成员可以投票' };
            }
            // 二次确认后即锁定：同一个人不能重复投票 / 改票
            if (room.undercoverVote.votes[userId] !== undefined) {
                return { ok: false, message: '你已投票，不可修改' };
            }

            const targetId = Number(payload.userId) || 0;
            if (targetId !== 0) {
                const target = room.members.get(targetId);
                if (!target) return { ok: false, message: '该玩家不在房间' };
                if (target.seat !== member.seat) return { ok: false, message: '只能给本队成员投票' };
            }

            room.undercoverVote.votes[userId] = targetId;

            const selfName = nameWithoutIdNumber(member.battletag);
            const text = targetId === 0
                ? `${selfName} 弃权`
                : `${selfName} 投给了 ${nameWithoutIdNumber(room.members.get(targetId)?.battletag ?? '')}`;

            pushSystemMessage(room, text, false);
            return { ok: true };
        }

        // 结束投票（房主）：结算最高票并公布卧底
        case 'finishUndercoverVote': {
            if (!isHost) return { ok: false, message: '只有房主可以结束投票' };
            if (room.gameState !== 'settle') return { ok: false, message: '当前不是结算阶段' };
            if (!room.undercoverVote.active) return { ok: false, message: '投票已结束' };

            room.undercoverVote.active = false;

            // 统计票数（弃权不计）
            const tally = new Map<number, number>();
            for (const targetId of Object.values(room.undercoverVote.votes)) {
                if (!targetId) continue;
                tally.set(targetId, (tally.get(targetId) ?? 0) + 1);
            }

            pushSystemMessage(room, '投票结束', false);

            if (tally.size > 0) {
                const max = Math.max(...tally.values());
                const top = [...tally.entries()].filter(([, count]) => count === max).map(([id]) => id);
                const picked = top[Math.floor(Math.random() * top.length)];
                const pickedName = nameWithoutIdNumber(room.members.get(picked)?.battletag ?? '');
                pushSystemMessage(room, `本次投票最高票：${pickedName}（${max} 票）`, false);
            } else {
                pushSystemMessage(room, '本次投票无人得票', false);
            }

            // 公布真正的卧底（供扫过动画与中屏展示）
            room.revealedUndercoverIds = [...room.undercoverIds];
            const names = room.undercoverIds
                .map((id) => nameWithoutIdNumber(room.members.get(id)?.battletag ?? ''))
                .filter(Boolean)
                .join('、');
            pushSystemMessage(room, `卧底是：${names || '（未指定）'}`, false);

            broadcastRoom(room);
            return { ok: true };
        }

        case 'grantMapRight': {
            if (!isHost) return { ok: false, message: '只有房主可以授予选图权' };

            const target = room.members.get(Number(payload.userId));
            if (!target) return { ok: false, message: '该玩家不在房间' };

            room.mapOwnerUserId = target.userId;
            return { ok: true };
        }

        case 'startMapVote': {
            if (!hasMapRight) return { ok: false, message: '只有拥有选图权的人可以发起投票' };

            room.mapVote = { active: true, votes: {} };
            return { ok: true };
        }

        case 'voteMap': {
            if (!room.mapVote.active) return { ok: false, message: '当前没有进行中的投票' };
            if (!mapName) return { ok: false, message: '地图不存在' };

            room.mapVote.votes[userId] = mapName;

            // 所有在线玩家都投完后自动结算
            const voters = new Set(Object.keys(room.mapVote.votes).map(Number));
            const online = [...room.members.values()].filter((m) => m.connected);
            if (online.length > 0 && online.every((m) => voters.has(m.userId))) finishMapVote(room);

            return { ok: true };
        }

        case 'finishMapVote': {
            if (!hasMapRight) return { ok: false, message: '只有拥有选图权的人可以结束投票' };

            finishMapVote(room);
            return { ok: true };
        }

        case 'next': {
            if (!isHost) return { ok: false, message: '只有房主可以推进阶段' };

            room.gameState = nextGameState(room.gameState);

            // 进入准备阶段：锁定成员名单
            if (room.gameState === 'ready') {
                room.rosterLocked = true;
                pushSystemMessage(room, '名单已经锁定，不可更换席位');
            }

            // 进入结算阶段：开启卧底投票
            if (room.gameState === 'settle') {
                room.undercoverVote = { active: true, votes: {} };
                room.revealedUndercoverIds = [];
                pushSystemMessage(room, '开始投票卧底');
            }

            if (room.gameState === 'map') {
                // 回到选图阶段：重置本局数据
                room.map = '';
                room.mapOwnerUserId = room.ownerUserId;
                room.mapVote = { active: false, votes: {} };
                room.mapRecommendations.clear();
                room.undercoverIds = [];
                room.undercoverPickMode = '';
                room.undercoverVote = { active: false, votes: {} };
                room.revealedUndercoverIds = [];
                room.rosterLocked = false;
                for (const item of room.members.values()) item.ready = false;
                // 新对局分割线
                pushSystemMessage(room, '------------分割线----------', false);
            }
            return { ok: true };
        }

        default:
            return { ok: false, message: '未知操作' };
    }
}

/* =========================
   WebSocket 连接管理
========================= */

export function attachSocket(room: Room, userId: number, ws: WebSocket): void {
    let set = room.sockets.get(userId);
    if (!set) {
        set = new Set();
        room.sockets.set(userId, set);
    }
    set.add(ws);
}

// 返回该用户是否还有其它连接
export function detachSocket(room: Room, userId: number, ws: WebSocket): boolean {
    const set = room.sockets.get(userId);
    if (!set) return false;

    set.delete(ws);
    if (set.size === 0) {
        room.sockets.delete(userId);
        return false;
    }
    return true;
}

export function sendTo(ws: WebSocket, payload: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

// 私密消息只推给收发双方
function canSeeMessage(message: ChatMessage, userId: number): boolean {
    if (message.system) return true;
    if (message.channel !== 'private') return true;
    return message.userId === userId || message.toUserId === userId;
}

// 向房间内所有连接推送最新状态（每个连接带上自己的 userId；私密消息按人过滤）
export function broadcastRoom(room: Room): void {
    const state = serializeRoom(room);

    for (const [userId, sockets] of room.sockets) {
        const payload = JSON.stringify({
            type: 'state',
            you: userId,
            room: {
                ...state,
                chat: state.chat.filter((message) => canSeeMessage(message, userId)),
                quiz: {
                    ...state.quiz,
                    // 每个人单独知道自己选了哪一项
                    yourAnswer: room.quiz.answers[userId]?.option ?? ''
                },
                game: {
                    ...state.game,
                    // 仅向卧底本人展示身份
                    youAreUndercover: room.undercoverIds.includes(userId)
                }
            }
        });

        for (const ws of sockets) {
            if (ws.readyState === WebSocket.OPEN) ws.send(payload);
        }
    }
}

function destroyRoom(room: Room, message: string): void {
    rooms.delete(room.roomNo);

    for (const sockets of room.sockets.values()) {
        for (const ws of sockets) {
            sendTo(ws, { type: 'closed', message });
            try {
                ws.close(1000, 'room closed');
            } catch {
                // 忽略关闭异常
            }
        }
    }

    room.sockets.clear();
    room.members.clear();
}

/* =========================
   刷题战：题目抽取与游戏流程
   配置 → 准备 → 每题 10s 作答 → 30s 投票进入下一题 → 结算
========================= */

export const QUIZ_QUESTION_COUNT = 10;
export const QUIZ_QUESTION_MS = 10 * 1000;
export const QUIZ_VOTE_MS = 30 * 1000;

export interface QuizOption {
    key: string;
    text: string;
}

export interface QuizResources {
    images: string[];
    videos: string[];
    audios: string[];
}

export interface QuizQuestionSnapshot {
    id: number;
    title: string;
    subtitle: string;
    options: QuizOption[];
    answer: string;
    explanation: string;
    resources: QuizResources;
    tags: string[];
    difficulty: number;
}

export type QuizPhase = 'config' | 'ready' | 'question' | 'vote' | 'finished';

export interface RoomQuizState {
    phase: QuizPhase;
    config: { tags: string[]; minDifficulty: number; maxDifficulty: number };
    questions: QuizQuestionSnapshot[];
    index: number;
    questionEndsAt: number;   // 当前题目截止时间（毫秒时间戳）
    voteEndsAt: number;       // 当前投票截止时间
    votes: Record<number, 'next'>;                                  // 投票进入下一题的人
    answers: Record<number, { option: string; correct: boolean }>;  // 本题作答
    scores: Record<number, number>;                                 // 累计答对数
    readyUserIds: number[];                                         // 准备阶段点了「准备」的人
    startedAt: number;
}

function emptyQuizState(): RoomQuizState {
    return {
        phase: 'config',
        config: { tags: [], minDifficulty: 0, maxDifficulty: 255 },
        questions: [],
        index: 0,
        questionEndsAt: 0,
        voteEndsAt: 0,
        votes: {},
        answers: {},
        scores: {},
        readyUserIds: [],
        startedAt: 0
    };
}

function parseQuizJson<T>(value: unknown, fallback: T): T {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'object') return value as T;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function clampByte(value: unknown, fallback: number): number {
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(0, Math.min(255, Math.round(num)));
}

// 房主设置题目范围（标签 / 难度区间）
export function configureQuiz(
    room: Room,
    userId: number,
    payload: { tags?: unknown; minDifficulty?: unknown; maxDifficulty?: unknown }
): { ok: boolean; message?: string } {
    if (room.mode !== 'quiz') return { ok: false, message: '当前房间不是刷题战' };
    if (room.ownerUserId !== userId) return { ok: false, message: '只有房主可以设置题目范围' };
    if (room.quiz.phase === 'question' || room.quiz.phase === 'vote') {
        return { ok: false, message: '游戏进行中不能修改题目范围' };
    }

    const tags = Array.isArray(payload.tags)
        ? payload.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean).slice(0, 12)
        : [];

    let minDifficulty = clampByte(payload.minDifficulty, 0);
    let maxDifficulty = clampByte(payload.maxDifficulty, 255);
    if (minDifficulty > maxDifficulty) [minDifficulty, maxDifficulty] = [maxDifficulty, minDifficulty];

    room.quiz.config = { tags, minDifficulty, maxDifficulty };
    room.quiz.phase = 'config';
    return { ok: true };
}

// 进入准备阶段（房主）
export function prepareQuiz(room: Room, userId: number): { ok: boolean; message?: string } {
    if (room.mode !== 'quiz') return { ok: false, message: '当前房间不是刷题战' };
    if (room.ownerUserId !== userId) return { ok: false, message: '只有房主可以开始准备' };
    if (room.quiz.phase === 'question' || room.quiz.phase === 'vote') {
        return { ok: false, message: '游戏进行中' };
    }

    room.quiz.phase = 'ready';
    room.quiz.readyUserIds = [];
    return { ok: true };
}

// 准备阶段：成员点「准备 / 取消准备」
export function setQuizReady(
    room: Room,
    userId: number,
    ready: boolean
): { ok: boolean; message?: string } {
    if (room.mode !== 'quiz') return { ok: false, message: '当前房间不是刷题战' };
    if (room.quiz.phase !== 'ready') return { ok: false, message: '当前不在准备阶段' };
    if (!room.members.has(userId)) return { ok: false, message: '你不在房间里' };

    const readySet = new Set(room.quiz.readyUserIds);
    if (ready) readySet.add(userId);
    else readySet.delete(userId);
    room.quiz.readyUserIds = [...readySet];

    return { ok: true };
}

// 抽题：按标签与难度区间随机取 10 道（题目不足时有多少抽多少）
async function drawQuizQuestions(room: Room): Promise<QuizQuestionSnapshot[]> {
    const where: string[] = [`status = 'published'`];
    const params: any[] = [];

    const { tags, minDifficulty, maxDifficulty } = room.quiz.config;
    if (tags.length) {
        // 任一标签命中即可（JSON 数组包含）
        where.push(`(${tags.map(() => 'JSON_CONTAINS(tags, JSON_QUOTE(?))').join(' OR ')})`);
        params.push(...tags);
    }
    where.push('difficulty >= ?', 'difficulty <= ?');
    params.push(minDifficulty, maxDifficulty);

    try {
        const [rows] = await pool.query<any[]>(
            `SELECT id, title, subtitle, options, answer, explanation, resources, tags, difficulty
               FROM quiz_questions
              WHERE ${where.join(' AND ')}
              ORDER BY RAND()
              LIMIT ${QUIZ_QUESTION_COUNT}`,
            params
        );

        return rows.map((row) => ({
            id: Number(row.id),
            title: String(row.title ?? ''),
            subtitle: String(row.subtitle ?? ''),
            options: parseQuizJson<QuizOption[]>(row.options, []),
            answer: String(row.answer ?? ''),
            explanation: String(row.explanation ?? ''),
            resources: parseQuizJson<QuizResources>(row.resources, { images: [], videos: [], audios: [] }),
            tags: parseQuizJson<string[]>(row.tags, []),
            difficulty: Number(row.difficulty ?? 0)
        }));
    } catch (error) {
        console.error('[刷题战] 抽题失败:', error);
        return [];
    }
}

// 开始游戏（房主）：抽题 → 进入第一题
export async function startQuiz(room: Room, userId: number): Promise<{ ok: boolean; message?: string }> {
    if (room.mode !== 'quiz') return { ok: false, message: '当前房间不是刷题战' };
    if (room.ownerUserId !== userId) return { ok: false, message: '只有房主可以开始游戏' };

    const questions = await drawQuizQuestions(room);
    if (questions.length === 0) return { ok: false, message: '没有符合条件的题目，请放宽范围或先往题库加题' };

    room.quiz.questions = questions;
    room.quiz.index = 0;
    room.quiz.answers = {};
    room.quiz.votes = {};
    room.quiz.scores = {};
    room.quiz.readyUserIds = [];
    room.quiz.startedAt = Date.now();
    room.quiz.phase = 'question';
    room.quiz.questionEndsAt = Date.now() + QUIZ_QUESTION_MS;
    room.quiz.voteEndsAt = 0;
    room.rosterLocked = true;

    return { ok: true };
}

// 作答（每题每人一次）
export function answerQuiz(
    room: Room,
    userId: number,
    option: string
): { ok: boolean; message?: string } {
    if (room.mode !== 'quiz') return { ok: false, message: '当前房间不是刷题战' };
    if (room.quiz.phase !== 'question') return { ok: false, message: '当前不在作答阶段' };
    if (!room.members.has(userId)) return { ok: false, message: '你不在房间里' };

    const question = room.quiz.questions[room.quiz.index];
    if (!question) return { ok: false, message: '题目不存在' };

    const key = String(option ?? '').trim().toUpperCase();
    if (!question.options.some((item) => item.key === key)) return { ok: false, message: '选项无效' };

    // 倒计时结束前允许改选：先撤销上一次的计分，再按新选项计分
    const previous = room.quiz.answers[userId];
    if (previous?.correct) {
        room.quiz.scores[userId] = Math.max(0, (room.quiz.scores[userId] ?? 0) - 1);
    }

    const correct = key === question.answer;
    room.quiz.answers[userId] = { option: key, correct };
    if (correct) room.quiz.scores[userId] = (room.quiz.scores[userId] ?? 0) + 1;

    return { ok: true };
}

// 投票进入下一题
export function voteNextQuiz(room: Room, userId: number): { ok: boolean; message?: string } {
    if (room.mode !== 'quiz') return { ok: false, message: '当前房间不是刷题战' };
    if (room.quiz.phase !== 'vote') return { ok: false, message: '当前不在投票阶段' };
    if (!room.members.has(userId)) return { ok: false, message: '你不在房间里' };

    room.quiz.votes[userId] = 'next';

    // 在线成员过半同意 → 立即进入下一题
    const online = [...room.members.values()].filter((member) => member.connected);
    const voted = Object.keys(room.quiz.votes).length;
    if (online.length > 0 && voted * 2 >= online.length) advanceQuizQuestion(room);

    return { ok: true };
}

// 进入下一题（或结算）
export function advanceQuizQuestion(room: Room, now = Date.now()): void {
    room.quiz.index += 1;
    room.quiz.answers = {};
    room.quiz.votes = {};
    room.quiz.voteEndsAt = 0;

    if (room.quiz.index >= room.quiz.questions.length) {
        room.quiz.phase = 'finished';
        room.quiz.questionEndsAt = 0;
        room.rosterLocked = false;
        return;
    }

    room.quiz.phase = 'question';
    room.quiz.questionEndsAt = now + QUIZ_QUESTION_MS;
}

// 倒计时推进：作答 10s 结束 → 投票 30s；投票超时 → 下一题
export function processQuizTimers(room: Room, now: number): boolean {
    if (room.mode !== 'quiz') return false;
    const quiz = room.quiz;

    if (quiz.phase === 'question' && quiz.questionEndsAt && now >= quiz.questionEndsAt) {
        quiz.phase = 'vote';
        quiz.voteEndsAt = now + QUIZ_VOTE_MS;
        return true;
    }

    if (quiz.phase === 'vote' && quiz.voteEndsAt && now >= quiz.voteEndsAt) {
        advanceQuizQuestion(room, now);
        return true;
    }

    return false;
}

/* =========================
   定时巡检：空房销毁 + 房主后台超时移交
========================= */

let ticker: NodeJS.Timeout | null = null;
let quizTicker: NodeJS.Timeout | null = null;
let tickRunning = false;

function startTicker(): void {
    if (ticker) return;
    ticker = setInterval(() => {
        void tick();
    }, TICK_MS);

    // 刷题战倒计时需要秒级精度：每秒推进一步（10s 作答 / 30s 投票）
    if (!quizTicker) {
        quizTicker = setInterval(() => {
            const now = Date.now();
            for (const room of rooms.values()) {
                if (processQuizTimers(room, now)) broadcastRoom(room);
            }
        }, 1000);
    }
}

async function tick(): Promise<void> {
    if (tickRunning) return;
    tickRunning = true;

    try {
        const now = Date.now();

        for (const room of [...rooms.values()]) {
            // 过期的交换位置申请直接丢弃
            for (const [targetId, request] of [...room.swapRequests]) {
                if (now - request.at > SEAT_SWAP_TTL_MS) room.swapRequests.delete(targetId);
            }

            // 观战席玩家断线超过 1 分钟 → 清除；队伍栏玩家不因断线移除
            for (const member of [...room.members.values()]) {
                if (member.connected || member.seat !== 'spectator') continue;
                // 房主在观战席时不会被清除
                if (member.userId === room.ownerUserId) continue;
                if (member.disconnectedSince === null) continue;
                if (now - member.disconnectedSince < SPECTATOR_DISCONNECT_TTL_MS) continue;

                const removed = await removeMember(room, member.userId);
                if (!removed) continue;

                room.sockets.delete(member.userId);
                // 断线相关变化不发系统消息，只广播最新状态
                broadcastRoom(room);
            }

            // 房间无用户（待清除的观战席玩家不算成员）：1 分钟后销毁
            if (roomPlayerCount(room) === 0) {
                if (room.emptySince === null) room.emptySince = now;
                if (now - room.emptySince >= ROOM_EMPTY_DESTROY_MS) {
                    destroyRoom(room, '房间长时间无人，已自动解散');
                }
                continue;
            }

            room.emptySince = null;

            // 房主断线满 1 分钟 → 自动移交房主（只切后台仍算在线，始终不移交）
            const owner = room.members.get(room.ownerUserId);
            if (
                owner &&
                !owner.connected &&
                owner.disconnectedSince !== null &&
                now - owner.disconnectedSince >= HOST_DISCONNECT_TRANSFER_MS
            ) {
                const previousOwner = room.ownerUserId;
                await transferOwner(room);

                const newOwner = room.members.get(room.ownerUserId);
                if (room.ownerUserId !== previousOwner && newOwner) {
                    pushSystemMessage(room, `房主已转让给 ${nameWithoutIdNumber(newOwner.battletag)}`);
                } else {
                    broadcastRoom(room);
                }
            }
        }
    } catch (error) {
        console.error('[Undercover] 房间巡检失败:', error);
    } finally {
        tickRunning = false;
    }
}
