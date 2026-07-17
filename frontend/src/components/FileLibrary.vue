<template>
  <div class="file-library-overlay" @click.self="() => {}">
    <div class="file-library-panel">
      <div class="fl-header">
        <h3>文件库</h3>
        <div class="fl-header-actions">
          <!-- 多选模式 -->
          <template v-if="multiSelect">
            <button class="fl-btn fl-btn-insert" @click="confirmMultiSelect" :disabled="multiSelectedKeys.size === 0">
              确定{{ multiSelectedKeys.size ? '(' + multiSelectedKeys.size + ')' : '' }}
            </button>
          </template>
          <!-- 单选模式 -->
          <template v-else>
            <button class="fl-btn fl-btn-insert" @click="insertSelected" :disabled="!selectedFile">使用</button>
          </template>
          <label class="fl-upload-btn">
            上传
            <input type="file" hidden multiple @change="onUpload" />
          </label>
          <button class="fl-btn fl-btn-del" @click="deleteSelected" :disabled="!selectedFile && multiSelectedKeys.size === 0">删除</button>
          <button class="fl-btn fl-btn-close" @click="$emit('close')">关闭</button>
        </div>
      </div>

      <!-- ====== 上传进度条 ====== -->
      <div v-if="uploadProgress.visible" class="fl-upload-progress">
        <div class="fl-upload-progress-left">
          <span class="fl-upload-count-done">{{ uploadProgress.completed }}</span>
          <span class="fl-upload-count-sep">/</span>
          <span class="fl-upload-count-total">{{ uploadProgress.total }}</span>
        </div>
        <div class="fl-upload-progress-track">
          <div class="fl-upload-progress-fill" :style="{ width: uploadProgress.currentPercent + '%' }"></div>
        </div>
        <div class="fl-upload-progress-right">{{ uploadProgress.currentPercent }}%</div>
      </div>

      <div class="fl-body">
        <div v-if="loading" class="fl-loading">加载中...</div>
        <div v-else-if="files.length === 0" class="fl-empty">暂无文件</div>
        <div v-else
          class="fl-grid"
          @pointerdown="multiSelect ? onGridPointerDown($event) : null"
          @pointermove="multiSelect ? onGridPointerMove($event) : null"
          @pointerup="multiSelect ? onGridPointerUp() : null"
          @pointerleave="multiSelect ? onGridPointerUp() : null"
          :style="{ touchAction: multiSelect ? 'pan-y' : 'auto' }"
        >
          <div v-for="f in files" :key="f.name"
            :class="['fl-item', {
              selected: multiSelect ? multiSelectedKeys.has(f.name) : selectedFile === f.name,
              'multi-sel': multiSelectedKeys.has(f.name)
            }]"
            @click="multiSelect ? toggleMultiSelect(f) : selectFile(f)"
            @dblclick="multiSelect ? null : insertFile(f)"
          >
            <!-- 多选编号角标 -->
            <div v-if="multiSelect && multiSelectedKeys.has(f.name)" class="fl-order-badge">
              {{ multiSelectedOrder.get(f.name) }}
            </div>
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
import { ref, reactive, onMounted } from 'vue';

interface FileItem {
  name: string; size: number; type: string;
  ext: string; url: string;
}

interface UploadProgressState {
  visible: boolean;
  total: number;
  completed: number;
  currentPercent: number;
}

const props = withDefaults(defineProps<{
  multiSelect?: boolean;
  maxSelect?: number;
}>(), {
  multiSelect: false,
  maxSelect: 9,
});

const emit = defineEmits(['close', 'select']);

const files = ref<FileItem[]>([]);
const loading = ref(true);
const selectedFile = ref('');
const renamingFile = ref<string | null>(null);
const renameValue = ref('');

// 上传进度状态
const uploadProgress = reactive<UploadProgressState>({
  visible: false,
  total: 0,
  completed: 0,
  currentPercent: 0,
});

// 多选状态
const multiSelectedKeys = ref<Set<string>>(new Set());
const multiSelectedOrder = ref<Map<string, number>>(new Map());

// 滑动选择状态
let isSwiping = false;
let lastHoveredKey = '';
let swipeStartX = 0;
let swipeStartY = 0;
let swipeDirection: 'none' | 'horizontal' | 'vertical' = 'none';
const SWIPE_THRESHOLD = 10;

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

