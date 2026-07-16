<template>
  <div class="file-library-overlay" @click.self="() => {}">
    <div class="file-library-panel">
      <div class="fl-header">
        <h3>文件库</h3>
        <div class="fl-header-actions">
          <button class="fl-btn fl-btn-insert" @click="insertSelected" :disabled="!selectedFile">使用</button>
          <label class="fl-upload-btn">
            上传
            <input type="file" hidden multiple @change="onUpload" />
          </label>
          <button class="fl-btn fl-btn-del" @click="deleteSelected" :disabled="!selectedFile">删除</button>
          <button class="fl-btn fl-btn-close" @click="$emit('close')">关闭</button>
        </div>
      </div>
      <div class="fl-body">
        <div v-if="loading" class="fl-loading">加载中...</div>
        <div v-else-if="files.length === 0" class="fl-empty">暂无文件</div>
        <div v-else class="fl-grid">
          <div v-for="f in files" :key="f.name" :class="['fl-item', { selected: selectedFile === f.name }]"
            @click="selectFile(f)" @dblclick="insertFile(f)">
            <div v-if="f.type === 'image'" class="fl-thumb">
              <img :src="f.url" :alt="f.name" loading="lazy" />
            </div>
            <div v-else-if="f.type === 'video'" class="fl-thumb fl-video-thumb">
              <video :src="f.url" preload="metadata" muted></video>
              <span class="fl-play-icon">play</span>
            </div>
            <div v-else class="fl-thumb fl-other-icon">
              <span class="fl-icon-text">FILE</span>
            </div>
            <div class="fl-info">
              <template v-if="renamingFile === f.name">
                <div class="fl-rename-inline">
                  <input v-model="renameValue" class="fl-rename-input" @keyup.enter="confirmRename" @keyup.escape="cancelRename" @blur="confirmRename" autofocus />
                </div>
              </template>
              <template v-else>
                <div class="fl-name-row">
                  <span class="fl-name" :title="fixEncoding(f.name)">{{ fixEncoding(f.name) }}</span>
                  <button class="fl-rename-btn" @click.stop="startRename(f)" title="重命名">✏️</button>
                </div>
                <span class="fl-meta">{{ f.ext.toUpperCase() }} {{ formatSize(f.size) }}</span>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

interface FileItem {
  name: string; size: number; type: string;
  ext: string; url: string;
}

const emit = defineEmits(['close', 'select']);

const files = ref<FileItem[]>([]);
const loading = ref(true);
const selectedFile = ref('');
const renamingFile = ref<string | null>(null);
const renameValue = ref('');

// 修复 UTF-8 字节被误解析为 Latin-1 导致的中文乱码
function fixEncoding(str: string): string {
  try {
    return decodeURIComponent(escape(str));
  } catch {
    return str;
  }
}

function api(url: string, options: any = {}) {
  const token = localStorage.getItem('authToken');
  const headers: Record<string, string> = {};
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (options.headers) Object.assign(headers, options.headers);
  return fetch(url, { ...options, headers });
}

onMounted(async () => {
  loading.value = true;
  try {
    const res = await api('/api/users/files');
    if (res.ok) files.value = (await res.json()).files || [];
  } catch {}
  loading.value = false;
});

function selectFile(f: FileItem) {
  selectedFile.value = selectedFile.value === f.name ? '' : f.name;
}

function insertFile(f: FileItem) {
  emit('select', f);
}

function insertSelected() {
  const f = files.value.find(item => item.name === selectedFile.value);
  if (f) insertFile(f);
}

function startRename(f: FileItem) {
  renamingFile.value = f.name;
  renameValue.value = fixEncoding(f.name);
}

async function confirmRename() {
  if (!renamingFile.value || !renameValue.value.trim()) return;
  const oldName = renamingFile.value;
  const newName = renameValue.value.trim();
  if (oldName === newName) { renamingFile.value = null; return; }
  try {
    const res = await api('/api/users/files/' + encodeURIComponent(oldName) + '/rename', {
      method: 'PATCH',
      body: JSON.stringify({ newName })
    });
    if (res.ok) {
      renamingFile.value = null;
      const r = await api('/api/users/files');
      if (r.ok) files.value = (await r.json()).files || [];
    } else {
      const e = await res.json();
      alert('重命名失败: ' + (e.error || ''));
    }
  } catch { alert('网络错误'); }
}

