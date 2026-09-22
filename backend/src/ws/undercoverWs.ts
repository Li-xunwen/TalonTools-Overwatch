import { IncomingMessage, Server as HttpServer } from 'http';
import { Duplex } from 'stream';
import jwt from 'jsonwebtoken';
import { WebSocket, WebSocketServer } from 'ws';
import {
    attachSocket,
    answerQuiz,
    broadcastRoom,
    broadcastEvent,
    configureQuiz,
    detachSocket,
    dissolveRoom,
    exitRoom,
    forceAddMemberByTag,
    getRoomByNo,
    handleGameAction,
    hostDragToSeat,
    joinRoom,
    leaveRoom,
    moveMemberSeat,
    moveOtherMemberSeat,
    nameWithoutIdNumber,
    prepareQuiz,
    pushChatMessage,
    pushSystemMessage,
    pushVoiceMessage,
    renameTeam,
    requestSeatSwap,
    respondSeatSwap,
    sendTo,
    setQuizReady,
    startQuiz,
    setMemberBackground,
    voteNextQuiz,
    transferOwnerTo,
    useItem
} from '../services/undercoverRooms';

// 前端通过 Vite 代理访问：ws(s)://<前端域名>/api/undercover/ws?room=4829&token=<JWT>
const WS_PATH = '/api/undercover/ws';

// 连接保活探测间隔
const PING_INTERVAL_MS = 30 * 1000;

interface ConnContext {
    userId: number;
    battletag: string;
    roomNo: string;
}

function rejectUpgrade(socket: Duplex, status: number, message: string): void {
    socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
    socket.destroy();
}