// ===== 多选 =====
function addToMultiSelect(name: string) {
  if (multiSelectedKeys.value.has(name)) return;
  if (multiSelectedKeys.value.size >= props.maxSelect) {
    alert(`最多选择 ${props.maxSelect} 张图片`);
    return;
  }
  const nextOrder = multiSelectedKeys.value.size + 1;
  const next = new Set(multiSelectedKeys.value);
  next.add(name);
  multiSelectedKeys.value = next;

  const order = new Map(multiSelectedOrder.value);
  order.set(name, nextOrder);
  multiSelectedOrder.value = order;
}

function removeFromMultiSelect(name: string) {
  if (!multiSelectedKeys.value.has(name)) return;
  const next = new Set(multiSelectedKeys.value);
  next.delete(name);
  multiSelectedKeys.value = next;

  const order = new Map(multiSelectedOrder.value);
  order.delete(name);
  const sorted = [...order.entries()].sort((a, b) => a[1] - b[1]);
  order.clear();
  sorted.forEach(([n], i) => order.set(n, i + 1));
  multiSelectedOrder.value = order;
}

function toggleMultiSelect(f: FileItem) {
  if (f.type !== 'image') {
    alert('图集仅支持图片文件');
    return;
  }
  if (multiSelectedKeys.value.has(f.name)) {
    removeFromMultiSelect(f.name);
  } else {
    addToMultiSelect(f.name);
  }
}

function confirmMultiSelect() {
  const selectedFiles = files.value.filter(f => multiSelectedKeys.value.has(f.name));
  if (selectedFiles.length === 0) return;
  emit('select', selectedFiles);
}

// ===== 滑动选择 =====
function onGridPointerDown(e: PointerEvent) {
  isSwiping = true;
  swipeStartX = e.clientX;
  swipeStartY = e.clientY;
  swipeDirection = 'none';
  lastHoveredKey = '';
}

function getFileFromPoint(x: number, y: number): FileItem | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const item = (el as HTMLElement).closest('.fl-item');
  if (!item) return null;
  const nameEl = item.querySelector('.fl-name');
  const fileName = nameEl?.getAttribute('title') || '';
  return files.value.find(f => f.name === fileName || f.name === fixEncoding(fileName)) || null;
}

function onGridPointerMove(e: PointerEvent) {
  if (!isSwiping) return;
  const dx = Math.abs(e.clientX - swipeStartX);
  const dy = Math.abs(e.clientY - swipeStartY);

  if (swipeDirection === 'none') {
    if (dx > SWIPE_THRESHOLD || dy > SWIPE_THRESHOLD) {
      if (dx > dy) {
        swipeDirection = 'horizontal';
      } else {
        swipeDirection = 'vertical';
        isSwiping = false;
        return;
      }
    } else {
      return;
    }
  }

  if (swipeDirection !== 'horizontal') return;

  const file = getFileFromPoint(e.clientX, e.clientY);
  if (file && file.name !== lastHoveredKey && file.type === 'image') {
    toggleMultiSelect(file);
    lastHoveredKey = file.name;
  }
}

function onGridPointerUp() {
  isSwiping = false;
  lastHoveredKey = '';
  swipeDirection = 'none';
}

// ===== 重命名 =====
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

// ===== 上传（带进度） =====
async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;

  const fileList = Array.from(input.files);
  const total = fileList.length;

  // 显示进度条
  uploadProgress.visible = true;
  uploadProgress.total = total;
  uploadProgress.completed = 0;
  uploadProgress.currentPercent = 0;

  // 逐个上传，每个文件使用 XHR 获取实时进度
  for (let i = 0; i < total; i++) {
    const file = fileList[i];
    const fd = new FormData();
    fd.append('file', file);

    try {
      await uploadSingleFile(fd, i, total);
      uploadProgress.completed++;
    } catch (err: any) {
      console.error('上传失败:', file.name, err);
      alert(`上传失败: ${file.name}`);
    }
  }

  // 上传完毕，刷新文件列表
  try {
    const res = await api('/api/users/files');
    if (res.ok) files.value = (await res.json()).files || [];
  } catch {}

  // 延迟隐藏进度条
  setTimeout(() => {
    uploadProgress.visible = false;
    uploadProgress.currentPercent = 0;
  }, 1000);
}

