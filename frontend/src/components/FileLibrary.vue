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
            <button
              class="fl-btn fl-btn-insert"
              @click="runSingleAction"
              :disabled="!selectedFile"
            >{{ singleActionLabel }}</button>
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
        <!-- ❕ 隐私提示按钮（文件列表右上角） -->
        <button class="fl-privacy-btn" @click="showPrivacy = !showPrivacy" :class="{ active: showPrivacy }">❕</button>
        <!-- 隐私提示内容 -->
        <div v-if="showPrivacy" class="fl-privacy-notice">
          <p>🔒 你上传的文件仅你自己可见。上传的图片、视频与音频可用于文章与题库编辑，文件会保存在服务器上。</p>
          <p>请勿上传违反法律法规的内容，本站保留删除违规文件的权利。</p>
        </div>
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
            @click="multiSelect ? toggleMultiSelect(f) : onItemClick(f)"
            @dblclick="multiSelect ? null : runFileAction(f)"
          >
            <!-- 多选编号角标 -->
            <div v-if="multiSelect && multiSelectedKeys.has(f.name)" class="fl-order-badge">
              {{ multiSelectedOrder.get(f.name) }}
            </div>
            <div v-if="f.type === 'image'" class="fl-thumb">
              <img v-if="f.status !== 'parsing'" :src="f.url" :alt="f.name" loading="lazy" />
              <div v-else class="fl-parsing"><span class="fl-spinner"></span>解析中</div>
            </div>
            <div v-else-if="f.status === 'parsing'" class="fl-thumb fl-parsing-thumb">
              <div class="fl-parsing"><span class="fl-spinner"></span>解析中</div>
            </div>
            <div v-else-if="f.type === 'video'" class="fl-thumb fl-video-thumb">
              <video :src="f.url" preload="metadata" muted></video>
              <span class="fl-play-icon">play</span>
            </div>
            <!-- 音频：点击缩略图即在本页试听（不打开外部播放器） -->
            <div v-else-if="f.type === 'audio'" class="fl-thumb fl-audio-thumb">
              <span class="fl-audio-note">♪</span>
              <span class="fl-audio-btn">{{ playingAudio === f.name ? '❚❚' : '▶' }}</span>
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
                  <button
                    v-if="f.status !== 'parsing'"
                    class="fl-rename-btn"
                    @click.stop="startRename(f)"
                    title="重命名"
                  >✏️</button>
                </div>
                <span class="fl-meta">
                  <template v-if="f.status === 'parsing'">解析中…</template>
                  <template v-else-if="f.status === 'failed'">解析失败</template>
                  <template v-else>{{ f.ext.replace('.', '').toUpperCase() }} {{ formatSize(f.size) }}</template>
                </span>
              </template>
            </div>
          </div>
        </div>

      </div>
      <!-- 音频试听用的播放器（隐藏，由缩略图点击控制） -->
      <audio ref="audioRef" class="fl-audio-el" @ended="playingAudio = ''"></audio>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, reactive, onMounted, onUnmounted } from 'vue';

interface FileItem {
  id: number;
  name: string;
  size: number;
  type: string;
  ext: string;
  mime?: string;
  md5?: string;
  status?: 'parsing' | 'ready' | 'failed';
  url: string;
  mtime?: number;
}

// 分片上传记录：同一个文件（名 + 大小 + 修改时间）断线重传时复用 uploadId
interface UploadRecord {
  uploadId: string;
  size: number;
  ext: string;
  mime: string;
  at: number;
}

const UPLOAD_RECORDS_KEY = 'fileLibraryUploads';
const UPLOAD_CHUNK_SIZE = 4 * 1024 * 1024;

interface UploadProgressState {
  visible: boolean;
  total: number;
  completed: number;
  currentPercent: number;
}

const props = withDefaults(defineProps<{
  multiSelect?: boolean;
  maxSelect?: number;
  /** select = 「使用」（插入文章/图集等）；download = 「下载」（个人页文件库） */
  mode?: 'select' | 'download';
}>(), {
  multiSelect: false,
  maxSelect: 9,
  mode: 'select',
});

const emit = defineEmits(['close', 'select']);

const files = ref<FileItem[]>([]);
const loading = ref(true);
const selectedFile = ref('');
const renamingFile = ref<string | null>(null);
const renameValue = ref('');
const showPrivacy = ref(false);

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
    // 之前有文件还在「解析中」（刷新页面时）→ 继续轮询
    if (files.value.some((f) => f.status === 'parsing')) startParsingPoll();
  } catch {}
  loading.value = false;
});

onUnmounted(() => {
  stopParsingPoll();
  stopAudioPreview();
});

function isParsing(f: FileItem): boolean {
  return f.status === 'parsing';
}

function selectFile(f: FileItem) {
  if (isParsing(f)) {
    alert('文件正在解析中，请稍候');
    return;
  }
  selectedFile.value = selectedFile.value === f.name ? '' : f.name;
}

