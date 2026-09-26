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
  const micChannel = ref<VoiceMicChannel>('muted')
  const listen = ref<Record<VoiceListenChannel, boolean>>({ public: true, blue: true })
  const localLevel = ref(0)
  const speakers = ref<VoiceSpeaker[]>([])
  const safeToPublish = ref(false)

  const room = shallowRef<Room | null>(null)
  const roomNo = ref('')

  // 远端音频：每个身份一个 MediaStreamAudioSource → GainNode（音量增益可超过 100%）
  const audioContext = shallowRef<AudioContext | null>(null)
  const remoteNodes = new Map<string, { el: HTMLAudioElement; gain: GainNode }>()

  // 本地门限：Analyser 取样 + 起音/释音迟滞
  const localAnalyser = shallowRef<AnalyserNode | null>(null)
  let localTimer: number | null = null
  let silenceSince = 0
  let voiceSince = 0
  let gatedMuted = false

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
    localAnalyser.value = null
    localLevel.value = 0
    gatedMuted = false
  }

  function startLocalMeter() {
    stopLocalMeter()
    const r = room.value
    const pub = r?.localParticipant.getTrackPublication(Track.Source.Microphone)
    const mediaTrack = pub?.track?.mediaStreamTrack
    if (!mediaTrack) return
    const ctx = ensureAudioContext()
    if (!ctx) return
    const source = ctx.createMediaStreamSource(new MediaStream([mediaTrack]))
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)
    localAnalyser.value = analyser

    const buffer = new Uint8Array(analyser.fftSize)
    const now = () => performance.now()
    voiceSince = 0
    silenceSince = now()

    localTimer = window.setInterval(() => {
      const node = localAnalyser.value
      const track = room.value?.localParticipant.getTrackPublication(Track.Source.Microphone)?.track
      if (!node || !track) return
      node.getByteTimeDomainData(buffer)
      let sum = 0
      for (let i = 0; i < buffer.length; i += 1) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)
      localLevel.value = rms

      const threshold = Math.pow(10, currentThreshold.value / 20)
      const t = now()
      if (rms >= threshold) {
        voiceSince = voiceSince || t
        silenceSince = 0
        // 起音迟滞 150ms：避免刚开口的前几个字被切掉
        if (t - voiceSince >= 150 && gatedMuted) {
          gatedMuted = false
          track.unmute().catch(() => undefined)
        }
      } else {
        voiceSince = 0
        silenceSince = silenceSince || t
        // 释音迟滞 300ms：避免句尾被切
        if (t - silenceSince >= 300 && !gatedMuted) {
          gatedMuted = true
          track.mute().catch(() => undefined)
        }
      }
    }, 60)
  }

  /* ---------- 发布 ---------- */

  async function unpublishMic() {
    const r = room.value
    if (!r) return
    stopLocalMeter()
    await r.localParticipant.setMicrophoneEnabled(false).catch(() => undefined)
  }

  async function publishMic(channel: VoiceMicChannel) {
    const r = room.value
    if (!r || channel === 'muted') {
      await unpublishMic()
      return
    }
    stopLocalMeter()
    // 切换频道 = 换音轨名，LiveKit 不支持改名，因此先取消发布再重新发布
    await unpublishMic()
    await r.localParticipant.setMicrophoneEnabled(
      true,
      { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      {
        name: channel === 'blue' ? TRACK_BLUE : TRACK_PUBLIC,
        source: Track.Source.Microphone,
        dtx: true,
        red: true,
      }
    )
    startLocalMeter()
  }

  /* ---------- 远端音频 ---------- */

  function attachRemote(participant: Participant, track: RemoteTrack) {
    const el = track.attach() as HTMLAudioElement
    el.autoplay = true
    el.style.display = 'none'
    document.body.appendChild(el)
    const ctx = ensureAudioContext()
    let gain: GainNode | null = null
    if (ctx) {
      try {
        const source = ctx.createMediaElementSource(el)
        gain = ctx.createGain()
        gain.gain.value = gainValue()
        source.connect(gain).connect(ctx.destination)
      } catch {
        gain = null
      }
    }
    if (!gain) el.volume = Math.min(1, gainValue())
    remoteNodes.set(participant.identity, { el, gain: gain as GainNode })
    el.play().catch(() => undefined)
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

  /* ---------- 连接 ---------- */

  async function connect(targetRoomNo: string) {
    if (!targetRoomNo) return
    if (status.value === 'connecting' || status.value === 'connected') return
    roomNo.value = targetRoomNo
    status.value = 'connecting'
    errorText.value = ''

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

      const r = new Room({ adaptiveStream: false, dynacast: false })
      room.value = r

      r.on(RoomEvent.TrackSubscribed, (track, _pub, participant) => {
        if (track.kind === Track.Kind.Audio) attachRemote(participant, track)
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
      r.on(RoomEvent.Disconnected, () => {
        status.value = 'idle'
        safeToPublish.value = false
        stopLocalMeter()
        speakers.value = []
      })
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        safeToPublish.value = r.canPlaybackAudio
      })

      await r.connect(data.url, data.token)
      status.value = 'connected'
      safeToPublish.value = r.canPlaybackAudio
      ensureAudioContext()
      applyListenPreferences()
      if (micChannel.value !== 'muted') await publishMic(micChannel.value)
    } catch (error) {
      status.value = 'error'
      errorText.value = error instanceof Error ? error.message : String(error)
      room.value = null
    }
  }

  async function disconnect() {
    await unpublishMic()
    const r = room.value
    room.value = null
    for (const identity of [...remoteNodes.keys()]) detachRemote(identity)
    if (r) await r.disconnect().catch(() => undefined)
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
      if (node.gain) node.gain.gain.value = value
      else node.el.volume = Math.min(1, value)
    }
  })

  return {
    status,
    errorText,
    micChannel,
    listen,
    localLevel,
    speakers,
    currentThreshold,
    connect,
    disconnect,
    setMicChannel,
    cycleMicChannel,
    toggleListen,
  }
}

type VoiceChannelApi = ReturnType<typeof createVoiceChannel>

// 单例：房间页的悬浮语音组件与设置弹窗共用同一份连接与状态
let shared: VoiceChannelApi | null = null

export function useVoiceChannel(): VoiceChannelApi {
  if (!shared) shared = createVoiceChannel()
  return shared
}
