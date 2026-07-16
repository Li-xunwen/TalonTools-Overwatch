<template>
  <div class="join-play news-page">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">黑爪情报局</div>

      <!-- ... template 内容保持不变 ... -->
      <div v-if="loading" class="state-card"><div class="spinner"></div><p class="state-text">加载中…</p></div>
      <div v-else-if="pages.length === 0" class="empty-state"><p>暂无内容</p></div>
      <div v-else class="page-list-wrap">
        <div class="page-list-section">
          <div class="page-grid">
            <div v-for="page in pages" :key="page.id" class="page-card" @click="$router.push('/pages/' + page.id)">
              <span class="card-title">{{ page.title }}</span>
              <div class="card-preview" v-if="page._renderedPreview" v-html="page._renderedPreview"></div>
              <div class="card-preview card-preview-empty" v-else>暂无内容</div>
              <div class="card-meta">
                <img :src="getAvatarUrl(page.author_name)" class="meta-avatar" @error="handleAvatarError" alt="" />
                <span>{{ page.author_name }}</span>
                <span class="meta-dot">·</span>
                <span class="meta-date">{{ formatDate(page.updated_at) }}</span>
              </div>
              <div class="card-actions" @click.stop>
                <button class="card-action-btn" @click="toggleLike(page)">{{ page.is_liked ? '👍' : '👍' }} {{ page._like_count }}</button>
                <button class="card-action-btn" @click="toggleLikeList(page)">👤 {{ page._showLikeList ? '收起' : '赞' }}</button>
                <button class="card-action-btn" @click="toggleComments(page)">💬 {{ page._showComments ? '收起' : '评' }}<span v-if="page._comment_count">({{ page._comment_count }})</span></button>
                <template v-if="isAdmin">
                  <button v-if="page.status !== 2 && page.status !== 3" class="card-action-btn card-action-approve" @click="approvePage(page)">✅ 通过审核</button>
                  <button v-if="page.status === 1 || page.status === 2" class="card-action-btn card-action-draft" @click="draftPage(page)">↩️ 打回草稿</button>
                </template>
              </div>
              <div class="card-expand" @click.stop>
                <div v-if="page._showLikeList" class="expand-box">
                  <div v-if="page._likeUsers.length === 0" class="expand-empty">暂无点赞</div>
                  <div v-for="u in page._likeUsers" :key="u.user_id" class="expand-user-row">
                    <img :src="getAvatarUrl(u.user_name)" class="eu-avatar" @error="handleAvatarError" alt="" />
                    <span>{{ u.user_name }}</span>
                  </div>
                </div>
                <div v-if="page._showComments" class="expand-box">
                  <div v-if="isLoggedIn" class="ci-wrap">
                    <textarea v-model="page._newComment" class="ci-ta" placeholder="写评论…" rows="2" @keydown.ctrl.enter="submitInlineComment(page)"></textarea>
                    <button class="ci-btn" @click="submitInlineComment(page)" :disabled="!page._newComment?.trim()">发送</button>
                  </div>
                  <div v-else class="expand-empty">登录后可评论</div>
                  <div v-if="page._comments.length === 0 && page._commentsLoaded" class="expand-empty">暂无评论</div>
                  <div v-for="c in page._comments" :key="c.id" class="ic-item">
                    <div class="ic-hd">
                      <img :src="getAvatarUrl(c.user_name)" class="ic-avatar" @error="handleAvatarError" alt="" />
                      <span class="ic-author">{{ c.user_name }}</span>
                      <span class="ic-time">{{ formatDate(c.created_at) }}</span>
                    </div>
                    <div class="ic-body">{{ c.content }}</div>
                    <div class="ic-acts">
                      <button class="ic-act" @click="toggleInlineCommentLike(page, c)" :class="{ on: c.is_liked }">{{ c.is_liked ? '👍' : '👍' }} {{ c.like_count }}</button>
                      <button class="ic-act" @click="startInlineReply(page, c, null)">回复</button>
                    </div>
                    <div v-if="c.replies && c.replies.length" class="ic-replies">
                      <div v-for="r in c.replies" :key="r.id" class="ic-reply">
                        <div class="ic-hd">
                          <img :src="getAvatarUrl(r.user_name)" class="ic-avatar" @error="handleAvatarError" alt="" />
                          <span class="ic-author">{{ r.user_name }}</span>
                          <span class="ic-time">{{ formatDate(r.created_at) }}</span>
                        </div>
                        <div class="ic-body"><span v-if="r.reply_to_user_name" class="rto">回复@{{ r.reply_to_user_name }} </span>{{ r.content }}</div>
                        <div class="ic-acts">
                          <button class="ic-act" @click="toggleInlineReplyLike(page, r)" :class="{ on: r.is_liked }">{{ r.is_liked ? '👍' : '👍' }} {{ r.like_count }}</button>
                          <button class="ic-act" @click="startInlineReply(page, c, r)">回复</button>
                        </div>
                      </div>
                    </div>
                    <div v-if="page._replyingToId === c.id" class="ri-wrap">
                      <textarea v-model="page._replyContent" class="ci-ta" :placeholder="'回复 @' + (page._replyingToName||'')" rows="2"></textarea>
                      <div class="ri-acts">
                        <button class="ci-btn" @click="submitInlineReply(page, c)" :disabled="!page._replyContent?.trim()">发送</button>
                        <button class="ci-cancel" @click="cancelInlineReply(page)">取消</button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  <FooterBar />

  <!-- FAB 浮动按钮 -->
  <div :class="['fab-area', { hidden: !fabVisible }]">
    <Transition name="fan">
      <div v-if="showFabMenu" class="fab-items">
        <button class="fab-item" @click.stop="createNewArticle">文章</button>
        <button class="fab-item" @click.stop="showFabMenu = false">视频</button>
        <button class="fab-item" @click.stop="showFabMenu = false">图集</button>
      </div>
    </Transition>
    <button class="fab-btn" @click="showFabMenu = !showFabMenu">
      <span :class="['fab-icon', { open: showFabMenu }]">+</span>
    </button>
  </div>

  <BottomNav />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import ThemeToggle from '@/components/ThemeToggle.vue'