function uploadSingleFile(fd: FormData, _index: number, _total: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const token = localStorage.getItem('authToken');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/users/files/upload');

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        uploadProgress.currentPercent = Math.round((event.loaded / event.total) * 100);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        let errMsg = '上传失败';
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.error) errMsg = body.error;
        } catch {}
        reject(new Error(errMsg));
      }
    };

    xhr.onerror = () => reject(new Error('网络错误'));
    xhr.send(fd);
  });
}

// ===== 删除 =====
async function deleteSelected() {
  const target = props.multiSelect
    ? [...multiSelectedKeys.value]
    : (selectedFile.value ? [selectedFile.value] : []);
  if (target.length === 0) return;
  if (!confirm('确定删除选中的 ' + target.length + ' 个文件？')) return;
  try {
    for (const name of target) {
      await api('/api/users/files/' + encodeURIComponent(name), { method: 'DELETE' });
    }
    selectedFile.value = '';
    multiSelectedKeys.value = new Set();
    multiSelectedOrder.value = new Map();
    const r = await api('/api/users/files');
    if (r.ok) files.value = (await r.json()).files || [];
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

/* ====== 上传进度条 ====== */
.fl-upload-progress {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 20px;
  background: #f0f7ff;
  border-bottom: 1px solid #dbeafe;
}
.fl-upload-progress-left {
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  color: #374151;
}
.fl-upload-count-done {
  color: #1877f2;
  font-weight: 700;
}
.fl-upload-count-sep {
  color: #9ca3af;
  margin: 0 1px;
}
.fl-upload-count-total {
  color: #9ca3af;
}
.fl-upload-progress-track {
  flex: 1;
  height: 8px;
  background: #e0e7ff;
  border-radius: 4px;
  overflow: hidden;
}
.fl-upload-progress-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #1877f2, #6366f1);
  border-radius: 4px;
  transition: width 0.15s ease;
}
.fl-upload-progress-right {
  flex-shrink: 0;
  min-width: 40px;
  text-align: right;
  font-size: 14px;
  font-weight: 600;
  color: #1877f2;
  font-variant-numeric: tabular-nums;
}

.fl-body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px; background: var(--card-bg, #fff); }
.fl-loading, .fl-empty { text-align: center; padding: 60px 0; color: var(--accent, #999); }
.fl-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; user-select: none; min-width: 0; }
.fl-item {
  border: 2px solid transparent; border-radius: 6px; padding: 3px;
  cursor: pointer; background: var(--bg-secondary, #f5f5f5);
  transition: border-color .15s, background .15s;
  position: relative; min-width: 0;
}
.fl-item:hover { border-color: var(--button-bg, #1877f2); }
.fl-item.selected { border-color: var(--button-bg, #1877f2); background: color-mix(in srgb, var(--button-bg, #1877f2) 8%, transparent); }
.fl-item.multi-sel {
  border-color: var(--button-bg, #1877f2) !important;
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--button-bg, #1877f2) 30%, transparent);
}
.fl-order-badge {
  position: absolute; top: 4px; right: 4px; z-index: 2;
  width: 22px; height: 22px; border-radius: 50%;
  background: var(--button-bg, #42b983); color: #fff;
  font-size: 12px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}
.fl-thumb {
  width: 100%; aspect-ratio: 1; border-radius: 4px;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: var(--input-border, #e0e0e0); position: relative;
}
.fl-thumb img, .fl-thumb video { width: 100%; height: 100%; object-fit: cover; }
.fl-other-icon { background: var(--input-border, #eee); }
.fl-icon-text { font-size: 24px; opacity: 0.5; }
.fl-info { margin-top: 3px; }
.fl-name-row { display: flex; align-items: center; gap: 4px; }
.fl-name { font-size: 10px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--text-primary, #333); }
.fl-rename-btn { background: none; border: none; cursor: pointer; font-size: 11px; padding: 0 2px; opacity: 0.4; transition: opacity .15s; flex-shrink: 0; }
.fl-rename-btn:hover { opacity: 1; }
.fl-meta { font-size: 9px; color: var(--accent, #999); }
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
