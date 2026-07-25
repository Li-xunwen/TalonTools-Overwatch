<template>
  <div class="transfer-overlay" @click.self="$emit('close')">
    <div class="transfer-panel">
      <h3>🔄 转让作者</h3>
      <p class="transfer-hint">搜索并选择要转让给的用户：</p>
      <input
        v-model="query"
        class="transfer-search-input"
        placeholder="输入用户名搜索…"
        @input="onSearch"
        ref="inputRef"
      />
      <div v-if="searching" class="transfer-loading">搜索中…</div>
      <div v-else-if="results.length === 0 && query.length > 0" class="transfer-empty">未找到匹配用户</div>
      <div v-else class="transfer-results">
        <div
          v-for="u in results"
          :key="u.id"
          class="transfer-user-item"
          @click="confirmTransfer(u)"
        >
          <img :src="getAvatarUrl(u.battletag)" class="transfer-user-avatar" @error="handleImageError" alt="" />
          <span class="transfer-user-name">{{ u.battletag }}</span>
        </div>
      </div>
      <div class="transfer-actions">
        <button class="transfer-cancel-btn" @click="$emit('close')">取消</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';

const props = defineProps<{
  pageId: number;
}>();

const emit = defineEmits<{
  close: [];
  transferred: [payload: { newAuthorId: number; newAuthorName: string }];
}>();

const query = ref('');
const results = ref<{ id: number; battletag: string }[]>([]);
const searching = ref(false);
const inputRef = ref<HTMLInputElement | null>(null);
let searchTimer: ReturnType<typeof setTimeout> | null = null;

onMounted(() => {
  nextTick(() => inputRef.value?.focus());
});

function getAvatarUrl(name: string): string {
  return name ? `/api/users/${encodeURIComponent(name)}/avatar` : '';
}

function handleImageError(e: Event) {
  const img = e.target as HTMLImageElement;
  img.src = '/res/imge/default-avatar.png';
  img.onerror = null;
}

function onSearch() {
  const q = query.value.trim();
  if (!q) { results.value = []; return; }
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => {
    searching.value = true;
    try {
      const token = localStorage.getItem('authToken');
      const res = await fetch(`/api/users/search?q=${encodeURIComponent(q)}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const d = await res.json();
        results.value = d.users || [];
      }
    } catch {
      // network error, silently ignore
    } finally {
      searching.value = false;
    }
  }, 300);
}

async function confirmTransfer(targetUser: { id: number; battletag: string }) {
  if (!confirm(`确定将本文作者转让给「${targetUser.battletag}」？此操作不可撤销。`)) return;
  try {
    const token = localStorage.getItem('authToken');
    const res = await fetch(`/api/pages/${props.pageId}/transfer`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ target_user_id: targetUser.id }),
    });
    if (res.ok) {
      const d = await res.json();
      emit('transferred', { newAuthorId: d.new_author_id, newAuthorName: d.new_author_name });
    } else {
      const e = await res.json();
      alert('转让失败: ' + (e.error || ''));
    }
  } catch {
    alert('网络错误');
  }
}
</script>

<style scoped>
.transfer-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,.45);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.transfer-panel {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 24px 28px;
  max-width: 400px;
  width: 90%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.transfer-panel h3 {
  font-size: 18px;
  margin-bottom: 8px;
  text-align: center;
  color: var(--text-primary);
}
.transfer-hint {
  font-size: 13px;
  color: var(--accent);
  margin-bottom: 12px;
  text-align: center;
}
.transfer-search-input {
  width: 100%;
  border: 1px solid var(--input-border);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: inherit;
  background: var(--card-bg);
  color: var(--text-primary);
  outline: none;
  transition: border-color .2s;
  box-sizing: border-box;
}
.transfer-search-input:focus {
  border-color: var(--button-bg);
}
.transfer-loading,
.transfer-empty {
  text-align: center;
  padding: 16px;
  color: var(--accent);
  font-size: 13px;
}
.transfer-results {
  flex: 1;
  overflow-y: auto;
  margin: 8px 0;
  max-height: 240px;
}
.transfer-user-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background .15s;
}
.transfer-user-item:hover {
  background: var(--bg-secondary);
}
.transfer-user-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  object-fit: cover;
}
.transfer-user-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}
.transfer-actions {
  display: flex;
  justify-content: center;
  padding-top: 8px;
  border-top: 1px solid var(--input-border);
}
.transfer-cancel-btn {
  padding: 6px 24px;
  border: 1px solid var(--input-border);
  border-radius: 48px;
  background: transparent;
  color: var(--accent);
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
}
.transfer-cancel-btn:hover {
  border-color: #ef4444;
  color: #ef4444;
}
</style>