import BottomNav from '@/components/BottomNav.vue'
import FooterBar from '@/components/FooterBar.vue'
import { authFetch } from '@/utils/request'

const isLoggedIn = computed(() => !!localStorage.getItem('authToken'))

interface P {
  id: number; title: string; content_preview: string;
  author_id: number; author_name: string; updated_at: string;
  status: number; like_count: number; is_liked: boolean;
  _renderedPreview: string; _like_count: number; _likeUsers: any[];
  _showLikeList: boolean; _comments: any[]; _commentsLoaded: boolean;
  _showComments: boolean; _newComment: string;
  _replyingToId: number | null; _replyingToName: string; _replyContent: string; _comment_count: number;
}
const loading = ref(true)
const pages = ref<P[]>([])
const isAdmin = ref(false)
const router = useRouter()
const showFabMenu = ref(false)
const fabVisible = ref(true)
const lastScrollY = ref(0)

function onScroll() {
  const sy = window.scrollY
  if (sy <= 0 || sy + window.innerHeight >= document.documentElement.scrollHeight - 10) {
    fabVisible.value = true
  } else {
    fabVisible.value = sy < lastScrollY.value
  }
  lastScrollY.value = sy
}

onMounted(async () => {
  window.addEventListener('scroll', onScroll, { passive: true })
  try {
    const t = localStorage.getItem('authToken')
    if (t) { const p = JSON.parse(atob(t.split('.')[1])); isAdmin.value = p.role === 'ADMIN' }
  } catch {}
  await fetchPages()
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScroll)
})

