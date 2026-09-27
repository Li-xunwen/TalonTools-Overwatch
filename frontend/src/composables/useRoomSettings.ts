// 房间内的本地偏好设置（保存在 localStorage，跨刷新保留）
import { computed, ref, watch } from 'vue'

const AUTOPLAY_KEY = 'undercover.autoplayVoice'
// 总音量沿用旧的「音量增益」键，老用户的设置不会丢
const MASTER_VOLUME_KEY = 'undercover.voiceVolume'
const ITEM_VOLUME_KEY = 'undercover.itemVolume'
const QUESTION_VOLUME_KEY = 'undercover.questionVolume'
// 麦克风阈值合并成一个（旧的公共频道键做迁移）
const MIC_THRESHOLD_KEY = 'undercover.micThreshold'
const LEGACY_MIC_THRESHOLD_KEY = 'undercover.micThresholdPublic'
const MIC_GAIN_KEY = 'undercover.micGain'

export const MIC_THRESHOLD_MIN = -60
export const MIC_THRESHOLD_MAX = -20
export const MIC_THRESHOLD_DEFAULT = -45
export const VOLUME_MIN = 0
export const VOLUME_MAX = 200
export const MIC_GAIN_MIN = 0
export const MIC_GAIN_MAX = 200

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function readNumber(key: string, fallback: number, min: number, max: number): number {
  const raw = Number(localStorage.getItem(key))
  if (!Number.isFinite(raw) || raw === 0) return fallback
  return clamp(raw, min, max)
}

// 新消息里的语音是否自动播放（默认开启）
const autoPlayVoice = ref(localStorage.getItem(AUTOPLAY_KEY) !== '0')

// 总音量：100 = 原音量，最高 200（作用于语音与全部房间音频）
const masterVolume = ref(readNumber(MASTER_VOLUME_KEY, 100, VOLUME_MIN, VOLUME_MAX))
// 道具音量（鸡蛋 / 玫瑰音效），在总音量基础上再乘一次
const itemVolume = ref(readNumber(ITEM_VOLUME_KEY, 100, VOLUME_MIN, VOLUME_MAX))
// 题目音量（题目音频与解析音频）
const questionVolume = ref(readNumber(QUESTION_VOLUME_KEY, 100, VOLUME_MIN, VOLUME_MAX))
// 麦克风阈值（dBFS）：低于该音量不上行
const micThreshold = ref(
  localStorage.getItem(MIC_THRESHOLD_KEY) !== null
    ? readNumber(MIC_THRESHOLD_KEY, MIC_THRESHOLD_DEFAULT, MIC_THRESHOLD_MIN, MIC_THRESHOLD_MAX)
    : readNumber(LEGACY_MIC_THRESHOLD_KEY, MIC_THRESHOLD_DEFAULT, MIC_THRESHOLD_MIN, MIC_THRESHOLD_MAX)
)
// 麦克风增益：上行前的音量放大倍数（%），100 = 原始
const micGain = ref(readNumber(MIC_GAIN_KEY, 100, MIC_GAIN_MIN, MIC_GAIN_MAX))

function persistPercent(source: typeof masterVolume, key: string, min: number, max: number) {
  watch(source, (value) => {
    const safe = clamp(Math.round(Number(value) || 0), min, max)
    if (safe !== value) {
      source.value = safe
      return
    }
    localStorage.setItem(key, String(safe))
  })
}

watch(autoPlayVoice, (value) => localStorage.setItem(AUTOPLAY_KEY, value ? '1' : '0'))
persistPercent(masterVolume, MASTER_VOLUME_KEY, VOLUME_MIN, VOLUME_MAX)
persistPercent(itemVolume, ITEM_VOLUME_KEY, VOLUME_MIN, VOLUME_MAX)
persistPercent(questionVolume, QUESTION_VOLUME_KEY, VOLUME_MIN, VOLUME_MAX)
persistPercent(micGain, MIC_GAIN_KEY, MIC_GAIN_MIN, MIC_GAIN_MAX)

watch(micThreshold, (value) => {
  const safe = clamp(Math.round(Number(value) || MIC_THRESHOLD_DEFAULT), MIC_THRESHOLD_MIN, MIC_THRESHOLD_MAX)
  if (safe !== value) {
    micThreshold.value = safe
    return
  }
  localStorage.setItem(MIC_THRESHOLD_KEY, String(safe))
})

// 道具 / 题目实际生效的音量 = 总音量 × 分类音量
const effectiveItemPercent = computed(() => (masterVolume.value * itemVolume.value) / 100)
const effectiveQuestionPercent = computed(() => (masterVolume.value * questionVolume.value) / 100)

export function useRoomSettings() {
  return {
    autoPlayVoice,
    masterVolume,
    itemVolume,
    questionVolume,
    micThreshold,
    micGain,
    effectiveItemPercent,
    effectiveQuestionPercent
  }
}
