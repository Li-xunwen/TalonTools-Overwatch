<template>
  <div class="album-dialog-overlay" @click.self="$emit('close')">
    <div class="album-dialog-panel">
      <!-- 顶部栏 -->
      <div class="ad-header">
        <h3>发布图集</h3>
        <button class="ad-close-btn" @click="$emit('close')">✕</button>
      </div>

      <!-- 表单区 -->
      <div class="ad-body">
        <div class="ad-field">
          <label class="ad-label">标题</label>
          <input v-model="title" class="ad-input" placeholder="输入图集标题" maxlength="128" />
        </div>
        <div class="ad-field">
          <label class="ad-label">简介</label>
          <textarea v-model="description" class="ad-textarea" placeholder="输入图集简介" rows="3" maxlength="500"></textarea>
        </div>

        <div class="ad-field">
          <label class="ad-label">图片（最多 9 张）</label>
          <button class="ad-select-btn" @click="openFileLibrary">
            {{ selectedImages.length > 0 ? '重新选择' : '点击选择图片' }}
          </button>

          <!-- 九宫格预览 -->
          <div v-if="selectedImages.length > 0" class="ad-grid-wrap">
            <div class="ad-grid">
              <div v-for="(img, i) in selectedImages" :key="i" class="ad-grid-item" @click="viewImage(i)">
                <img :src="img.url" :alt="img.name" loading="lazy" />
                <button class="ad-grid-remove" @click.stop="removeImage(i)">✕</button>
                <span class="ad-grid-order">{{ i + 1 }}</span>
              </div>
            </div>
          </div>
          <div v-else class="ad-preview-empty">未选择图片</div>
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="ad-footer">
        <button class="ad-publish-btn" @click="publish" :disabled="publishing || !canPublish">
          {{ publishing ? '发布中...' : '发布' }}
        </button>
      </div>

      <!-- 文件库弹窗（多选模式） -->
      <FileLibrary v-if="showFileLibrary" :multiSelect="true" :maxSelect="9" @close="showFileLibrary = false" @select="onImagesSelected" />

      <!-- 大图查看 -->
      <ImageViewer :visible="viewerVisible" :src="viewerSrc" @update:visible="viewerVisible = $event" @close="viewerVisible = false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import FileLibrary from '@/components/FileLibrary.vue';
import ImageViewer from '@/components/ImageViewer.vue';
import { authFetch } from '@/utils/request';

const emit = defineEmits(['close', 'published']);

const title = ref('');
const description = ref('');
const selectedImages = ref<any[]>([]);
const showFileLibrary = ref(false);
const publishing = ref(false);

// 大图查看
const viewerVisible = ref(false);
const viewerSrc = ref('');

const canPublish = computed(() => title.value.trim() && selectedImages.value.length > 0);

function openFileLibrary() {
  showFileLibrary.value = true;
}

function onImagesSelected(files: any[]) {
  // 限制最多 9 张
  const images = files.filter((f: any) => f.type === 'image').slice(0, 9);
  selectedImages.value = images;
  showFileLibrary.value = false;
}

function viewImage(index: number) {
  viewerSrc.value = selectedImages.value[index].url;
  viewerVisible.value = true;
}

function removeImage(index: number) {
  selectedImages.value.splice(index, 1);
}

async function publish() {
  if (!canPublish.value) return;
  publishing.value = true;
  try {
    const t = title.value.trim();
    const d = description.value.trim();

    // 构建 Markdown：每张图片一行
    const imageLines = selectedImages.value.map((img: any) => `![${img.name}](${img.url})`).join('\n');
    const content = `# ${t}\n\n## ${d}\n\n${imageLines}`;

    const res = await authFetch('/api/pages', {
      method: 'POST',
      body: JSON.stringify({
        title: t,
        content,
        description: d,
        type: 3,
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
.album-dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 99998;
  display: flex;
  align-items: center;
  justify-content: center;
}
.album-dialog-panel {
  background: var(--card-bg, #fff);
  border-radius: 16px;
  width: 90%;
  max-width: 560px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,0.3);
}
.ad-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--input-border, #ddd);
}
.ad-header h3 {
  font-size: 16px;
  margin: 0;
  color: var(--text-primary, #333);
}
.ad-close-btn {
  background: none;
  border: none;
  font-size: 20px;
  cursor: pointer;
  color: var(--accent, #999);
  padding: 4px 8px;
  border-radius: 6px;
  transition: all .15s;
}
.ad-close-btn:hover {
  background: var(--bg-secondary, #f5f5f5);
  color: var(--text-primary, #333);
}
.ad-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.ad-field {
  margin-bottom: 18px;
}
.ad-label {
  display: block;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary, #333);
  margin-bottom: 6px;
}
.ad-input {
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
.ad-input:focus {
  border-color: var(--button-bg, #42b983);
}
.ad-textarea {
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
.ad-textarea:focus {
  border-color: var(--button-bg, #42b983);
}
.ad-select-btn {
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
.ad-select-btn:hover {
  border-color: var(--button-bg, #42b983);
  color: var(--button-bg, #42b983);
  background: color-mix(in srgb, var(--button-bg, #42b983) 6%, transparent);
}
.ad-preview-empty {
  margin-top: 8px;
  font-size: 12px;
  color: var(--accent, #999);
}

/* 九宫格 */
.ad-grid-wrap {
  margin-top: 12px;
}
.ad-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.ad-grid-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  background: #e0e0e0;
}
.ad-grid-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.ad-grid-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(0,0,0,0.55);
  border: none;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  transition: background .15s;
}
.ad-grid-remove:hover {
  background: rgba(239,68,68,0.85);
}
.ad-grid-order {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0,0,0,0.5);
  color: #fff;
  font-size: 10px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ad-footer {
  padding: 14px 20px;
  border-top: 1px solid var(--input-border, #ddd);
  display: flex;
  justify-content: flex-end;
}
.ad-publish-btn {
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
.ad-publish-btn:hover:not(:disabled) {
  background: #2c6e4f;
}
.ad-publish-btn:disabled {
  opacity: .5;
  cursor: not-allowed;
}
</style>