async function fetchPages() {
  loading.value = true
  try {
    const res = await authFetch('/api/pages')
    if (res.ok) {
      const d = await res.json()
      pages.value = (d.pages || []).map((p: any) => {
        let previewHtml = ''
        if (p.content_preview) {
          try {
            let text = p.content_preview.replace(/^#\s+.+?(?:\n|$)/, '').trim()
            let h = marked.parse(text || ' ', { async: false }) as string
            h = h.replace(/<[^>]+>/g, m => m).substring(0, 1200)
            previewHtml = DOMPurify.sanitize(h)
          } catch { previewHtml = p.content_preview.substring(0, 200) }
        }
        return {
          ...p, _renderedPreview: previewHtml, _like_count: p.like_count, _likeUsers: [],
          _showLikeList: false, _comments: [], _commentsLoaded: false, _showComments: false,
          _newComment: '', _replyingToId: null, _replyingToName: '', _replyContent: '', _comment_count: 0
        }
      })
      // 静默批量拉取评论数
      Promise.all(pages.value.map(p =>
        authFetch(`/api/pages/${p.id}/comments`).then(r => r.ok && r.json().then(d => { const cs = d.comments || []; p._comment_count = cs.length + cs.reduce((s: number, c: any) => s + (c.replies?.length || 0), 0) })).catch(() => {})
      ))
    }
  } catch {}
  finally { loading.value = false }
}

const getAvatarUrl = (n: string) => n ? `/api/users/${encodeURIComponent(n)}/avatar` : ''
function handleAvatarError(e: Event) { const img = e.target as HTMLImageElement; img.src = '/res/imge/default-avatar.png'; img.onerror = null }
const formatDate = (d: string) => { if (!d) return ''; const dt = new Date(d); const pad = (n: number) => String(n).padStart(2, '0'); return `${dt.getFullYear()}.${pad(dt.getMonth() + 1)}.${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}` }

async function approvePage(p: P) {
  if (!confirm(`通过 "${p.title}"？`)) return
  try {
    const r = await authFetch(`/api/pages/${p.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 2 }) })
    if (r.ok) { p.status = 2; alert('已通过') } else { const e = await r.json(); alert(e.error || '失败') }
  } catch { alert('网络错误') }
}

async function toggleLike(p: P) {
  const m = p.is_liked ? 'unlike' : 'like'
  try {
    const r = await authFetch(`/api/pages/${p.id}/${m}`, { method: 'POST' })
    if (r.ok) {
      const d = await r.json(); p.is_liked = !p.is_liked; p._like_count = d.count
      const lr = await authFetch(`/api/pages/${p.id}/likes`)
      if (lr.ok) { const ld = await lr.json(); p._likeUsers = ld.likes || []; p._like_count = ld.count }
    }
  } catch {}
}

async function toggleLikeList(p: P) {
  p._showLikeList = !p._showLikeList
  if (p._showLikeList && !p._likeUsers.length) {
    try { const r = await authFetch(`/api/pages/${p.id}/likes`); if (r.ok) { const d = await r.json(); p._likeUsers = d.likes || [] } } catch {}
  }
}

async function toggleComments(p: P) {
  p._showComments = !p._showComments
  if (p._showComments && !p._commentsLoaded) await loadComments(p)
}

async function loadComments(p: P) {
  try {
    const r = await authFetch(`/api/pages/${p.id}/comments`)
    if (r.ok) { const d = await r.json(); p._comments = d.comments || []; p._comment_count = p._comments.length + p._comments.reduce((s, c) => s + (c.replies?.length || 0), 0) }
    p._commentsLoaded = true
  } catch { p._commentsLoaded = true }
}

async function submitInlineComment(p: P) {
  if (!p._newComment?.trim()) return
  try {
    const r = await authFetch(`/api/pages/${p.id}/comments`, { method: 'POST', body: JSON.stringify({ content: p._newComment.trim() }) })
    if (r.ok) { p._newComment = ''; await loadComments(p) } else { const e = await r.json(); alert(e.error || '评论失败') }
  } catch { alert('网络错误') }
}

function startInlineReply(p: P, c: any, r: any | null) {
  if (p._replyingToId === c.id) { cancelInlineReply(p); return }
  p._replyingToId = c.id; p._replyingToName = r ? r.user_name : c.user_name; p._replyContent = ''
}

function cancelInlineReply(p: P) { p._replyingToId = null; p._replyingToName = ''; p._replyContent = '' }

async function submitInlineReply(p: P, c: any) {
  if (!p._replyContent?.trim() || !p._replyingToId) return
  let rtu = c.user_id
  if (p._replyingToName && p._replyingToName !== c.user_name) {
    const f = c.replies?.find((r: any) => r.user_name === p._replyingToName)
    if (f) rtu = f.user_id
  }
  try {
    const r = await authFetch(`/api/pages/comments/${c.id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ content: p._replyContent.trim(), reply_to_user_id: rtu })
    })
    if (r.ok) { cancelInlineReply(p); await loadComments(p) } else { const e = await r.json(); alert(e.error || '回复失败') }
  } catch { alert('网络错误') }
}

