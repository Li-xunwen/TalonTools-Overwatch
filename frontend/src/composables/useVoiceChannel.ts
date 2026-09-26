/**
 * 房间内语音频道（LiveKit 客户端）
 *
 * 频道模型（设计文档 work6.md §0.5）：
 *   公共频道（橙）：所有人可听
 *   蓝色频道（蓝）：说话者在队伍1 → 队伍1 + 观战席可听；队伍2 → 队伍2 + 观战席；观战席 → 仅观战席
 * 订阅权限由后端强制；本文件只负责发布/订阅、音轨切换、本地门限与发言状态。
 */
import { ref, shallowRef, computed, watch } from 'vue'
import {
  Room,
  RoomEvent,
  Track,
  type Participant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client'
import { useRoomSettings } from './useRoomSettings'

export type VoiceMicChannel = 'muted' | 'public' | 'blue'
export type VoiceListenChannel = 'public' | 'blue'

export interface VoiceSpeaker {
  identity: string
  displayName: string
  seat: string
  isOwner: boolean
  channel: VoiceListenChannel
}

/** 与后端 voiceChannel.ts 保持一致 */
const TRACK_PUBLIC = 'ch-public'
const TRACK_BLUE = 'ch-blue'

type VoiceStatus = 'idle' | 'connecting' | 'connected' | 'error'

function createVoiceChannel() {
  const { micThresholdPublic, micThresholdBlue, voiceVolume } = useRoomSettings()

  const status = ref<VoiceStatus>('idle')
  const errorText = ref('')
  /** 断开原因（LiveKit 的 DisconnectReason），用于自检显示与排查 */
  const disconnectReason = ref('')
  const micChannel = ref<VoiceMicChannel>('muted')
  /** 当前真正发布出去的频道（用于面板上的自检显示） */
  const publishedChannel = ref<VoiceMicChannel>('muted')
  const listen = ref<Record<VoiceListenChannel, boolean>>({ public: true, blue: true })
  const localLevel = ref(0)
  const speakers = ref<VoiceSpeaker[]>([])
  const safeToPublish = ref(false)

  const room = shallowRef<Room | null>(null)
  const roomNo = ref('')
  /**
   * 会话代号：每次连接/断开都会 +1。
   * 用来丢弃「迟到的旧操作」——例如组件重挂载时，旧实例的 disconnect() 晚于
   * 新实例的 connect() 返回，会把状态错误地改回「未连接」。
   */
  let sessionSeq = 0

  // 远端音频：每个身份一个 MediaStreamAudioSource → GainNode（音量增益可超过 100%）
  const audioContext = shallowRef<AudioContext | null>(null)
  const remoteNodes = new Map<string, { el: HTMLAudioElement; gain: GainNode | null; wired: boolean }>()

  /**
   * 本地采集链路：麦 → Web Audio（分析 + 门限增益）→ 合成输出轨 → 发布给 LiveKit。
   *
   * 为什么不直接 mute LiveKit 的本地音轨来做门限：
   * livekit-client 的 `LocalAudioTrack.mute()` 会 `stop()` / 禁用底层 MediaStreamTrack，
   * 而门限恰恰要靠读这条音轨的音量来决定何时恢复——一旦静音就再也测不到声音，
   * 麦克风永远不会解开（表现：**没有声音 + 音量环恒为 0**）。改在增益节点上门限后，
   * 采集轨始终存活、音量环正常，静音期靠 Opus 的 DTX 不发包。
   */
  interface MicGraph {
    stream: MediaStream
    source: MediaStreamAudioSourceNode
    analyser: AnalyserNode
    gate: GainNode
    dest: MediaStreamAudioDestinationNode
    track: MediaStreamTrack
  }

  const micGraph = shallowRef<MicGraph | null>(null)
  let publishedTrack: MediaStreamTrack | null = null
  /** 兜底路径下用的是 LiveKit 自己创建的麦克风轨（需要用它自己的开关来取消发布） */
  let fallbackPublished = false
  let localTimer: number | null = null
  let silenceSince = 0
  let voiceSince = 0
  let gateOpen = false

  const currentThreshold = computed(() =>
    micChannel.value === 'blue' ? micThresholdBlue.value : micThresholdPublic.value
  )

  /* ---------- 工具 ---------- */

  function ensureAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!audioContext.value) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      audioContext.value = new Ctor()
    }
    if (audioContext.value.state === 'suspended') audioContext.value.resume().catch(() => undefined)
    return audioContext.value
  }

  function gainValue(): number {
    return Math.max(0, Math.min(2, (Number(voiceVolume.value) || 100) / 100))
  }

  function metadataOf(participant: Participant) {
    try {
      const meta = participant.metadata ? JSON.parse(participant.metadata) : {}
      return {
        displayName: String(meta.displayName ?? participant.name ?? participant.identity),
        seat: String(meta.seat ?? 'spectator'),
        isOwner: Boolean(meta.isOwner),
      }
    } catch {
      return { displayName: participant.name || participant.identity, seat: 'spectator', isOwner: false }
    }
  }

  function channelOf(participant: Participant): VoiceListenChannel {
    const pub = participant.getTrackPublication(Track.Source.Microphone)
    return pub?.trackName === TRACK_BLUE ? 'blue' : 'public'
  }

  /** 本地是否在监听某条远端音轨 */
  function shouldListen(participant: Participant): boolean {
    return listen.value[channelOf(participant)]
  }

  /** 把「是否订阅」应用到远端麦克风发布上（服务端权限之外的第二层：本地偏好） */
  function applyListenPreferences() {
    const r = room.value
    if (!r) return
    for (const p of r.remoteParticipants.values()) {
      const pub = p.getTrackPublication(Track.Source.Microphone) as RemoteTrackPublication | undefined
      if (!pub) continue
      const wanted = shouldListen(p)
      if (pub.isSubscribed !== wanted) pub.setSubscribed(wanted)
    }
    refreshSpeakers()
  }

  /* ---------- 发言栏 ---------- */

  function refreshSpeakers(active?: Participant[]) {
    const r = room.value
    if (!r) {
      speakers.value = []
      return
    }
    const list = active ?? r.activeSpeakers ?? []
    const result: VoiceSpeaker[] = []
    for (const p of list) {
      const channel = channelOf(p)
      if (!listen.value[channel]) continue
      const meta = metadataOf(p)
      result.push({ identity: p.identity, channel, ...meta })
    }
    result.sort((a, b) => a.identity.localeCompare(b.identity))
    speakers.value = result
  }

  /* ---------- 本地采集门限 ---------- */

  function stopLocalMeter() {
    if (localTimer !== null) {
      window.clearInterval(localTimer)
      localTimer = null
    }
    localLevel.value = 0
    voiceSince = 0
    silenceSince = 0
  }

  /** 释放麦克风采集链路（闭麦 / 离开房间时调用，关掉系统录音指示灯） */
  function releaseMicGraph() {
    stopLocalMeter()
    const graph = micGraph.value
    if (!graph) return
    try {
      graph.source.disconnect()
      graph.analyser.disconnect()
      graph.gate.disconnect()
    } catch { /* 忽略 */ }
    graph.stream.getTracks().forEach((track) => track.stop())
    micGraph.value = null
    gateOpen = false
  }

  async function ensureMicGraph(): Promise<MicGraph | null> {
    if (micGraph.value) return micGraph.value
    const ctx = ensureAudioContext()
    if (!ctx) return null

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
    } catch (error) {
      console.warn('[语音] 无法获取麦克风：', error)
      throw new Error('无法获取麦克风，请检查浏览器权限与系统麦克风设置')
    }

    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    const gate = ctx.createGain()
    gate.gain.value = 0 // 先关闸，等门限判断
    const dest = ctx.createMediaStreamDestination()
    source.connect(analyser) // 分析原始音量（不受门限影响）
    source.connect(gate)
    gate.connect(dest)

    const graph: MicGraph = { stream, source, analyser, gate, dest, track: dest.stream.getAudioTracks()[0] }
    micGraph.value = graph
    // AudioContext 处于 suspended 时整条链路都是静音，进房间后的第一次点击必须把它唤醒
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
    return graph
  }

  /** 门限主循环：读数 → 起音 150ms 开闸 / 释音 300ms 关闸 */
  function startLocalMeter(graph: MicGraph) {
    stopLocalMeter()
    const ctx = ensureAudioContext()
    if (!ctx) return
    const buffer = new Uint8Array(graph.analyser.fftSize)
    const now = () => performance.now()
    voiceSince = 0
    silenceSince = 0
    gateOpen = false
    graph.gate.gain.setValueAtTime(0, ctx.currentTime)

    localTimer = window.setInterval(() => {
      const node = micGraph.value?.analyser
      if (!node) return
      node.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      localLevel.value = rms

      // 开闸按设定阈值，关闸比阈值低 6 dB——避免环境底噪正好卡在阈值上时来回开合
      const openAt = Math.pow(10, currentThreshold.value / 20)
      const closeAt = openAt * 0.5
      const t = now()
      if (rms >= openAt || (gateOpen && rms >= closeAt)) {
        voiceSince = voiceSince || t
        silenceSince = 0
        if (!gateOpen && t - voiceSince >= 150) {
          gateOpen = true
          graph.gate.gain.setTargetAtTime(1, ctx.currentTime, 0.01)
        }
      } else {
        voiceSince = 0
        silenceSince = silenceSince || t
        if (gateOpen && t - silenceSince >= 300) {
          gateOpen = false
          graph.gate.gain.setTargetAtTime(0, ctx.currentTime, 0.01)
        }
      }
    }, 60)
  }

  /**
   * 兜底音量表：当 Web Audio 不可用（或 AudioContext 被浏览器挂起）时，
   * 用 LiveKit 自己算好的 audioLevel 驱动音量环，同时以普通方式发布麦克风。
   * 宁可门限失效也要保证有声音。
   */
  function startFallbackMeter() {
    stopLocalMeter()
    localTimer = window.setInterval(() => {
      localLevel.value = room.value?.localParticipant.audioLevel ?? 0
    }, 100)
  }

  /* ---------- 发布 ---------- */

  async function unpublishMic(keepCapture = true) {
    stopLocalMeter()
    const r = room.value
    if (r) {
      if (publishedTrack) {
        await r.localParticipant.unpublishTrack(publishedTrack, false).catch(() => undefined)
      } else if (fallbackPublished) {
        await r.localParticipant.setMicrophoneEnabled(false).catch(() => undefined)
      }
    }
    publishedTrack = null
    fallbackPublished = false
    publishedChannel.value = 'muted'
    if (!keepCapture) releaseMicGraph()
  }

  async function publishMic(channel: VoiceMicChannel) {
    const r = room.value
    if (!r) return
    if (channel === 'muted') {
      await unpublishMic(false)
      return
    }
    const trackName = channel === 'blue' ? TRACK_BLUE : TRACK_PUBLIC

    let graph: MicGraph | null = null
    try {
      graph = await ensureMicGraph()
    } catch (error) {
      console.warn('[语音] Web Audio 采集链路建立失败，回退到普通麦克风发布：', error)
      graph = null
    }
    const ctx = audioContext.value
    const useGraph = Boolean(graph) && Boolean(ctx) && ctx?.state === 'running'

    // 切换频道 = 换音轨名，LiveKit 不支持改名，因此先取消发布再重新发布（采集链路复用，不重新申请设备）
    await unpublishMic(true)

    if (useGraph && graph) {
      publishedTrack = graph.track
      await r.localParticipant.publishTrack(graph.track, {
        name: trackName,
        source: Track.Source.Microphone,
        dtx: true,
        red: true,
      })
      startLocalMeter(graph)
    } else {
      // 兜底：直接发布麦克风，门限不起作用，但一定有声音
      await r.localParticipant.setMicrophoneEnabled(
        true,
        { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        { name: trackName, source: Track.Source.Microphone, dtx: true, red: true }
      )
      fallbackPublished = true
      startFallbackMeter()
    }
    publishedChannel.value = channel
  }

  /* ---------- 远端音频 ---------- */

  /**
   * 只有「音量增益 > 100%」才把音频接进 Web Audio（那才能放大到 1 倍以上）。
   * 平时直接走 <audio> 元素播放——之前无条件走 Web Audio，一旦 AudioContext 处于
   * suspended（浏览器自动播放策略），整条链路就是静音，这是「没有声音」的元凶。
   */
  function wireGain(node: { el: HTMLAudioElement; gain: GainNode | null; wired: boolean }, value: number) {
    if (node.wired || value <= 1) return
    const ctx = ensureAudioContext()
    if (!ctx) return
    try {
      const source = ctx.createMediaElementSource(node.el)
      const gain = ctx.createGain()
      gain.gain.value = value
      source.connect(gain).connect(ctx.destination)
      node.gain = gain
      node.wired = true
    } catch {
      // 已经接过 Web Audio 或浏览器拒绝，退回元素音量
      node.gain = null
    }
  }

  function attachRemote(participant: Participant, track: RemoteTrack) {
    const el = track.attach() as HTMLAudioElement
    el.autoplay = true
    el.style.display = 'none'
    document.body.appendChild(el)
    const node = { el, gain: null as GainNode | null, wired: false }
    const value = gainValue()
    if (value > 1) wireGain(node, value)
    if (!node.wired) el.volume = Math.min(1, value)
    remoteNodes.set(participant.identity, node)
    el.play().catch(() => {
      // 被自动播放策略拦下：等下一次用户手势（点悬浮球、点挡位）再放
      pendingPlayback = true
    })
  }

  function detachRemote(identity: string) {
    const node = remoteNodes.get(identity)
    if (!node) return
    try {
      node.el.pause()
      node.el.srcObject = null
      node.el.remove()
    } catch { /* 忽略 */ }
    remoteNodes.delete(identity)
  }

  // 浏览器自动播放策略：首次用户手势后恢复 AudioContext 与远端音频播放
  let pendingPlayback = false

  async function resumeAudio() {
    const ctx = audioContext.value
    if (ctx && ctx.state === 'suspended') await ctx.resume().catch(() => undefined)
    const r = room.value
    if (r && !r.canPlaybackAudio) await r.startAudio().catch(() => undefined)
    if (pendingPlayback) {
      pendingPlayback = false
      for (const node of remoteNodes.values()) node.el.play().catch(() => undefined)
    }
  }

  /* ---------- 连接 ---------- */

  async function connect(targetRoomNo: string) {
    if (!targetRoomNo) {
      console.warn('[语音] 房间号为空，暂不连接')
      return
    }
    if (status.value === 'connecting' || status.value === 'connected') return
    roomNo.value = targetRoomNo
    status.value = 'connecting'
    errorText.value = ''
    disconnectReason.value = ''
    const seq = ++sessionSeq
    console.info('[语音] 开始连接房间', targetRoomNo)

    try {
      const authToken = localStorage.getItem('authToken') ?? ''
      const res = await fetch('/api/voice/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ roomNo: targetRoomNo }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `获取语音 token 失败（${res.status}）`)
      }
      const data = await res.json()
      console.info('[语音] 拿到 token，信令地址：', data.url)

      const r = new Room({ adaptiveStream: false, dynacast: false })
      room.value = r

      r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) attachRemote(participant, track)
        // 服务端授权后仍要尊重本地的「不监听该频道」偏好
        applyListenPreferences()
      })
      r.on(RoomEvent.TrackUnsubscribed, (_track, _pub, participant) => detachRemote(participant.identity))
      r.on(RoomEvent.ParticipantDisconnected, (participant) => {
        detachRemote(participant.identity)
        applyListenPreferences()
      })
      r.on(RoomEvent.TrackPublished, () => applyListenPreferences())
      r.on(RoomEvent.TrackUnpublished, () => { applyListenPreferences(); refreshSpeakers() })
      r.on(RoomEvent.ActiveSpeakersChanged, (list) => refreshSpeakers(list))
      r.on(RoomEvent.ParticipantMetadataChanged, () => { applyListenPreferences(); refreshSpeakers() })
      r.on(RoomEvent.Disconnected, (reason?: unknown) => {
        if (seq !== sessionSeq) return // 旧连接的断开事件，忽略
        disconnectReason.value = reason === undefined || reason === null ? '未知' : String(reason)
        console.warn('[语音] 连接已断开，原因：', disconnectReason.value)
        status.value = 'idle'
        safeToPublish.value = false
        stopLocalMeter()
        speakers.value = []
      })
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        safeToPublish.value = r.canPlaybackAudio
      })

      await r.connect(data.url, data.token)
      if (seq !== sessionSeq) {
        // 期间已经被断开或重新连接，丢弃这次结果
        await r.disconnect().catch(() => undefined)
        return
      }
      status.value = 'connected'
      console.info('[语音] 已连接，身份：', r.localParticipant.identity)
      safeToPublish.value = r.canPlaybackAudio
      ensureAudioContext()
      applyListenPreferences()
      if (micChannel.value !== 'muted') await publishMic(micChannel.value)
    } catch (error) {
      status.value = 'error'
      errorText.value = error instanceof Error ? error.message : String(error)
      console.warn('[语音] 连接失败：', errorText.value)
      room.value = null
    }
  }

  async function disconnect() {
    const seq = ++sessionSeq
    await unpublishMic(false)
    const r = room.value
    room.value = null
    for (const identity of [...remoteNodes.keys()]) detachRemote(identity)
    if (r) await r.disconnect().catch(() => undefined)
    if (seq !== sessionSeq) return // 期间已经重新连接，不要覆盖新会话的状态
    status.value = 'idle'
    speakers.value = []
  }

  async function setMicChannel(channel: VoiceMicChannel) {
    if (micChannel.value === channel) return
    micChannel.value = channel
    if (status.value === 'connected') await publishMic(channel)
  }

  function cycleMicChannel() {
    const order: VoiceMicChannel[] = ['muted', 'public', 'blue']
    const next = order[(order.indexOf(micChannel.value) + 1) % order.length]
    void setMicChannel(next)
  }

  function toggleListen(channel: VoiceListenChannel) {
    listen.value = { ...listen.value, [channel]: !listen.value[channel] }
    applyListenPreferences()
  }

  // 音量增益变化时实时应用到已连接的远端音频
  watch(voiceVolume, () => {
    const value = gainValue()
    for (const node of remoteNodes.values()) {
      if (!node.wired && value > 1) wireGain(node, value)
      if (node.gain) node.gain.gain.value = value
      else node.el.volume = Math.min(1, value)
    }
  })

  return {
    status,
    errorText,
    disconnectReason,
    micChannel,
    publishedChannel,
    listen,
    localLevel,
    speakers,
    currentThreshold,
    connect,
    disconnect,
    setMicChannel,
    cycleMicChannel,
    toggleListen,
    resumeAudio,
  }
}

type VoiceChannelApi = ReturnType<typeof createVoiceChannel>

// 单例：房间页的悬浮语音组件与设置弹窗共用同一份连接与状态
let shared: VoiceChannelApi | null = null

export function useVoiceChannel(): VoiceChannelApi {
  if (!shared) shared = createVoiceChannel()
  return shared
}
