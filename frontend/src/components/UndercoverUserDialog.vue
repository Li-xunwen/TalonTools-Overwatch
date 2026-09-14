<template>
  <Teleport to="body">
    <div class="user-dialog-mask" @click="closeAnimated">
      <div ref="panelRef" class="user-dialog" :style="panelStyle" @click.stop>
        <button class="dialog-title" title="点击复制完整 ID" @click="handleCopy">
          <span class="title-id">{{ member.battletag }}</span>
          <span class="copy-hint">点击复制</span>
        </button>

        <div class="dialog-items">
          <button class="dialog-item" @click="handleAction('private')">发送私密消息</button>
          <template v-if="isHost">
            <button class="dialog-item" @click="handleAction('switchTeam')">切换队伍</button>
            <button class="dialog-item" @click="handleAction('toSpectator')">移动到观战席</button>
            <button class="dialog-item" @click="handleAction('transferOwner')">转让房主</button>
          </template>
        </div>

        <button class="dialog-close" title="关闭" @click="closeAnimated">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import type { SeatMember } from '@/types/undercover'

const props = defineProps<{
  member: SeatMember
  isHost: boolean
  /** 头像在屏幕上的位置与尺寸，用于「从头像位置缩放到页面中间」的动画 */
  origin: { x: number; y: number; size: number } | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'private'): void
  (e: 'switchTeam'): void
  (e: 'toSpectator'): void
  (e: 'transferOwner'): void
  (e: 'copy', battletag: string): void
}>()

const panelRef = ref<HTMLElement | null>(null)
const panelStyle = ref<Record<string, string>>({})

const TRANSITION = 'transform .26s cubic-bezier(.22, .61, .36, 1), opacity .22s ease'
let closing = false

// 把「当前面板中心」映射回头像位置所需的位移与缩放
function originTransform(): Record<string, string> {
  const panel = panelRef.value
  const origin = props.origin
  if (!panel || !origin) return {}

  const rect = panel.getBoundingClientRect()
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const scale = Math.min(Math.max(origin.size / rect.width, 0.12), 1)

  return {
    transform: `translate(${origin.x - centerX}px, ${origin.y - centerY}px) scale(${scale})`,
    opacity: '0'
  }
}

onMounted(() => {
  const panel = panelRef.value
  if (!panel || !props.origin) return

  // 首帧先落在头像位置（带过渡），下一帧再回到页面中间
  panelStyle.value = { ...originTransform(), transition: TRANSITION }

  requestAnimationFrame(() => {
    panelStyle.value = {
      transform: 'translate(0, 0) scale(1)',
      opacity: '1',
      transition: TRANSITION
    }
  })
})

function closeAnimated() {
  if (closing) return
  closing = true

  const panel = panelRef.value
  if (!panel || !props.origin) {
    emit('close')
    return
  }

  panelStyle.value = { ...originTransform(), transition: TRANSITION }
  window.setTimeout(() => emit('close'), 240)
}

// 选项点击：先播放收起动画，再执行动作
function handleAction(action: 'private' | 'switchTeam' | 'toSpectator' | 'transferOwner') {
  if (closing) return
  closeAnimated()

  window.setTimeout(() => {
    if (action === 'private') emit('private')
    else if (action === 'switchTeam') emit('switchTeam')
    else if (action === 'toSpectator') emit('toSpectator')
    else emit('transferOwner')
  }, 180)
}

function handleCopy() {
  emit('copy', props.member.battletag)
}
</script>

<style scoped>
.user-dialog-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.user-dialog {
  position: relative;
  width: min(320px, 88vw);
  padding: 18px 18px 14px;
  border-radius: 22px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
  will-change: transform, opacity;
}

/* 标题：完整 ID，点击复制 */
.dialog-title {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 100%;
  padding: 4px 0 12px;
  border: none;
  border-bottom: 1px solid var(--glass-border);
  background: transparent;
  cursor: pointer;
  font-family: inherit;
}

.title-id {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.3;
}

.copy-hint {
  font-size: 0.72rem;
  opacity: 0.6;
  color: var(--text-primary);
}

.dialog-title:hover .copy-hint {
  opacity: 1;
}

.dialog-items {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.dialog-item {
  padding: 11px 14px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: 0.15s ease;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.dialog-item:hover {
  background: #2c3e66;
  color: #fff;
}

.dialog-close {
  position: absolute;
  top: 8px;
  right: 10px;
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

.dialog-close:hover {
  opacity: 1;
}
</style>
