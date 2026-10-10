<template>
  <Teleport to="body">
    <div class="os-mask" @click="emit('close')">
      <div class="os-panel" @click.stop>
        <h3 class="os-title">编辑「我们的服务器」</h3>
        <p class="os-hint">保存后立即生效（存在 info 表的 game.donated_servers）。</p>

        <label class="os-field">
          <span class="os-label">标题</span>
          <input v-model="draft.title" class="os-input" maxlength="40" placeholder="我们的服务器">
        </label>

        <label class="os-field">
          <span class="os-label">说明（可留空）</span>
          <input v-model="draft.desc" class="os-input" maxlength="120" placeholder="一句话说明">
        </label>

        <div class="os-servers">
          <div v-for="(server, index) in draft.servers" :key="index" class="os-card">
            <div class="os-card-head">
              <span class="os-card-title">服务器 {{ index + 1 }}</span>
              <button class="os-btn danger" :disabled="busy" @click="removeServer(index)">删除</button>
            </div>
            <input v-model="server.name" class="os-input" maxlength="60" placeholder="服务器名称（如 阿里云轻量应用服务器）">
            <input v-model="server.subtitle" class="os-input" maxlength="60" placeholder="副标题（如 ￥68 已购一年）">
            <textarea
              v-model="server.usage"
              class="os-textarea"
              rows="2"
              maxlength="200"
              placeholder="用途说明（如 提供黑爪会议室网站前端服务与战绩查询统计服务）"
            ></textarea>
            <input v-model="server.expires" class="os-input" maxlength="20" placeholder="到期日（如 2027-05-28）">
          </div>
        </div>

        <button class="os-add" :disabled="busy" @click="addServer">＋ 添加服务器</button>

        <p v-if="errorText" class="os-error">{{ errorText }}</p>

        <div class="os-actions">
          <button class="os-btn" :disabled="busy" @click="emit('close')">取消</button>
          <button class="os-btn primary" :disabled="busy" @click="save">{{ busy ? '保存中…' : '保存' }}</button>
        </div>

        <button class="os-close" title="关闭" @click="emit('close')">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { authFetch } from '@/utils/request'

export interface OurServerItem {
  name: string
  subtitle: string
  usage: string
  expires: string
}

export interface OurServersValue {
  title: string
  desc: string
  servers: OurServerItem[]
}

const props = defineProps<{ value: OurServersValue | null }>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const busy = ref(false)
const errorText = ref('')

function emptyServer(): OurServerItem {
  return { name: '', subtitle: '', usage: '', expires: '' }
}

const draft = reactive<OurServersValue>({
  title: props.value?.title ?? '我们的服务器',
  desc: props.value?.desc ?? '',
  servers: (props.value?.servers ?? []).map((item) => ({
    name: item.name ?? '',
    subtitle: item.subtitle ?? '',
    usage: item.usage ?? '',
    expires: item.expires ?? ''
  }))
})

function addServer() {
  draft.servers.push(emptyServer())
}

function removeServer(index: number) {
  draft.servers.splice(index, 1)
}

async function save() {
  const servers = draft.servers
    .map((item) => ({
      name: item.name.trim(),
      subtitle: item.subtitle.trim(),
      usage: item.usage.trim(),
      expires: item.expires.trim()
    }))
    .filter((item) => item.name || item.usage)

  if (!servers.length) {
    errorText.value = '至少填一台服务器'
    return
  }
  const missing = servers.findIndex((item) => !item.name)
  if (missing >= 0) {
    errorText.value = `第 ${missing + 1} 台服务器缺少名称`
    return
  }

  busy.value = true
  errorText.value = ''
  try {
    const res = await authFetch('/api/info/game.donated_servers', {
      method: 'PUT',
      body: JSON.stringify({
        value: {
          title: draft.title.trim() || '我们的服务器',
          desc: draft.desc.trim(),
          servers
        }
      })
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      errorText.value = data.error || '保存失败'
      return
    }
    emit('saved')
    emit('close')
  } catch (error) {
    console.error('保存服务器信息失败:', error)
    errorText.value = '保存失败'
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.os-mask {
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

.os-panel {
  position: relative;
  width: min(560px, 94vw);
  max-height: 84vh;
  overflow-y: auto;
  padding: 20px 20px 16px;
  border-radius: 22px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.os-title {
  margin: 0 0 6px;
  font-size: 1.05rem;
  color: var(--text-primary);
  text-align: center;
}

.os-hint {
  margin: 0 0 14px;
  font-size: 0.75rem;
  color: var(--text-primary);
  opacity: 0.65;
  text-align: center;
}

.os-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 10px;
}

.os-label {
  font-size: 0.78rem;
  color: var(--text-primary);
  opacity: 0.8;
}

.os-input,
.os-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
}

.os-textarea {
  resize: vertical;
  line-height: 1.5;
}

.os-servers {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}

.os-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-radius: 14px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.os-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.os-card-title {
  font-size: 0.8rem;
  color: var(--text-primary);
  opacity: 0.75;
}

.os-add {
  width: 100%;
  margin-top: 10px;
  padding: 8px 12px;
  border: 1px dashed var(--glass-border);
  border-radius: 12px;
  background: transparent;
  color: var(--text-primary);
  font-size: 0.85rem;
  font-family: inherit;
  cursor: pointer;
  opacity: 0.85;
}

.os-add:hover:not(:disabled) {
  opacity: 1;
}

.os-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.os-btn {
  flex: 1;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.9rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}

.os-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}

.os-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.os-btn.primary {
  background: #2ecc71;
  color: #fff;
}

.os-btn.danger {
  flex: 0 0 auto;
  padding: 4px 10px;
  font-size: 0.75rem;
  color: #ff7676;
}

.os-error {
  margin: 10px 0 0;
  font-size: 0.78rem;
  color: #ff7676;
  text-align: center;
}

.os-close {
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

.os-close:hover {
  opacity: 1;
}
</style>
