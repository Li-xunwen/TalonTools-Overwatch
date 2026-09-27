<template>
  <Teleport to="body">
    <div class="settings-mask" @click="emit('close')">
      <div class="settings-panel" @click.stop>
        <h3 class="settings-title">设置</h3>

        <!-- 深色模式 -->
        <div class="setting-row">
          <span class="setting-label">深色模式</span>
          <button
            class="switch"
            :class="{ on: isDark }"
            :aria-pressed="isDark"
            @click="toggleTheme()"
          >
            <span class="knob"></span>
          </button>
        </div>

        <!-- 自动播放语音 -->
        <div class="setting-row">
          <span class="setting-label">自动播放语音</span>
          <button
            class="switch"
            :class="{ on: autoPlayVoice }"
            :aria-pressed="autoPlayVoice"
            @click="autoPlayVoice = !autoPlayVoice"
          >
            <span class="knob"></span>
          </button>
        </div>

        <!-- 麦克风阈值：低于该音量的声音不上行（每人独立，保存在本地） -->
        <div class="setting-block">
          <div class="setting-row">
            <span class="setting-label">麦克风阈值</span>
            <span class="setting-value">{{ micThreshold }} dB</span>
          </div>
          <input
            v-model.number="micThreshold"
            class="volume-range"
            type="range"
            :min="MIC_THRESHOLD_MIN"
            :max="MIC_THRESHOLD_MAX"
            step="1"
          >
          <!-- 实时音量条：绿条越过刻度线说明已经超过阈值、开始上行 -->
          <div class="level-meter">
            <i :style="{ width: levelPercent + '%' }"></i>
            <b class="level-mark" :style="{ left: markThreshold + '%' }"></b>
          </div>
          <p class="setting-hint">对着话筒说话，绿条越过刻度线才有声音发出；数值越低越灵敏（噪声也更容易被送出去）</p>
        </div>

        <!-- 麦克风增益：上行前的音量放大 -->
        <div class="setting-block">
          <div class="setting-row">
            <span class="setting-label">麦克风增益</span>
            <span class="setting-value">{{ micGain }}%</span>
          </div>
          <input
            v-model.number="micGain"
            class="volume-range"
            type="range"
            :min="MIC_GAIN_MIN"
            :max="MIC_GAIN_MAX"
            step="5"
          >
          <p class="setting-hint">100% 为你原本的音量；说话声音偏小可以调高，调太高会把环境噪声一起放大</p>
        </div>

        <!-- 总音量：右侧箭头展开「道具音量 / 题目音量」 -->
        <div class="setting-block">
          <div class="setting-row">
            <span class="setting-label">总音量</span>
            <span class="volume-head">
              <span class="setting-value">{{ masterVolume }}%</span>
              <button
                class="volume-toggle"
                :class="{ open: showVolumeDetails }"
                :title="showVolumeDetails ? '收起分项音量' : '展开道具 / 题目音量'"
                @click="showVolumeDetails = !showVolumeDetails"
              >▾</button>
            </span>
          </div>
          <input
            v-model.number="masterVolume"
            class="volume-range"
            type="range"
            :min="VOLUME_MIN"
            :max="VOLUME_MAX"
            step="5"
          >
          <div v-if="showVolumeDetails" class="volume-details">
            <div class="threshold-row">
              <span class="threshold-tag">道具</span>
              <input
                v-model.number="itemVolume"
                class="volume-range"
                type="range"
                :min="VOLUME_MIN"
                :max="VOLUME_MAX"
                step="5"
              >
              <span class="setting-value small">{{ itemVolume }}%</span>
            </div>
            <div class="threshold-row">
              <span class="threshold-tag">题目</span>
              <input
                v-model.number="questionVolume"
                class="volume-range"
                type="range"
                :min="VOLUME_MIN"
                :max="VOLUME_MAX"
                step="5"
              >
              <span class="setting-value small">{{ questionVolume }}%</span>
            </div>
          </div>
          <p class="setting-hint">100% 为原始音量，最高 200%；道具与题目音量会在总音量基础上再乘一次</p>
        </div>

        <button class="settings-done" @click="emit('close')">完成</button>
        <button class="settings-close" title="关闭" @click="emit('close')">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useTheme } from '@/composables/useTheme'
