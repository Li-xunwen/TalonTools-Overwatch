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

        <!-- 音量增益：单独调节网页音量 -->
        <div class="setting-block">
          <div class="setting-row">
            <span class="setting-label">音量增益</span>
            <span class="setting-value">{{ voiceVolume }}%</span>
          </div>
          <input
            v-model.number="voiceVolume"
            class="volume-range"
            type="range"
            min="0"
            max="200"
            step="5"
          >
          <p class="setting-hint">100% 为原始音量，超过 100% 会放大（仅作用于本网页的语音播放）</p>
        </div>

        <button class="settings-done" @click="emit('close')">完成</button>
        <button class="settings-close" title="关闭" @click="emit('close')">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useTheme } from '@/composables/useTheme'
import { useRoomSettings } from '@/composables/useRoomSettings'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const { isDark, toggleTheme } = useTheme()
const { autoPlayVoice, voiceVolume } = useRoomSettings()
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