export function initUndercoverWs(server: HttpServer): void {
    const wss = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (url.pathname !== WS_PATH) {
            socket.destroy();
            return;
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
            rejectUpgrade(socket, 500, 'Internal Server Error');
            return;
        }

        // 浏览器 WebSocket 无法自定义请求头，因此 token 走查询参数
        const token = url.searchParams.get('token') ?? '';
        let decoded: { userId?: number; battletag?: string };
        try {
            decoded = jwt.verify(token, secret) as { userId?: number; battletag?: string };
        } catch {
            rejectUpgrade(socket, 401, 'Unauthorized');
            return;
        }

        const roomNo = url.searchParams.get('room') ?? '';
        const room = getRoomByNo(roomNo);
        if (!room) {
            rejectUpgrade(socket, 404, 'Room Not Found');
            return;
        }

        (req as IncomingMessage & { undercover?: ConnContext }).undercover = {
            userId: Number(decoded.userId),
            battletag: String(decoded.battletag ?? ''),
            roomNo
        };

        wss.handleUpgrade(req, socket, head, (ws) => {
            wss.emit('connection', ws, req);
        });
    });

    wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
        const ctx = (req as IncomingMessage & { undercover?: ConnContext }).undercover;
        if (!ctx) {
            ws.close(4000, 'bad context');
            return;
        }

        const room = getRoomByNo(ctx.roomNo);
        if (!room) {
            ws.close(4004, 'room not found');
            return;
        }

        // 建立房间会话：已在房间里则保持原席位，否则默认进观战席
        const isNewMember = !room.members.has(ctx.userId);
        const member = joinRoom(room, ctx.userId, ctx.battletag);
        if (!member) {
            sendTo(ws, { type: 'error', message: '房间人数已满' });
            ws.close(4003, 'room full');
            return;
        }

        attachSocket(room, ctx.userId, ws);
        sendTo(ws, { type: 'ready', you: ctx.userId, roomNo: room.roomNo });
        if (isNewMember) pushSystemMessage(room, `${nameWithoutIdNumber(ctx.battletag)} 加入了房间`);
        else broadcastRoom(room);

        // 连接保活：30 秒探测一次，无响应则断开
        let alive = true;
        ws.on('pong', () => {
            alive = true;
        });
        const pingTimer = setInterval(() => {
            if (!alive) {
                ws.terminate();
                return;
            }
            alive = false;
            try {
                ws.ping();
            } catch {
                // 忽略 ping 异常，交给 close 处理
            }
        }, PING_INTERVAL_MS);

        ws.on('message', (raw) => {
            let msg: any;
            try {
                msg = JSON.parse(String(raw));
            } catch {
                return;
            }

            switch (msg?.type) {
                case 'move': {
                    const result = moveMemberSeat(room, ctx.userId, msg.seat, Number(msg.index));
                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '移动失败' });
                    else broadcastRoom(room);
                    break;
                }

                case 'renameTeam': {
                    const result = renameTeam(room, ctx.userId, msg.team, msg.name);
                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '修改队伍名称失败' });
                    else broadcastRoom(room);
                    break;
                }

                case 'chat': {
                    if (msg.kind === 'voice') {
                        const result = pushVoiceMessage(
                            room,
                            ctx.userId,
                            ctx.battletag,
                            msg.voice ?? {},
                            msg.channel,
                            msg.toUserId ? Number(msg.toUserId) : null
                        );
                        if (!result.ok) sendTo(ws, { type: 'error', message: result.error ?? '语音发送失败' });
                        break;
                    }

                    const message = pushChatMessage(
                        room,
                        ctx.userId,
                        ctx.battletag,
                        msg.text,
                        msg.channel,
                        msg.toUserId ? Number(msg.toUserId) : null
                    );
                    if (!message) sendTo(ws, { type: 'error', message: '消息不能为空' });
                    break;
                }

                case 'moveMember': {
                    const result = moveOtherMemberSeat(room, ctx.userId, Number(msg.userId), msg.seat);
                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '移动失败' });
                    else broadcastRoom(room);
                    break;
                }

                case 'hostDragSeat': {
                    const result = hostDragToSeat(
                        room,
                        ctx.userId,
                        Number(msg.userId),
                        msg.seat,
                        Number(msg.index)
                    );
                    if (!result.ok) {
                        sendTo(ws, { type: 'error', message: result.message ?? '拖动失败' });
                        break;
                    }
                    broadcastRoom(room);
                    break;
                }

                case 'requestSwap': {
                    const targetUserId = Number(msg.userId);
                    const result = requestSeatSwap(room, ctx.userId, targetUserId);
                    if (!result.ok) {
                        sendTo(ws, { type: 'error', message: result.message ?? '申请失败' });
                        break;
                    }
                    sendTo(ws, {
                        type: 'swapSent',
                        toUserId: targetUserId,
                        toDisplayName: nameWithoutIdNumber(room.members.get(targetUserId)?.battletag ?? '')
                    });
                    break;
                }

                case 'respondSwap': {
                    const result = respondSeatSwap(
                        room,
                        ctx.userId,
                        Number(msg.requestId),
                        msg.accept === true
                    );
                    if (!result.ok) {
                        sendTo(ws, { type: 'error', message: result.message ?? '处理失败' });
                        break;
                    }

                    // 通知申请人结果
                    const fromUserId = result.fromUserId;
                    if (fromUserId !== undefined) {
                        for (const targetWs of room.sockets.get(fromUserId) ?? []) {
                            sendTo(targetWs, {
                                type: 'swapResult',
                                accepted: result.accepted === true,
                                byDisplayName: nameWithoutIdNumber(ctx.battletag)
                            });
                        }
                    }
                    if (result.accepted) broadcastRoom(room);
                    break;
                }

                case 'transferOwner': {
                    const targetUserId = Number(msg.userId);
                    const targetTag = room.members.get(targetUserId)?.battletag ?? '';
                    const result = transferOwnerTo(room, ctx.userId, targetUserId);

                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '转让房主失败' });
                    else pushSystemMessage(room, `房主已转让给 ${nameWithoutIdNumber(targetTag)}`);
                    break;
                }

                case 'exit': {
                    // 主动退出：立刻移除（房主在前端先选择转让或解散）
                    void exitRoom(room, ctx.userId).catch((error) =>
                        console.error('[Undercover] 退出房间处理失败:', error)
                    );
                    break;
                }

                case 'dissolveRoom': {
                    if (room.ownerUserId !== ctx.userId) {
                        sendTo(ws, { type: 'error', message: '只有房主可以解散房间' });
                        break;
                    }
                    dissolveRoom(room);
                    break;
                }

                case 'game': {
                    const result = handleGameAction(room, ctx.userId, String(msg.action ?? ''), msg);
                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '操作失败' });
                    else broadcastRoom(room);
                    break;
                }

                case 'quiz': {
                    const action = String(msg.action ?? '');

                    if (action === 'start') {
                        void startQuiz(room, ctx.userId)
                            .then((result) => {
                                if (!result.ok) {
                                    sendTo(ws, { type: 'error', message: result.message ?? '开始失败' });
                                    return;
                                }
                                broadcastRoom(room);
                            })
                            .catch((error) => console.error('[刷题战] 开始游戏失败:', error));
                        break;
                    }

                    let result: { ok: boolean; message?: string };
                    if (action === 'config') {
                        result = configureQuiz(room, ctx.userId, {
                            tags: msg.tags,
                            minDifficulty: msg.minDifficulty,
                            maxDifficulty: msg.maxDifficulty,
                            questionCount: msg.questionCount
                        });
                    } else if (action === 'prepare') {
                        result = prepareQuiz(room, ctx.userId);
                    } else if (action === 'ready') {
                        result = setQuizReady(room, ctx.userId, msg.value !== false);
                    } else if (action === 'answer') {
                        result = answerQuiz(room, ctx.userId, String(msg.option ?? ''));
                    } else if (action === 'vote') {
                        result = voteNextQuiz(room, ctx.userId);
                    } else {
                        result = { ok: false, message: '未知的刷题战操作' };
                    }

                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '操作失败' });
                    else broadcastRoom(room);
                    break;
                }

                case 'forceAddMember': {
                    const seat = msg.seat;
                    void forceAddMemberByTag(room, ctx.userId, String(msg.battletag ?? ''), seat)
                        .then((result) => {
                            if (!result.ok) {
                                sendTo(ws, { type: 'error', message: result.message ?? '添加失败' });
                                return;
                            }

                            pushSystemMessage(
                                room,
                                `${nameWithoutIdNumber(result.battletag ?? '')} 被房主加入${seat === 'team1' ? '队伍1' : '队伍2'}`
                            );
                        })
                        .catch((error) => console.error('[Undercover] 强制添加成员失败:', error));
                    break;
                }

                case 'item': {
                    const result = useItem(room, ctx.userId, msg.item, Number(msg.targetUserId));
                    if (!result.ok) sendTo(ws, { type: 'error', message: result.message ?? '道具使用失败' });
                    else broadcastEvent(room, { type: 'item', event: result.event });
                    break;
                }

                case 'background': {
                    setMemberBackground(room, ctx.userId, msg.value === true);
                    broadcastRoom(room);
                    break;
                }

                case 'ping': {
                    sendTo(ws, { type: 'pong' });
                    break;
                }

                default:
                    break;
            }
        });

        ws.on('close', () => {
            clearInterval(pingTimer);

            const hasOtherSockets = detachSocket(room, ctx.userId, ws);
            if (hasOtherSockets) {
                broadcastRoom(room);
                return;
            }

            // 最后一个连接断开 = 断线（队伍栏保留席位、观战席 1 分钟后清除）
            // 只更新状态，不发系统消息
            void leaveRoom(room, ctx.userId)
                .then(() => broadcastRoom(room))
                .catch((error) => console.error('[Undercover] 断线处理失败:', error));
        });

        ws.on('error', (error) => {
            console.error('[Undercover] WebSocket 错误:', error);
        });
    });
}
