<template>
  <Teleport to="body">
    <div class="tag-mask" @click="emit('close')">
      <div class="tag-panel" @click.stop>
        <h3 class="tag-title">编辑标签</h3>
        <p class="tag-hint">重命名会同时改掉所有带该标签的题目；删除会从所有题目里移除该标签。</p>

        <div v-if="loading" class="tag-empty">加载中…</div>
        <div v-else-if="!tags.length" class="tag-empty">还没有任何标签，去题目里给题目加标签即可创建</div>
        <ul v-else class="tag-list">
          <li v-for="tag in tags" :key="tag.name" class="tag-row">
            <template v-if="editingName === tag.name">
              <input
                v-model="draft"
                class="tag-input"
                maxlength="20"
                @keyup.enter="confirmRename(tag.name)"
                @keyup.escape="cancelEdit"
              >
              <button class="tag-btn primary" :disabled="busy" @click="confirmRename(tag.name)">确定</button>
              <button class="tag-btn" :disabled="busy" @click="cancelEdit">取消</button>
            </template>
            <template v-else>
              <span class="tag-name">{{ tag.name }}</span>
              <span class="tag-count">{{ tag.count }} 题</span>
              <span class="tag-spacer"></span>
              <button class="tag-btn" :disabled="busy" @click="startRename(tag.name)">重命名</button>
              <button class="tag-btn danger" :disabled="busy" @click="removeTag(tag.name)">删除</button>
            </template>
          </li>
        </ul>

        <p v-if="errorText" class="tag-error">{{ errorText }}</p>

        <button class="tag-done" @click="emit('close')">完成</button>
        <button class="tag-close" title="关闭" @click="emit('close')">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { authFetch } from '@/utils/request'

interface TagItem {
  name: string
  count: number
}

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'changed', payload: { action: 'rename' | 'delete'; from: string; to?: string }): void
}>()

const tags = ref<TagItem[]>([])
const loading = ref(true)
const busy = ref(false)
const errorText = ref('')
const editingName = ref('')
const draft = ref('')

async function loadTags() {
  loading.value = true
  try {
    const res = await authFetch('/api/quiz/tags')
    if (res.ok) {
      const data = await res.json()
      tags.value = data.tags ?? []
    }
  } catch (error) {
    console.error('加载标签失败:', error)
    errorText.value = '标签加载失败'
  } finally {
    loading.value = false
  }
}

function startRename(name: string) {
  errorText.value = ''
  editingName.value = name
  draft.value = name
}

function cancelEdit() {
  editingName.value = ''
  draft.value = ''
}

async function confirmRename(name: string) {
  const next = draft.value.trim().slice(0, 20)
  if (!next || next === name) {
    cancelEdit()
    return
  }
  busy.value = true
  errorText.value = ''
  try {
    const res = await authFetch(`/api/quiz/tags/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify({ newName: next })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      errorText.value = data.error || '重命名失败'
      return
    }
    cancelEdit()
    await loadTags()
    emit('changed', { action: 'rename', from: name, to: next })
  } catch (error) {
    console.error('重命名标签失败:', error)
    errorText.value = '重命名失败'
  } finally {
    busy.value = false
  }
}

async function removeTag(name: string) {
  if (!window.confirm(`删除标签「${name}」？所有题目上的这个标签都会被移除。`)) return
  busy.value = true
  errorText.value = ''
  try {
    const res = await authFetch(`/api/quiz/tags/${encodeURIComponent(name)}`, { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      errorText.value = data.error || '删除失败'
      return
    }
    await loadTags()
    emit('changed', { action: 'delete', from: name })
  } catch (error) {
    console.error('删除标签失败:', error)
    errorText.value = '删除失败'
  } finally {
    busy.value = false
  }
}

onMounted(loadTags)
</script>

<style scoped>
.tag-mask {
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

.tag-panel {
  position: relative;
  width: min(420px, 92vw);
  max-height: 78vh;
  overflow-y: auto;
  padding: 20px 20px 16px;
  border-radius: 22px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.tag-title {
  margin: 0 0 8px;
  font-size: 1.05rem;
  color: var(--text-primary);
  text-align: center;
}

.tag-hint {
  margin: 0 0 12px;
  font-size: 0.75rem;
  line-height: 1.5;
  color: var(--text-primary);
  opacity: 0.65;
  text-align: center;
}

.tag-empty {
  padding: 18px 0;
  font-size: 0.85rem;
  color: var(--text-primary);
  opacity: 0.7;
  text-align: center;
}

.tag-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tag-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 12px;
  background: var(--bg-secondary);
}

.tag-name {
  font-size: 0.88rem;
  color: var(--text-primary);
  word-break: break-all;
}

.tag-count {
  font-size: 0.72rem;
  color: var(--text-primary);
  opacity: 0.6;
}

.tag-spacer {
  flex: 1 1 auto;
}

.tag-input {
  flex: 1 1 auto;
  min-width: 0;
  padding: 5px 8px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
}

.tag-btn {
  flex: 0 0 auto;
  padding: 5px 10px;
  border: none;
  border-radius: 10px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.78rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}

.tag-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}

.tag-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.tag-btn.primary {
  background: #2ecc71;
  color: #fff;
}

.tag-btn.danger {
  color: #ff7676;
}

.tag-error {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: #ff7676;
  text-align: center;
}

.tag-done {
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
}

.tag-close {
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

.tag-close:hover {
  opacity: 1;
}
</style>
