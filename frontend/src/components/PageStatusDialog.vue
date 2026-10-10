<template>
  <div class="ps-overlay" @click.self="$emit('close')">
    <div class="ps-panel">
      <h3 class="ps-title">⚙️ 设置文章状态</h3>
      <p class="ps-hint">仅管理员可设置。当前状态：{{ currentLabel }}</p>

      <div class="ps-list">
        <button
          v-for="option in STATUS_OPTIONS"
          :key="option.value"
          class="ps-option"
          :class="{ current: option.value === currentStatus }"
          :disabled="busy"
          @click="pick(option.value)"
        >
          <span class="ps-option-label">{{ option.label }}</span>
          <span class="ps-option-desc">{{ option.desc }}</span>
          <span v-if="option.value === currentStatus" class="ps-option-badge">当前</span>
        </button>
      </div>

      <p v-if="errorText" class="ps-error">{{ errorText }}</p>

      <div class="ps-actions">
        <button class="ps-cancel" :disabled="busy" @click="$emit('close')">{{ busy ? '保存中…' : '取消' }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { authFetch } from '@/utils/request'

const props = defineProps<{
  pageId: number
  currentStatus: number
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed', status: number): void
}>()

// 与后端 pages.status 语义保持一致
const STATUS_OPTIONS = [
  { value: 3, label: '完全开放', desc: '所有人（含未登录）都能查看' },
  { value: 2, label: '登录可见', desc: '需要登录后才能查看' },
  { value: 1, label: '审核中', desc: '仅管理员可见' },
  { value: 4, label: '草稿', desc: '仅作者自己可见' },
  { value: 0, label: '删除', desc: '仅管理员可见（软删除）' }
]

const busy = ref(false)
const errorText = ref('')

const currentLabel = computed(
  () => STATUS_OPTIONS.find((item) => item.value === props.currentStatus)?.label ?? '未知'
)

async function pick(status: number) {
  if (busy.value || status === props.currentStatus) return
  if (status === 0 && !confirm('确定把这篇页面标记为「删除」吗？删除后仅管理员可见。')) return

  busy.value = true
  errorText.value = ''
  try {
    const res = await authFetch(`/api/pages/${props.pageId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      errorText.value = data.error || '设置失败'
      return
    }
    emit('changed', status)
    emit('close')
  } catch (error) {
    console.error('设置页面状态失败:', error)
    errorText.value = '网络错误，请稍后重试'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.ps-overlay {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
}

.ps-panel {
  width: min(420px, 92vw);
  max-height: 86vh;
  overflow-y: auto;
  padding: 20px;
  border-radius: 20px;
  background: var(--card-bg);
  box-shadow: var(--glass-shadow, 0 18px 48px rgba(0, 0, 0, 0.35));
  border: 1px solid var(--glass-border);
}

.ps-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  color: var(--text-primary);
  text-align: center;
}

.ps-hint {
  margin: 0 0 14px;
  font-size: 0.78rem;
  color: var(--text-primary);
  opacity: 0.7;
  text-align: center;
}

.ps-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ps-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--input-border);
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  transition: 0.15s ease;
}

.ps-option:hover:not(:disabled) {
  border-color: var(--button-bg);
}

.ps-option:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ps-option.current {
  border-color: var(--button-bg);
  background: rgba(66, 185, 131, 0.08);
}

.ps-option-label {
  flex: 0 0 auto;
  font-size: 0.9rem;
  font-weight: 700;
}

.ps-option-desc {
  flex: 1 1 auto;
  font-size: 0.75rem;
  opacity: 0.7;
}

.ps-option-badge {
  flex: 0 0 auto;
  padding: 1px 8px;
  border-radius: 999px;
  background: var(--button-bg);
  color: #fff;
  font-size: 0.7rem;
}

.ps-error {
  margin: 12px 0 0;
  font-size: 0.78rem;
  color: #ff7676;
  text-align: center;
}

.ps-actions {
  display: flex;
  justify-content: center;
  margin-top: 14px;
}

.ps-cancel {
  padding: 8px 28px;
  border: 1px solid var(--input-border);
  border-radius: 48px;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
}

.ps-cancel:hover:not(:disabled) {
  border-color: var(--button-bg);
}
</style>