import {
  useRoomSettings,
  MIC_THRESHOLD_MIN,
  MIC_THRESHOLD_MAX,
  MIC_GAIN_MIN,
  MIC_GAIN_MAX,
  VOLUME_MIN,
  VOLUME_MAX
} from '@/composables/useRoomSettings'
import { useVoiceChannel } from '@/composables/useVoiceChannel'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { isDark, toggleTheme } = useTheme()
const {
  autoPlayVoice,
  masterVolume,
  itemVolume,
  questionVolume,
  micThreshold,
  micGain
} = useRoomSettings()
const { localLevel } = useVoiceChannel()

// 分项音量默认收起，点总音量右侧的箭头展开
const showVolumeDetails = ref(false)

// 音量条刻度：-60 dBFS ~ 0 dBFS 映射到 0~100%
function toPercent(db: number) {
  return Math.max(0, Math.min(100, ((db + 60) / 60) * 100))
}

const levelPercent = computed(() => {
  const rms = localLevel.value
  if (!rms) return 0
  return toPercent(20 * Math.log10(rms))
})

const markThreshold = computed(() => toPercent(micThreshold.value))
</script>

<style scoped>
.settings-mask {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  -webkit-backdrop-filter: blur(2px);
}

.settings-panel {
  position: relative;
  width: min(360px, 90vw);
  padding: 20px 20px 16px;
  border-radius: 22px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.settings-title {
  margin: 0 0 12px;
  font-size: 1.05rem;
  color: var(--text-primary);
  text-align: center;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 0;
}

.setting-label {
  font-size: 0.92rem;
  color: var(--text-primary);
}

.setting-value {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--accent, #2ecc71);
}

.setting-block {
  padding: 6px 0 2px;
  border-top: 1px solid var(--glass-border);
  margin-top: 6px;
}

.setting-hint {
  margin: 6px 0 0;
  font-size: 0.75rem;
  opacity: 0.65;
  color: var(--text-primary);
}

/* 开关 */
.switch {
  position: relative;
  flex: 0 0 auto;
  width: 46px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  cursor: pointer;
  transition: 0.18s ease;
}

.switch.on {
  background: #2ecc71;
}

.switch .knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  transition: 0.18s ease;
}

.switch.on .knob {
  transform: translateX(20px);
}

/* 音量增益滑杆 */
.volume-range {
  width: 100%;
  accent-color: #2ecc71;
  cursor: pointer;
}

.threshold-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.threshold-tag {
  flex: 0 0 auto;
  width: 34px;
  font-size: 0.75rem;
  text-align: right;
}

.threshold-tag.public {
  color: #f99e1a;
}

.threshold-tag.blue {
  color: #3e8ed0;
}

/* 总音量右侧的展开箭头 */
.volume-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.volume-toggle {
  width: 22px;
  height: 22px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  opacity: 0.75;
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.volume-toggle:hover {
  opacity: 1;
}

.volume-toggle.open {
  transform: rotate(180deg);
}

.volume-details {
  margin-top: 6px;
  padding: 6px 0 2px;
  border-top: 1px dashed var(--glass-border);
}

.setting-value.small {
  flex: 0 0 auto;
  width: 42px;
  text-align: right;
}

/* 实时音量条 + 两条阈值刻度 */
.level-meter {
  position: relative;
  height: 8px;
  margin: 8px 0 0;
  border-radius: 4px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  overflow: hidden;
}

.level-meter > i {
  display: block;
  height: 100%;
  width: 0;
  background: #2ecc71;
  transition: width 0.08s linear;
}

.level-meter > .level-mark {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 12px;
  border-radius: 1px;
}

.level-meter > .level-mark.public {
  background: #f99e1a;
}

.level-meter > .level-mark.blue {
  background: #3e8ed0;
}

.settings-done {
  width: 100%;
  margin-top: 14px;
  padding: 11px 12px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.92rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}

.settings-done:hover {
  filter: brightness(1.06);
}

.settings-close {
  position: absolute;
  top: 10px;
  right: 12px;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-primary);
  font-size: 14px;
  cursor: pointer;
  opacity: 0.6;
}

.settings-close:hover {
  opacity: 1;
}
</style>