function cancelRename() {
  renamingFile.value = null;
  renameValue.value = '';
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;
  const fd = new FormData();
  for (const f of input.files) fd.append('file', f);
  try {
    const res = await api('/api/users/files/upload', { method: 'POST', body: fd });
    if (res.ok) { loading.value = true; const r = await api('/api/users/files'); if (r.ok) files.value = (await r.json()).files || []; }
  } catch {}
  input.value = '';
}

async function deleteSelected() {
  if (!selectedFile.value) return;
  if (!confirm('Delete ' + selectedFile.value + '?')) return;
  try {
    const res = await api('/api/users/files/' + encodeURIComponent(selectedFile.value), { method: 'DELETE' });
    if (res.ok) { selectedFile.value = ''; const r = await api('/api/users/files'); if (r.ok) files.value = (await r.json()).files || []; }
  } catch {}
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1048576).toFixed(1) + ' MB';
}
</script>

<style scoped>
.file-library-overlay {
  position: fixed; top:0; left:0; right:0; bottom:0;
  background: rgba(0,0,0,0.78); z-index:99999;
  display: flex; align-items: center; justify-content: center;
}
.file-library-panel {
  background: var(--card-bg, #fff); border-radius: 16px;
  width: 90%; max-width: 700px; height: 80vh;
  display: flex; flex-direction: column; overflow: hidden;
}
.fl-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--input-border, #ddd);
}
.fl-header h3 { font-size: 16px; margin: 0; color: var(--text-primary, #333); }
.fl-header-actions { display: flex; gap: 8px; }
.fl-btn, .fl-upload-btn {
  padding: 6px 14px; border-radius: 8px; border: 1px solid var(--input-border, #ddd);
  font-size: 13px; cursor: pointer;
  background: var(--card-bg, #fff);
  color: var(--text-primary, #333);
}
.fl-upload-btn {
  background: var(--button-bg, #1877f2) !important;
  color: #fff !important;
  border-color: var(--button-bg, #1877f2) !important;
}
.fl-btn-insert { border-color: var(--button-bg, #42b983) !important; color: var(--button-bg, #42b983) !important; }
.fl-btn-del { border-color: #ef4444 !important; color: #ef4444 !important; }
.fl-btn-close { background: var(--bg-secondary, #f5f5f5) !important; }
.fl-body { flex: 1; overflow-y: auto; padding: 16px; background: var(--card-bg, #fff); }
.fl-loading, .fl-empty { text-align: center; padding: 60px 0; color: var(--accent, #999); }
.fl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 12px; }
.fl-item {
  border: 2px solid transparent; border-radius: 10px; padding: 8px;
  cursor: pointer; background: var(--bg-secondary, #f5f5f5);
  transition: border-color .15s, background .15s;
}
.fl-item:hover { border-color: var(--button-bg, #1877f2); }
.fl-item.selected { border-color: var(--button-bg, #1877f2); background: color-mix(in srgb, var(--button-bg, #1877f2) 8%, transparent); }
.fl-thumb {
  width: 100%; aspect-ratio: 16/9; border-radius: 6px;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: var(--input-border, #e0e0e0); position: relative;
}
.fl-thumb img, .fl-thumb video { width: 100%; height: 100%; object-fit: cover; }
.fl-other-icon { background: var(--input-border, #eee); }
.fl-icon-text { font-size: 24px; opacity: 0.5; }
.fl-info { margin-top: 6px; }
.fl-name-row { display: flex; align-items: center; gap: 4px; }
.fl-name { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--text-primary, #333); }
.fl-rename-btn { background: none; border: none; cursor: pointer; font-size: 11px; padding: 0 2px; opacity: 0.4; transition: opacity .15s; flex-shrink: 0; }
.fl-rename-btn:hover { opacity: 1; }
.fl-meta { font-size: 10px; color: var(--accent, #999); }
.fl-rename-inline { padding: 2px 0; }
.fl-rename-input {
  width: 100%; box-sizing: border-box;
  padding: 2px 4px; font-size: 11px;
  border: 1px solid var(--button-bg, #42b983); border-radius: 4px;
  background: var(--card-bg, #fff);
  color: var(--text-primary, #333);
  outline: none;
}
</style>
