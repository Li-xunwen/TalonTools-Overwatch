// 房间内的本地偏好设置（保存在 localStorage，跨刷新保留）
import { ref, watch } from 'vue'

const AUTOPLAY_KEY = 'undercover.autoplayVoice'
const VOLUME_KEY = 'undercover.voiceVolume'
// 语音频道麦克风门限（dBFS）：低于该音量不上行，默认 -45
const MIC_TH_PUBLIC_KEY = 'undercover.micThresholdPublic'
const MIC_TH_BLUE_KEY = 'undercover.micThresholdBlue'

export const MIC_THRESHOLD_MIN = -60
export const MIC_THRESHOLD_MAX = -20
export const MIC_THRESHOLD_DEFAULT = -45

function readThreshold(key: string): number {
  const raw = Number(localStorage.getItem(key))
  if (!Number.isFinite(raw) || raw === 0) return MIC_THRESHOLD_DEFAULT
  return Math.max(MIC_THRESHOLD_MIN, Math.min(MIC_THRESHOLD_MAX, raw))
}

// 新消息里的语音是否自动播放（默认开启）
const autoPlayVoice = ref(localStorage.getItem(AUTOPLAY_KEY) !== '0')

// 音量增益百分比：100 = 原音量，最高 200（超过 100 需要走 Web Audio 增益）
const storedVolume = Number(localStorage.getItem(VOLUME_KEY))
const voiceVolume = ref(Number.isFinite(storedVolume) && storedVolume > 0 ? Math.min(storedVolume, 200) : 100)

watch(autoPlayVoice, (value) => localStorage.setItem(AUTOPLAY_KEY, value ? '1' : '0'))
watch(voiceVolume, (value) => {
  const safe = Math.max(0, Math.min(Number(value) || 0, 200))
  if (safe !== value) {
    voiceVolume.value = safe
    return
  }
  localStorage.setItem(VOLUME_KEY, String(safe))
})

// 公共频道 / 蓝色频道各自的麦克风门限（每人独立、保存在本地）
const micThresholdPublic = ref(readThreshold(MIC_TH_PUBLIC_KEY))
const micThresholdBlue = ref(readThreshold(MIC_TH_BLUE_KEY))

watch(micThresholdPublic, (value) => {
  const safe = Math.max(MIC_THRESHOLD_MIN, Math.min(MIC_THRESHOLD_MAX, Math.round(Number(value) || MIC_THRESHOLD_DEFAULT)))
  if (safe !== value) {
    micThresholdPublic.value = safe
    return
  }
  localStorage.setItem(MIC_TH_PUBLIC_KEY, String(safe))
})

watch(micThresholdBlue, (value) => {
  const safe = Math.max(MIC_THRESHOLD_MIN, Math.min(MIC_THRESHOLD_MAX, Math.round(Number(value) || MIC_THRESHOLD_DEFAULT)))
  if (safe !== value) {
    micThresholdBlue.value = safe
    return
  }
  localStorage.setItem(MIC_TH_BLUE_KEY, String(safe))
})

export function useRoomSettings() {
  return { autoPlayVoice, voiceVolume, micThresholdPublic, micThresholdBlue }
}