/* ---------- 音频试听 ---------- */
const audioRef = ref<HTMLAudioElement | null>(null);
// 正在试听的音频文件名（空串表示没有在播）
const playingAudio = ref('');

function onItemClick(f: FileItem) {
  selectFile(f);
  // 音频：点缩略图直接试听 / 再点暂停
  if (f.type === 'audio') toggleAudioPreview(f);
}

function toggleAudioPreview(f: FileItem) {
  if (isParsing(f)) {
    alert('文件正在解析中，请稍候');
    return;
  }
  const el = audioRef.value;
  if (!el) return;
  if (playingAudio.value === f.name) {
    el.pause();
    playingAudio.value = '';
    return;
  }
  if (!f.url) {
    alert('该音频暂不可播放');
    return;
  }
  el.src = f.url;
  el.currentTime = 0;
  el.play()
    .then(() => { playingAudio.value = f.name; })
    .catch(() => {
      playingAudio.value = '';
      alert('无法播放该音频（浏览器不支持该格式或文件已损坏）');
    });
}

function stopAudioPreview() {
  audioRef.value?.pause();
  playingAudio.value = '';
}

function insertFile(f: FileItem) {
  if (isParsing(f)) {
    alert('文件正在解析中，请稍候');
    return;
  }
  emit('select', f);
}

const singleActionLabel = computed(() => (props.mode === 'download' ? '下载' : '使用'));

// 下载时补上扩展名：显示名可能是「图片1」这种没有后缀的默认名
function downloadNameOf(f: FileItem): string {
  const ext = String(f.ext ?? '').toLowerCase();
  if (!ext) return f.name;
  return f.name.toLowerCase().endsWith(ext) ? f.name : `${f.name}${ext}`;
}

