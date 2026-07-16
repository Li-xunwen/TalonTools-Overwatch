<template>
  <div class="video-dialog-overlay" @click.self="$emit('close')">
    <div class="video-dialog-panel">
      <!-- 顶部栏 -->
      <div class="vd-header">
        <h3>发布视频</h3>
        <button class="vd-close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 表单区 -->
      <div class="vd-body">
        <div class="vd-field">
          <label class="vd-label">标题</label>
          <input v-model="title" class="vd-input" placeholder="输入视频标题" maxlength="128" />
        </div>
        <div class="vd-field">
          <label class="vd-label">简介</label>
          <textarea v-model="description" class="vd-textarea" placeholder="输入视频简介" rows="3" maxlength="500"></textarea>
        </div>

        <div class="vd-field">
          <label class="vd-label">视频文件</label>
          <button class="vd-select-btn" @click="showFileLibrary = true">
            {{ selectedVideo ? '重新选择' : '点击选择视频' }}
          </button>
          <!-- 视频预览 -->
          <div v-if="selectedVideo" class="vd-preview">
            <video :src="selectedVideo.url" controls playsinline muted class="vd-preview-video"></video>
            <span class="vd-preview-name">{{ selectedVideo.name }}</span>
          </div>
          <div v-else class="vd-preview-empty">未选择视频文件</div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="vd-footer">
        <button class="vd-publish-btn" @click="publish" :disabled="publishing || !canPublish">
          {{ publishing ? '发布中...' : '发布' }}
        </button>
      </div>

      <!-- 文件库弹窗 -->
      <FileLibrary v-if="showFileLibrary" @close="showFileLibrary = false" @select="onVideoSelected" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import FileLibrary from '@/components/FileLibrary.vue';
import { authFetch } from '@/utils/request';

const emit = defineEmits(['close', 'published']);

const title = ref('');
const description = ref('');
const selectedVideo = ref<any>(null);
const showFileLibrary = ref(false);
const publishing = ref(false);

const canPublish = computed(() => title.value.trim() && selectedVideo.value);

function onVideoSelected(file: any) {
  selectedVideo.value = file;
  showFileLibrary.value = false;
}

async function publish() {
  if (!canPublish.value) return;
  publishing.value = true;
  try {
    const t = title.value.trim();
    const d = description.value.trim();
    const video = selectedVideo.value;

    // 构建 Markdown 内容
    const content = `# ${t}\n\n## ${d}\n\n![${video.name}](${video.url})`;

    const res = await authFetch('/api/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: t,
        content,
        description: d,
        type: 2,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      emit('published', data);
    } else {
      const e = await res.json().catch(() => ({ error: '发布失败' }));
      alert('发布失败: ' + (e.error || ''));
    }
  } catch {
    alert('网络错误');
  } finally {
    publishing.value = false;
  }
}
</script>

<style scoped>
.video-dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 99999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.video-dialog-panel {
  background: var(--card-bg, #fff);
  border-radius: 16px;
  width: 90%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.vd-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--input-border, #ddd);
}
.vd-header h3 {
  font-size: 16px;
  margin: 0;
  color: var(--text-primary, #333);
}
.vd-close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--accent, #999);
  padding: 4px 8px;
  border-radius: 6px;
  transition: all .15s;
}
.vd-close-btn:hover {
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-primary, #333);
}
.vd-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.vd-field {
  margin-bottom: 18px;
}
.vd-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 6px;
}
.vd-input {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--input-border, #ddd);
  border-radius: 10px;
  background: var(--card-bg, #fff);
  color: var(--text-primary, #333);
  outline: none;
  transition: border-color .2s;
}
.vd-input:focus {
  border-color: var(--button-bg, #42b983);
}
.vd-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 10px 12px;
  font-size: 14px;
  border: 1px solid var(--input-border, #ddd);
  border-radius: 10px;
  background: var(--card-bg, #fff);
  color: var(--text-primary, #333);
  outline: none;
  resize: vertical;
  font-family: inherit;
  transition: border-color .2s;
}
.vd-textarea:focus {
  border-color: var(--button-bg, #42b983);
}
.vd-select-btn {
  padding: 10px 24px;
  border: 2px dashed var(--input-border, #ddd);
  border-radius: 12px;
  background: transparent;
  color: var(--accent, #999);
  font-size: 14px;
  cursor: pointer;
  transition: all .2s;
  display: inline-block;
}
.vd-select-btn:hover {
  border-color: var(--button-bg, #42b983);
  color: var(--button-bg, #42b983);
  background: color-mix(in srgb, var(--button-bg, #42b983) 6%, transparent);
}
.vd-preview {
  margin-top: 10px;
}
.vd-preview-video {
  width: 100%;
  max-height: 280px;
  border-radius: 10px;
  background: #000;
  display: block;
}
.vd-preview-name {
  display: block;
  font-size: 12px;
  color: var(--accent, #999);
  margin-top: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.vd-preview-empty {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent, #999);
}
.vd-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--input-border, #ddd);
  display: flex;
  justify-content: flex-end;
}
.vd-publish-btn {
  padding: 10px 32px;
  border: none;
  border-radius: 48px;
  background: var(--button-bg, #42b983);
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background .2s;
}
.vd-publish-btn:hover:not(:disabled) {
  background: #2c6e4f;
}
.vd-publish-btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
