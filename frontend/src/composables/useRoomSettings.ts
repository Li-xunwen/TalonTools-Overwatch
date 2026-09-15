// 房间内的本地偏好设置（保存在 localStorage，跨刷新保留）
import { ref, watch } from 'vue'

const AUTOPLAY_KEY = 'undercover.autoplayVoice'
const VOLUME_KEY = 'undercover.voiceVolume'

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

export function useRoomSettings() {
  return { autoPlayVoice, voiceVolume }
}