function downloadFile(f: FileItem) {
  if (isParsing(f)) {
    alert('文件正在解析中，请稍候');
    return;
  }
  if (!f.url) {
    alert('文件暂不可下载');
    return;
  }

  const link = document.createElement('a');
  link.href = f.url;
  link.download = downloadNameOf(f);
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

// 单选模式下按钮 / 双击的行为：下载模式下载，否则交给父组件插入
function runFileAction(f: FileItem) {
  if (props.mode === 'download') downloadFile(f);
  else insertFile(f);
}

function runSingleAction() {
  const f = files.value.find((item) => item.name === selectedFile.value);
  if (f) runFileAction(f);
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
  if (isParsing(f)) return;
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
  if (file && file.name !== lastHoveredKey && file.type === 'image' && !isParsing(file)) {
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
  if (isParsing(f)) return;
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
function readUploadRecords(): Record<string, UploadRecord> {
  try {
    return JSON.parse(localStorage.getItem(UPLOAD_RECORDS_KEY) || '{}') as Record<string, UploadRecord>;
  } catch {
    return {};
  }
}

function writeUploadRecords(records: Record<string, UploadRecord>) {
  try {
    localStorage.setItem(UPLOAD_RECORDS_KEY, JSON.stringify(records));
  } catch {
    /* 忽略写入失败（隐私模式等） */
  }
}

// 断点续传的匹配键：同一个文件（名 + 大小 + 修改时间）视为同一次上传
function uploadKeyOf(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

function extOf(name: string): string {
  const index = name.lastIndexOf('.');
  return index > 0 ? name.slice(index).toLowerCase() : '';
}

async function reloadFiles() {
  const res = await api('/api/users/files');
  if (res.ok) files.value = (await res.json()).files || [];
}

// 有文件在「解析中」时轮询刷新，直到全部解析完成
let parsingTimer: number | null = null;

function stopParsingPoll() {
  if (parsingTimer !== null) {
    clearInterval(parsingTimer);
    parsingTimer = null;
  }
}

function startParsingPoll() {
  if (parsingTimer !== null) return;
  parsingTimer = window.setInterval(async () => {
    if (!files.value.some((f) => f.status === 'parsing')) {
      stopParsingPoll();
      return;
    }
    try {
      await reloadFiles();
    } catch {
      /* 忽略单次失败 */
    }
  }, 1500);
}

async function onUpload(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files || !input.files.length) return;

  const fileList = Array.from(input.files);
  const total = fileList.length;

  uploadProgress.visible = true;
  uploadProgress.total = total;
  uploadProgress.completed = 0;
  uploadProgress.currentPercent = 0;

  for (let i = 0; i < total; i++) {
    const file = fileList[i];
    try {
      await uploadOneFile(file);
      uploadProgress.completed++;
    } catch (err: any) {
      console.error('上传失败:', file.name, err);
      alert(`上传失败: ${file.name}`);
    }
  }

  try {
    await reloadFiles();
  } catch {}

  setTimeout(() => {
    uploadProgress.visible = false;
    uploadProgress.currentPercent = 0;
  }, 1000);

  startParsingPoll();
  // input 需要清空，否则同一个文件再选一次不会触发 change
  input.value = '';
}

// 单个分片：用 XHR 拿上传进度
function uploadChunk(
  uploadId: string,
  index: number,
  blob: Blob,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('uploadId', uploadId);
    fd.append('index', String(index));
    fd.append('chunk', blob, `chunk-${index}`);

    const token = localStorage.getItem('authToken');
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/users/files/upload/chunk');

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
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

// 分片上传 + 断点续传 + 完成后进入「解析中」
async function uploadOneFile(file: File) {
  const records = readUploadRecords();
  const key = uploadKeyOf(file);
  const previous = records[key];
  const ext = extOf(file.name);

  const initRes = await api('/api/users/files/upload/init', {
    method: 'POST',
    body: JSON.stringify({
      // 带上原始文件名：后端用它决定显示名（含中文就用文件名，否则用「图片1 / 音频1」这种默认名）
      name: file.name,
      size: file.size,
      ext,
      mime: file.type,
      chunkSize: UPLOAD_CHUNK_SIZE,
      resumeUploadId: previous?.uploadId
    })
  });
  if (!initRes.ok) throw new Error('初始化上传失败');

  const session = await initRes.json();
  const chunkSize: number = session.chunkSize || UPLOAD_CHUNK_SIZE;
  const totalChunks: number = session.totalChunks || 1;
  const received: number[] = session.received || [];

  // 记下 uploadId：中途断线/关页面后，重传同一个文件可以接着传
  records[key] = { uploadId: session.uploadId, size: file.size, ext, mime: file.type, at: Date.now() };
  writeUploadRecords(records);

  for (let index = 0; index < totalChunks; index++) {
    if (received.includes(index)) {
      uploadProgress.currentPercent = Math.round(((index + 1) / totalChunks) * 100);
      continue;
    }

    const blob = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size));
    await uploadChunk(session.uploadId, index, blob, (percent) => {
      uploadProgress.currentPercent = Math.round(((index + percent / 100) / totalChunks) * 100);
    });
  }

  const completeRes = await api('/api/users/files/upload/complete', {
    method: 'POST',
    body: JSON.stringify({ uploadId: session.uploadId })
  });
  if (!completeRes.ok) {
    const body = await completeRes.json().catch(() => ({}));
    throw new Error(body.error || '完成上传失败');
  }

  delete records[key];
  writeUploadRecords(records);

  // 立刻把「解析中」的卡片插到最前面，后台算完 md5 再刷新
  const created = (await completeRes.json()).file as FileItem | undefined;
  if (created) {
    files.value = [created, ...files.value.filter((item) => item.id !== created.id)];
  }
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

.fl-body { flex: 1; overflow-y: auto; overflow-x: hidden; padding: 12px; background: var(--card-bg, #fff); position: relative; }

/* ❕ 隐私提示按钮（fl-body 右上角） */
.fl-privacy-btn {
  position: sticky;
  top: 0;
  float: right;
  z-index: 2;
  padding: 4px 10px;
  border: 1px solid #f59e0b;
  border-radius: 8px;
  background: var(--card-bg, #fff);
  color: #f59e0b;
  font-size: 14px;
  cursor: pointer;
  transition: all .15s;
  margin-bottom: 4px;
}
.fl-privacy-btn.active {
  background: #f59e0b;
  color: #fff;
}
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

/* 解析中（正在计算 md5）：转圈 + 文案，占位与图片缩略图同尺寸 */
.fl-parsing {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 6px; width: 100%; height: 100%;
  font-size: 11px; color: var(--text-primary, #333); opacity: .75;
}
.fl-spinner {
  width: 18px; height: 18px; border-radius: 50%;
  border: 2px solid rgba(128, 128, 128, .35);
  border-top-color: var(--button-bg, #4a90e2);
  animation: fl-spin .8s linear infinite;
}
@keyframes fl-spin { to { transform: rotate(360deg); } }
.fl-parsing-thumb { background: var(--bg-secondary, #f0f0f0); }
.fl-other-icon { background: var(--input-border, #eee); }
.fl-icon-text { font-size: 24px; opacity: 0.5; }

/* 音频缩略图：音符 + 播放/暂停按钮 */
.fl-audio-thumb {
  background: linear-gradient(135deg, #2f6fd0 0%, #1f4f9c 100%);
  flex-direction: column;
  gap: 4px;
}
.fl-audio-note { font-size: 26px; color: rgba(255, 255, 255, .9); line-height: 1; }
.fl-audio-btn {
  font-size: 11px; line-height: 1;
  padding: 3px 8px; border-radius: 999px;
  background: rgba(255, 255, 255, .22); color: #fff;
}
/* 试听用的播放器本身不占版面 */
.fl-audio-el { display: none; }
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

/* ====== 隐私提示 ====== */
.fl-privacy-notice {
  margin-top: 12px;
  padding: 14px 16px;
  background: var(--bg-secondary, #f5f5f5);
  border-radius: 10px;
  border: 1px solid var(--input-border, #ddd);
}
.fl-privacy-notice p {
  font-size: 12px;
  line-height: 1.6;
  color: var(--accent, #666);
  margin: 0;
}
.fl-privacy-notice p:first-child {
  margin-bottom: 6px;
}
</style>