async function toggleInlineCommentLike(p: P, c: any) {
  const m = c.is_liked ? 'unlike' : 'like'
  try { const r = await authFetch(`/api/pages/comments/${c.id}/${m}`, { method: 'POST' }); if (r.ok) { const d = await r.json(); c.is_liked = !c.is_liked; c.like_count = d.count } } catch {}
}

async function draftPage(p: P) {
  if (!confirm(`将 "${p.title}" 打回草稿？`)) return
  try {
    const r = await authFetch(`/api/pages/${p.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 4 }) })
    if (r.ok) { p.status = 4; alert('已打回草稿') } else { const e = await r.json(); alert(e.error || '失败') }
  } catch { alert('网络错误') }
}

function createNewArticle() {
  const template = `# 文章标题\n## 1. 标题\n![图片示例](/resource/user/0/example.jpg)\n## 2. 标题\n![视频示例](/resource/user/0/example.mp4)`
  sessionStorage.setItem('newPageTemplate', template)
  showFabMenu.value = false
  router.push('/pages/new')
}

async function toggleInlineReplyLike(p: P, r: any) {
  const m = r.is_liked ? 'unlike' : 'like'
  try { const res = await authFetch(`/api/pages/comments/${r.id}/${m}`, { method: 'POST' }); if (res.ok) { const d = await res.json(); r.is_liked = !r.is_liked; r.like_count = d.count } } catch {}
}
</script>

<style scoped>
.news-page { min-height: 100vh; position: relative; }
.news-page .content-area { padding-top: 20px; }

.state-card { text-align: center; padding: 80px 24px; }
.spinner { width: 36px; height: 36px; border: 3px solid #e2e8f0; border-top-color: #42b983; border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
.state-text { font-size: 16px; color: #6c757d; }
.empty-state { text-align: center; padding: 80px 24px; color: var(--text-muted); font-size: 16px; }

.top-tip-text {
  font-size: clamp(20px, 5vw, 36px);
  text-align: center;
  padding: 20px 0 10px;
  font-weight: bold;
  color: var(--text-primary);
  background: transparent;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  border-bottom: none;
}

.page-list-wrap { max-width: 540px; margin: 0 auto; padding: 0 12px; }
.page-list-section { background: var(--card-bg); border-radius: 24px; padding: 24px 20px; box-shadow: 0 6px 20px var(--shadow-color); }
.page-grid { display: flex; flex-direction: column; gap: 16px; }

.page-card {
  background: var(--bg-secondary);
  color: var(--text-primary);
  border-radius: 16px;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px;
  cursor: pointer;
}
.page-card:hover { background: var(--input-border); }

/* ===== FAB 浮动菜单 ===== */
.fab-area {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 998;
  display: flex;
  flex-direction: column;
  align-items: center;
  transition: transform 0.3s ease, opacity 0.3s ease;
}
.fab-area.hidden {
  transform: translateX(-50%) translateY(80px);
  opacity: 0;
  pointer-events: none;
}
.fab-btn {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--button-bg);
  color: #fff;
  border: none;
  font-size: 30px;
  font-weight: 300;
  cursor: pointer;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  z-index: 2;
  transition: box-shadow 0.2s;
}
.fab-btn:hover { box-shadow: 0 6px 24px rgba(0, 0, 0, 0.35); }
.fab-icon {
  display: inline-block;
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  line-height: 1;
}
.fab-icon.open { transform: rotate(45deg); }

.fab-items {
  position: absolute;
  bottom: 66px;
  display: flex;
  gap: 12px;
  white-space: nowrap;
}
.fab-item {
  padding: 8px 20px;
  border-radius: 20px;
  border: none;
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 12px var(--shadow-color);
  transition: transform 0.2s;
}
.fab-item:hover { transform: scale(1.08); }
.fab-item:nth-child(1) { transform: translateY(-8px) rotate(-8deg); }
.fab-item:nth-child(2) { transform: translateY(-16px); }
.fab-item:nth-child(3) { transform: translateY(-8px) rotate(8deg); }
.fab-item:nth-child(1):hover { transform: translateY(-8px) rotate(-8deg) scale(1.08); }
.fab-item:nth-child(2):hover { transform: translateY(-16px) scale(1.08); }
.fab-item:nth-child(3):hover { transform: translateY(-8px) rotate(8deg) scale(1.08); }

/* 进出动画 */
.fan-enter-active { transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1); }
.fan-leave-active { transition: all 0.15s ease-in; }
.fan-enter-from { opacity: 0; transform: translateY(10px) scale(0.8); }
.fan-leave-to { opacity: 0; transform: translateY(10px) scale(0.8); }

.card-title {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; font-size: 17px; font-weight: 700;
  color: var(--text-primary); line-height: 1.4; margin-bottom: 6px; flex-shrink: 0;
}
.card-title:hover { opacity: .75; }

.card-preview {
  font-size: 12px; line-height: 1.6; color: var(--accent);
  display: -webkit-box; -webkit-line-clamp: 6; -webkit-box-orient: vertical;
  overflow: hidden; margin: 0 0 10px; word-break: break-word;
}
.card-preview :deep(img), .card-preview :deep(video), .card-preview :deep(table), .card-preview :deep(blockquote) { display: none; }
.card-preview :deep(h1), .card-preview :deep(h2), .card-preview :deep(h3),
.card-preview :deep(h4), .card-preview :deep(h5), .card-preview :deep(h6) {
  font-size: inherit; font-weight: 600; margin: 4px 0; border: none; padding: 0;
}
.card-preview-empty { opacity: 0.5; }
.card-preview :deep(p) { margin-bottom: 4px; }
.card-preview :deep(a) { color: var(--button-bg); }
.card-preview :deep(code) { background: var(--bg-secondary); padding: 1px 4px; border-radius: 4px; font-size: 11px; }

.card-meta { display: flex; align-items: center; gap: 4px; font-size: 12px; color: var(--accent); flex-shrink: 0; margin-bottom: 8px; }
.meta-avatar { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; }
.meta-dot { opacity: 0.5; }
.meta-date { font-size: 11px; }

.card-actions { display: flex; gap: 4px; flex-wrap: wrap; flex-shrink: 0; margin-bottom: 6px; }
.card-action-btn {
  background: var(--card-bg); border: 1px solid var(--input-border);
  color: var(--text-primary); border-radius: 48px; padding: 3px 10px;
  font-size: 12px; cursor: pointer; transition: all .2s; white-space: nowrap;
}
.card-action-btn:hover { border-color: var(--button-bg); color: var(--button-bg); }
.card-action-approve { border-color: #16a34a; color: #16a34a; }
.card-action-approve:hover { background: #f0fdf4; }
.card-action-draft { border-color: #f59e0b; color: #f59e0b; }
.card-action-draft:hover { background: #fffbeb; }

.card-expand { flex: 1; overflow-y: auto; min-height: 0; }
.card-expand::-webkit-scrollbar { width: 3px; }
.card-expand::-webkit-scrollbar-thumb { background: rgba(255,255,255,.3); border-radius: 3px; }

.expand-box { background: var(--bg-secondary); border-radius: 10px; padding: 6px 8px; margin-bottom: 4px; }
.expand-empty { text-align: center; font-size: 12px; color: var(--accent); padding: 6px; }
.expand-user-row { display: flex; align-items: center; gap: 6px; padding: 3px 0; font-size: 12px; color: var(--text-primary); }
.eu-avatar { width: 20px; height: 20px; border-radius: 50%; object-fit: cover; }

.ci-wrap { margin-bottom: 4px; }
.ci-ta {
  width: 100%; border: 1px solid var(--input-border); border-radius: 8px;
  padding: 6px 8px; font-size: 12px; font-family: inherit;
  background: var(--card-bg); color: var(--text-primary); resize: none; outline: none;
  transition: border-color .2s; box-sizing: border-box;
}
.ci-ta::placeholder { color: var(--accent); }
.ci-ta:focus { border-color: var(--button-bg); }
.ci-btn {
  margin-top: 4px; padding: 4px 14px; border: none; border-radius: 48px;
  background: var(--button-bg); color: #fff; font-size: 12px; font-weight: 600;
  cursor: pointer; transition: background .2s;
}
.ci-btn:disabled { opacity: .5; cursor: not-allowed; }
.ci-btn:hover:not(:disabled) { background: #2c6e4f; }

.ic-item { padding: 5px 0; border-bottom: 1px solid var(--input-border); }
.ic-item:last-child { border-bottom: none; }
.ic-hd { display: flex; align-items: center; gap: 4px; margin-bottom: 2px; }
.ic-avatar { width: 16px; height: 16px; border-radius: 50%; object-fit: cover; }
.ic-author { font-weight: 600; font-size: 12px; color: var(--text-primary); }
.ic-time { font-size: 10px; color: var(--accent); margin-left: auto; }
.ic-body { font-size: 12px; line-height: 1.4; color: var(--text-primary); margin-bottom: 2px; word-break: break-word; }
.rto { color: var(--button-bg); font-weight: 500; }
.ic-acts { display: flex; gap: 4px; }
.ic-act { background: none; border: none; font-size: 12px; color: var(--accent); cursor: pointer; padding: 1px 4px; border-radius: 4px; }
.ic-act:hover { color: var(--button-bg); background: rgba(66,185,131,.08); }
.ic-act.on { color: var(--button-bg); }
.ic-replies { margin-top: 4px; margin-left: 6px; padding-left: 6px; border-left: 2px solid var(--input-border); }
.ic-reply { padding: 4px 0; border-bottom: 1px solid var(--input-border); }
.ic-reply:last-child { border-bottom: none; }
.ri-wrap { margin-top: 4px; padding-top: 4px; border-top: 1px dashed var(--input-border); }
.ri-acts { display: flex; gap: 4px; align-items: center; margin-top: 2px; }
.ci-cancel { padding: 4px 10px; border: 1px solid var(--input-border); border-radius: 48px; background: transparent; color: var(--accent); font-size: 12px; cursor: pointer; }
.ci-cancel:hover { border-color: #ef4444; color: #ef4444; }

@media (max-width: 760px) {
  .page-grid { gap: 14px; padding: 0 8px; }
  .page-card { padding: 14px 12px 10px; }
  .card-title { font-size: 15px; }
}

html[data-theme="dark"] .page-card { background: #162032; }
html[data-theme="dark"] .page-card:hover { background: #1a2539; }
</style>
