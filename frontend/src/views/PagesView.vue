<template>
    <div class="page-view">
        <ThemeToggle class="theme-toggle" />

        <div class="container" v-if="loading">
            <div class="state-card"><div class="spinner"></div><p class="state-text">页面加载中...</p></div>
        </div>

        <div class="container" v-else-if="error">
            <div class="state-card error-card">
                <span class="state-icon">⚠️</span><p class="state-text">{{ error }}</p>
                <button v-if="isAuthError" class="btn-retry" @click="$router.push('/')">返回登录</button>
                <button v-else class="btn-retry" @click="fetchPage">重试</button>
            </div>
        </div>

        <!-- 阅读模式 -->
        <div class="container" v-else-if="pageData && !isEditing">
            <div class="top-nav-bar">
                <a href="javascript:void(0)" @click="$router.back()" class="nav-link back-prev">← 返回上一页</a>
                <button v-if="isAuthor" class="nav-link btn-edit" @click="enterEditMode">✏️ 编辑</button>
                <router-link to="/main" class="nav-link back-home">返回首页 →</router-link>
            </div>
            <h1 class="title">{{ pageData.title }}</h1>
            <div class="meta-info">
                <span class="meta-author">
                    <img :src="getAvatarUrl(pageData.author_name)" class="meta-avatar" @error="handleAvatarError" alt="" />
                    {{ pageData.author_name }}
                </span>
                <span class="meta-sep">|</span>
                <span class="meta-date">📅 {{ formatDate(pageData.updated_at) }}</span>
                <template v-if="pageData.status !== 3">
                    <span class="meta-sep">|</span>
                    <span :class="['status-badge', 'status-' + pageData.status]">{{ statusLabel(pageData.status) }}</span>
                </template>
            </div>
            <!-- 点赞/评论按钮栏 -->
            <div class="page-interaction-bar">
                <button class="interact-btn" @click="togglePageLike">
                    <span class="like-icon">{{ pageLiked ? '👍' : '👍' }}</span>
                    <span class="interact-label">赞</span>
                    <span class="interact-count">{{ pageLikeCount }}</span>
                </button>
                <button class="interact-btn" @click="toggleLikeList">
                    <span class="interact-label">点赞列表</span>
                </button>
                <button class="interact-btn" @click="scrollToComments">
                    <span>💬</span>
                    <span class="interact-label">评论</span>
                </button>
            </div>
            <div class="markdown-body" v-html="renderedContent"></div>

            <!-- 评论区 -->
            <div class="comments-section" ref="commentsRef">
                <h2 class="comments-title">评论</h2>

                <!-- 评论输入框 -->
                <div v-if="isLoggedIn" class="comment-input-area">
                    <textarea v-model="newComment" class="comment-textarea" placeholder="写评论..." rows="3"></textarea>
                    <button class="comment-submit-btn" @click="submitComment" :disabled="!newComment.trim()">发送</button>
                </div>
                <div v-else class="comment-login-hint">登录后即可发表评论</div>

                <!-- 评论列表 -->
                <div v-if="comments.length === 0 && commentsLoaded" class="comment-empty">暂无评论</div>
                <div v-for="comment in comments" :key="comment.id" class="comment-item">
                    <div class="comment-header">
                        <img :src="getAvatarByName(comment.user_name)" class="comment-avatar" @error="handleAvatarError" alt="" />
                        <span class="comment-author">{{ comment.user_name }}</span>
                        <span class="comment-time">{{ formatDate(comment.created_at) }}</span>
                    </div>
                    <div class="comment-body">{{ comment.content }}</div>
                    <div class="comment-actions">
                        <button class="comment-action-btn" @click="toggleCommentLike(comment)" :class="{ liked: comment.is_liked }">
                            {{ comment.is_liked ? '👍' : '👍' }} {{ comment.like_count }}
                        </button>
                        <button class="comment-action-btn" @click="startReply(comment, null)">回复</button>
                    </div>

                    <!-- 回复列表 -->
                    <div v-if="comment.replies.length > 0" class="replies-wrap">
                        <div v-for="reply in comment.replies" :key="reply.id" class="reply-item">
                            <div class="comment-header">
                                <img :src="getAvatarByName(reply.user_name)" class="comment-avatar" @error="handleAvatarError" alt="" />
                                <span class="comment-author">{{ reply.user_name }}</span>
                                <span class="comment-time">{{ formatDate(reply.created_at) }}</span>
                            </div>
                            <div class="comment-body">
                                <span class="reply-to-label" v-if="reply.reply_to_user_name">回复@{{ reply.reply_to_user_name }} </span>
                                {{ reply.content }}
                            </div>
                            <div class="comment-actions">
                                <button class="comment-action-btn" @click="toggleReplyLike(reply)" :class="{ liked: reply.is_liked }">
                                    {{ reply.is_liked ? '👍' : '👍' }} {{ reply.like_count }}
                                </button>
                                <button class="comment-action-btn" @click="startReply(comment, reply)">回复</button>
                            </div>
                        </div>
                    </div>

                    <!-- 回复输入框 -->
                    <div v-if="replyingToId === comment.id" class="reply-input-area">
                        <textarea v-model="replyContent" class="comment-textarea" :placeholder="'回复 @' + (replyingToName || '')" rows="2"></textarea>
                        <div class="reply-input-actions">
                            <button class="comment-submit-btn" @click="submitReply(comment)" :disabled="!replyContent.trim()">发送</button>
                            <button class="comment-cancel-btn" @click="cancelReply">取消</button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 赞列表浮层 -->
            <div v-if="showLikeList" class="like-list-overlay" @click="showLikeList = false">
                <div class="like-list-panel" @click.stop>
                    <h3>点赞列表</h3>
                    <div v-if="likeUsers.length === 0" class="like-list-empty">暂无点赞</div>
                    <div v-for="u in likeUsers" :key="u.user_id" class="like-user-item">
                        <img :src="getAvatarByName(u.user_name)" class="like-user-avatar" @error="handleAvatarError" alt="" />
                        <span>{{ u.user_name }}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 编辑模式 -->
        <div class="container container-edit" v-else-if="pageData && isEditing">
            <div class="top-nav-bar edit-nav-bar">
                <a href="javascript:void(0)" @click="confirmDiscard" class="nav-link back-prev">← 返回</a>
                <a href="/main" class="nav-link back-home" @click.prevent="$router.push('/main')">返回首页 →</a>
            </div>
            <div class="edit-action-bar">
                <button class="act-btn act-submit" @click="submitForReview" :disabled="saving">{{ saving ? '提交中...' : '提交审核' }}</button>
                <button class="act-btn act-draft" @click="saveAsDraft" :disabled="saving">{{ saving ? '保存中...' : '转为草稿' }}</button>
                <button class="act-btn act-discard" @click="confirmDiscard">撤销修改</button>
            </div>

            <div class="edit-title-row">
                <input v-model="editTitle" class="edit-title-input" placeholder="页面标题" @input="onTitleChange" />
                <div class="title-preview" v-if="editTitle.trim()" v-html="renderedTitlePreview"></div>
            </div>

            <div class="edit-sections">
                <div v-for="(section, idx) in editSections" :key="section.id" class="edit-section-wrapper">
                    <button v-if="idx > 0" class="btn-insert-section" @click="addSection(idx)">+ 插入段落</button>
                    <div v-if="!section.heading" class="edit-preamble">
                        <textarea v-model="section.content" class="edit-textarea" rows="4" @input="onSectionChange(idx)" @keydown.ctrl.z.prevent="onUndo(idx)" @beforeinput="onSectionBeforeInput(idx)" />
                    </div>
                    <div v-else class="edit-section">
                        <div class="edit-heading-row">
                            <span class="edit-heading-prefix">##</span>
                            <input v-model="section.heading" class="edit-heading-input" placeholder="段落标题" @input="onSectionChange(idx)" />
                            <button class="btn-icon" @click="onUndo(idx)" title="撤销">↩️</button>
                            <button class="btn-icon btn-danger" @click="removeSection(idx)" title="删除段落">🗑️</button>
                        </div>
                        <div class="edit-toolbar" v-if="editingSectionIdx === idx">
                            <button class="tb-btn" @click="wrapText(idx, '**', '**')"><b>B</b></button>
                            <button class="tb-btn" @click="wrapText(idx, '*', '*')"><i>I</i></button>
                            <button class="tb-btn" @click="wrapText(idx, '`', '`')">代码</button>
                            <button class="tb-btn" @click="insertLink(idx)">🔗 链接</button>
                            <button class="tb-btn" @click="insertImage(idx)">🖼️ 图片</button>
                            <button class="tb-btn tb-sep" @click="editingSectionIdx = -1">✓ 完成</button>
                        </div>
                        <div class="edit-content-wrap">
                            <textarea v-model="section.content" class="edit-textarea"
                                :class="{ 'edit-focused': editingSectionIdx === idx }"
                                rows="6" placeholder="正文(Markdown 格式)"
                                @focus="editingSectionIdx = idx"
                                @input="onSectionChange(idx)"
                                @keydown.ctrl.z.prevent="onUndo(idx)"
                                @beforeinput="onSectionBeforeInput(idx)" />
                            <!-- 实时预览 -->
                            <div v-if="section.content.trim()" class="live-preview" v-html="renderPreview(section.content)"></div>
                            <button v-if="editingSectionIdx !== idx" class="btn-edit-float" @click="editingSectionIdx = idx">✏️</button>
                        </div>
                    </div>
                </div>
                <button class="btn-insert-section" @click="addSection(editSections.length)">+ 插入段落</button>
            </div>
        </div>

        <div class="back-link" v-if="pageData && !loading && !isEditing"><a href="#" @click.prevent="scrollToTop">🔝 回到最顶上</a></div>
        <div class="footer-beian">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ icpNumber }}</a>
            <span class="sep">|</span>
            <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">{{ policeNumber }}</a>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue';
import { useRoute } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ThemeToggle from '@/components/ThemeToggle.vue';
import { authFetch } from '@/utils/request';
import {
    PageSection, parseSections, mergeSections,
    insertSection, removeSection as removeSectionUtil,
    undoSection,
    loadEditCache, saveEditCache, clearEditCache, isCacheStale,
} from '@/utils/pageEditor';

// Markdown 图片链接指向视频文件时,转成 <video> 标签
function imgToVideo(html: string): string {
    return html.replace(
        /<img\s+[^>]*?src="([^"]+\.(mp4|webm|ogv|mov))"[^>]*>/gi,
        (_match, src: string, ext: string) => {
            const typeMap: Record<string, string> = {
                mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime',
            };
            return `<video controls preload="metadata" playsinline width="100%"><source src="${src}" type="${typeMap[ext.toLowerCase()] || 'video/mp4'}"></video>`;
        }
    );
}

const VIDEO_ALLOW = {
    ADD_TAGS: ['img', 'video', 'source'],
    ADD_ATTR: ['target', 'rel', 'controls', 'preload', 'playsinline', 'type', 'src', 'width'],
};

const route = useRoute();
const loading = ref(true);
const error = ref('');
const isAuthError = ref(false);
const pageData = ref<any>(null);
const isEditing = ref(false);
const isAuthor = ref(false);
const editTitle = ref('');
const editSections = ref<PageSection[]>([]);
const editingSectionIdx = ref(-1);
const saving = ref(false);

// ===== 点赞 / 评论 状态 =====
const pageLikeCount = ref(0);
const pageLiked = ref(false);
const likeUsers = ref<{ user_id: number; user_name: string }[]>([]);
const showLikeList = ref(false);
const comments = ref<PageComment[]>([]);
const commentsLoaded = ref(false);
const newComment = ref('');
const replyContent = ref('');
const replyingToId = ref<number | null>(null);
const replyingToName = ref('');
const commentsRef = ref<HTMLElement | null>(null);

interface LikeUser {
    user_id: number;
    user_name: string;
}
interface CommentReply {
    id: number; parent_id: number; root_id: number;
    user_id: number; user_name: string;
    content: string;
    reply_to_user_id: number | null; reply_to_user_name: string | null;
    reply_to_content: string | null;
    like_count: number; is_liked: boolean; created_at: string;
}
interface PageComment extends CommentReply {
    replies: CommentReply[];
}

const icpNumber = import.meta.env.VITE_ICP_NUMBER || '沪ICP备备2026XXXX号';
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || '沪公网安备 3101150200XXXX号';

const renderedContent = computed(() => {
    if (!pageData.value?.content) return '';
    let html = marked.parse(pageData.value.content, { async: false, breaks: true }) as string;
    // 移除第一个 <h1>(标题已在外部 .title 渲染,避免重复)
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
    html = imgToVideo(html);
    html = html.replace(/<h2/g, '</div><div class="markdown-section"><h2');
    html = html.replace(/^<\/div><div class="markdown-section"><h2/, '<div class="markdown-section"><h2');
    if (/markdown-section/.test(html)) html += '</div>';
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
});

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const getAvatarUrl = (name: string) => name ? `/api/users/${encodeURIComponent(name)}/avatar` : '';
function getAvatarByName(name: string) { return getAvatarUrl(name); }
function handleAvatarError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.src = '/res/imge/default-avatar.png';
    img.onerror = null;
}

const isLoggedIn = computed(() => !!localStorage.getItem('authToken'));

const statusLabel = (s: number): string => ({ 0: '已删除', 1: '审核中', 2: '已发布', 3: '完全开放', 4: '草稿' })[s] || '未知';

// 总标题所见所得预览
const renderedTitlePreview = computed(() => {
    if (!editTitle.value.trim()) return '';
    const html = marked.parse(`# ${editTitle.value}`, { async: false }) as string;
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
});

const renderPreview = (md: string): string => {
    if (!md) return '';
    // breaks: true — 单换行按 <br> 渲染，所见即所得
    let html = marked.parse(md, { async: false, breaks: true }) as string;
    html = imgToVideo(html);
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
};

async function fetchPage() {
    const id = route.params.id;
    if (!id) { error.value = '页面不存在'; loading.value = false; return; }
    loading.value = true; error.value = ''; isAuthError.value = false; pageData.value = null;
    try {
        const res = await authFetch(`/api/pages/${id}`);
        if (res.status === 404) { error.value = '页面不存在'; return; }
        if (res.status === 401) { error.value = '请先登录后再查看此页面'; isAuthError.value = true; return; }
        if (res.status === 403) { error.value = '你没有权限查看此页面'; return; }
        if (!res.ok) { error.value = '加载失败,请稍后重试'; return; }
        pageData.value = await res.json();
        document.title = pageData.value.title;
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                const p = JSON.parse(atob(token.split('.')[1]));
                isAuthor.value = p.userId === pageData.value.author_id || p.role === 'ADMIN';
            }
        } catch {}
        // 页面加载成功后获取点赞和评论数据
        fetchLikes();
        fetchComments();
    } catch { error.value = '网络错误,请检查网络连接后重试'; }
    finally { loading.value = false; }
}

function getUserId(): number | null {
    try {
        const t = localStorage.getItem('authToken');
        return t ? JSON.parse(atob(t.split('.')[1])).userId : null;
    } catch { return null; }
}

function enterEditMode() {
    editTitle.value = pageData.value.title;
    const uid = getUserId();
    if (uid) {
        const cache = loadEditCache(pageData.value.id, uid);
        if (cache && !isCacheStale(cache, pageData.value.updated_at)) {
            if (confirm('检测到未保存的编辑,是否恢复?')) {
                editSections.value = cache.sections;
                try {
                    const t = localStorage.getItem(`talon_page_title_${pageData.value.id}_${uid}`);
                    if (t !== null) editTitle.value = t;
                } catch {}
                isEditing.value = true;
                return;
            } else {
                clearEditCache(pageData.value.id, uid);
            }
        }
    }
    // 从内容提取第一个 # 一级标题作为总标题,并从 sections 中移除
    const titleMatch = pageData.value.content.match(/^#\s+(.+?)(?:\n|$)/);
    let content = pageData.value.content;
    if (titleMatch) {
        editTitle.value = titleMatch[1].trim();
        content = content.replace(/^#\s+.+?(?:\n|$)/, '').trim();
    }
    editSections.value = parseSections(content);
    isEditing.value = true;
    window.scrollTo({ top: 0 });
}

const MAX_HISTORY = 50;

function onSectionBeforeInput(idx: number) {
    const section = editSections.value[idx];
    if (!section) return;
    const hist = [...section.history];
    hist.push(section.content);
    if (hist.length > MAX_HISTORY) hist.shift();
    section.history = hist;
}

function onSectionChange(idx: number) { saveToLocal(); }
function addSection(index: number) { editSections.value = insertSection(editSections.value, index); saveToLocal(); }
function removeSection(index: number) {
    if (!confirm('确定删除此段落?')) return;
    editSections.value = removeSectionUtil(editSections.value, index); saveToLocal();
}
function onUndo(idx: number) {
    const section = editSections.value[idx];
    if (!section) return;
    const prev = undoSection(section);
    if (prev) {
        const c = [...editSections.value];
        c[idx] = prev;
        editSections.value = c;
        saveToLocal();
    }
}

function wrapText(idx: number, before: string, after: string) {
    const ta = document.querySelectorAll('.edit-textarea')[idx] as HTMLTextAreaElement;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    const t = editSections.value[idx].content;
    editSections.value[idx].content = t.slice(0, s) + before + t.slice(s, e) + after + t.slice(e);
    saveToLocal();
    requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(s + before.length, e + before.length); });
}
function insertLink(idx: number) {
    const url = prompt('输入链接地址:', 'https://'); if (url) wrapText(idx, '[', `](${url})`);
}
function insertImage(idx: number) {
    const url = prompt('输入图片地址:', '/resource/users/'); if (!url) return;
    editSections.value[idx].content += `\n![${prompt('输入图片描述:', '图片') || '图片'}](${url})`; saveToLocal();
}

// 总标题变更时刷新所见所得预览
function onTitleChange() { saveToLocal(); }

// 构建完整 Markdown 内容:总标题 + 各段落
function buildContent(): string {
    const merged = mergeSections(editSections.value);
    const t = editTitle.value.trim();
    return t ? `# ${t}\n\n${merged}` : merged;
}

function saveToLocal() {
    const uid = getUserId(); if (!uid || !pageData.value) return;
    saveEditCache({ pageId: pageData.value.id, sections: editSections.value, savedAt: Date.now(), userId: uid, originalUpdatedAt: pageData.value.updated_at });
    try { localStorage.setItem(`talon_page_title_${pageData.value.id}_${uid}`, editTitle.value); } catch {}
}
function clearCache() {
    const uid = getUserId();
    if (uid && pageData.value) {
        clearEditCache(pageData.value.id, uid);
        try { localStorage.removeItem(`talon_page_title_${pageData.value.id}_${uid}`); } catch {}
    }
}

async function submitForReview() {
    if (!confirm('提交后页面将进入审核状态,确定提交?')) return;
    saving.value = true;
    try {
        const content = buildContent();
        const sr = await authFetch(`/api/pages/${pageData.value.id}`, { method: 'PUT', body: JSON.stringify({ title: editTitle.value, content }) });
        if (!sr.ok) { const e = await sr.json(); alert('保存失败:' + (e.error || '')); return; }
        const st = await authFetch(`/api/pages/${pageData.value.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 1 }) });
        if (!st.ok) { alert('状态更新失败'); return; }
        clearCache(); await fetchPage(); isEditing.value = false; alert('已提交审核');
    } finally { saving.value = false; }
}

async function saveAsDraft() {
    saving.value = true;
    try {
        const content = buildContent();
        const sr = await authFetch(`/api/pages/${pageData.value.id}`, { method: 'PUT', body: JSON.stringify({ title: editTitle.value, content }) });
        if (!sr.ok) { const e = await sr.json(); alert('保存失败:' + (e.error || '')); return; }
        const st = await authFetch(`/api/pages/${pageData.value.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 4 }) });
        if (!st.ok) { alert('状态更新失败'); return; }
        clearCache(); await fetchPage(); isEditing.value = false; alert('已保存为草稿');
    } finally { saving.value = false; }
}

function confirmDiscard() { if (!confirm('存在未提交的修改')) return; clearCache(); isEditing.value = false; editingSectionIdx.value = -1; }

// ========== 点赞 / 评论 API 调用 ==========

async function fetchLikes() {
    if (!pageData.value) return;
    try {
        const res = await authFetch(`/api/pages/${pageData.value.id}/likes`);
        if (res.ok) {
            const data = await res.json();
            pageLikeCount.value = data.count;
            pageLiked.value = data.is_liked;
            likeUsers.value = data.likes || [];
        }
    } catch {}
}

async function togglePageLike() {
    if (!pageData.value) return;
    try {
        if (pageLiked.value) {
            const res = await authFetch(`/api/pages/${pageData.value.id}/unlike`, { method: 'POST' });
            if (res.ok) { const d = await res.json(); pageLikeCount.value = d.count; pageLiked.value = false; }
        } else {
            const res = await authFetch(`/api/pages/${pageData.value.id}/like`, { method: 'POST' });
            if (res.ok) { const d = await res.json(); pageLikeCount.value = d.count; pageLiked.value = true; }
        }
        fetchLikes();
    } catch {}
}

function toggleLikeList() { showLikeList.value = !showLikeList.value; }

function scrollToComments() {
    if (commentsRef.value) {
        commentsRef.value.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

async function fetchComments() {
    if (!pageData.value) return;
    try {
        const res = await authFetch(`/api/pages/${pageData.value.id}/comments`);
        if (res.ok) {
            const data = await res.json();
            comments.value = data.comments || [];
        }
        commentsLoaded.value = true;
    } catch { commentsLoaded.value = true; }
}

async function submitComment() {
    if (!pageData.value || !newComment.value.trim()) return;
    try {
        const res = await authFetch(`/api/pages/${pageData.value.id}/comments`, {
            method: 'POST',
            body: JSON.stringify({ content: newComment.value.trim() }),
        });
        if (res.ok) {
            newComment.value = '';
            fetchComments();
        } else {
            const e = await res.json();
            alert(e.error || '评论失败');
        }
    } catch { alert('网络错误'); }
}

function startReply(comment: PageComment, reply: CommentReply | null) {
    if (replyingToId.value === comment.id) { cancelReply(); return; }
    replyingToId.value = comment.id;
    replyingToName.value = reply ? reply.user_name : comment.user_name;
    replyContent.value = '';
    nextTick(() => {
        document.querySelector('.reply-input-area textarea')?.focus();
    });
}

function cancelReply() {
    replyingToId.value = null;
    replyingToName.value = '';
    replyContent.value = '';
}

async function submitReply(comment: PageComment) {
    if (!replyContent.value.trim() || !replyingToId.value) return;
    // 查找被回复 user_id
    let replyToUserId = comment.user_id;
    if (replyingToName.value && replyingToName.value !== comment.user_name) {
        const found = comment.replies.find(r => r.user_name === replyingToName.value);
        if (found) replyToUserId = found.user_id;
    }
    try {
        const res = await authFetch(`/api/pages/comments/${comment.id}/reply`, {
            method: 'POST',
            body: JSON.stringify({ content: replyContent.value.trim(), reply_to_user_id: replyToUserId }),
        });
        if (res.ok) {
            cancelReply();
            fetchComments();
        } else {
            const e = await res.json();
            alert(e.error || '回复失败');
        }
    } catch { alert('网络错误'); }
}

async function toggleCommentLike(comment: PageComment) {
    try {
        if (comment.is_liked) {
            const res = await authFetch(`/api/pages/comments/${comment.id}/unlike`, { method: 'POST' });
            if (res.ok) { const d = await res.json(); comment.like_count = d.count; comment.is_liked = false; }
        } else {
            const res = await authFetch(`/api/pages/comments/${comment.id}/like`, { method: 'POST' });
            if (res.ok) { const d = await res.json(); comment.like_count = d.count; comment.is_liked = true; }
        }
    } catch {}
}

async function toggleReplyLike(reply: CommentReply) {
    try {
        if (reply.is_liked) {
            const res = await authFetch(`/api/pages/comments/${reply.id}/unlike`, { method: 'POST' });
            if (res.ok) { const d = await res.json(); reply.like_count = d.count; reply.is_liked = false; }
        } else {
            const res = await authFetch(`/api/pages/comments/${reply.id}/like`, { method: 'POST' });
            if (res.ok) { const d = await res.json(); reply.like_count = d.count; reply.is_liked = true; }
        }
    } catch {}
}

onMounted(() => { fetchPage(); });
</script>

<style scoped>
* { box-sizing: border-box; }
.page-view { min-height: 100vh; background: var(--bg-color, #f5f7fa); padding: 40px 20px 100px; position: relative; }
.theme-toggle { position: fixed; top: 20px; right: 20px; z-index: 100; }
.container { max-width: 900px; margin: 0 auto; background: var(--card-bg, #ffffff); border-radius: 24px; box-shadow: var(--shadow, 0 20px 35px -10px rgba(0,0,0,0.1)); padding: 40px 32px; }
.container-edit { padding: 28px 20px; }
.container-edit .edit-section { padding: 16px 18px; }
.container-edit .edit-preamble { padding: 12px 14px; }
.container-edit .edit-textarea { padding: 10px 12px; }
.container-edit .live-preview { padding: 10px 12px; }
.state-card { text-align: center; padding: 64px 24px; }
.state-icon { font-size: 48px; display: block; margin-bottom: 16px; }
.state-text { font-size: 16px; color: var(--text-secondary, #6c757d); margin-bottom: 20px; }
.btn-retry { padding: 8px 28px; border: 1px solid var(--button-bg, #42b983); background: transparent; color: var(--button-bg, #42b983); border-radius: 48px; font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-retry:hover { background: var(--button-bg, #42b983); color: #fff; }
.spinner { width: 36px; height: 36px; border: 3px solid var(--input-border, #e2e8f0); border-top-color: var(--button-bg, #42b983); border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
.top-nav-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--input-border, #e2e8f0); }
.nav-link { font-size: 14px; font-weight: 600; text-decoration: none; transition: opacity .2s; cursor: pointer; background: none; border: none; }
.nav-link.back-prev { color: var(--text-secondary, #6c757d); }
.nav-link.back-home { color: var(--button-bg, #42b983); }
.nav-link:hover { opacity: .7; text-decoration: underline; }
.btn-edit { color: var(--button-bg, #42b983); font-size: 14px; padding: 4px 14px; border: 1px solid var(--button-bg, #42b983); border-radius: 48px; }
.btn-edit:hover { background: var(--button-bg, #42b983); color: #fff; text-decoration: none; }
.edit-nav-bar { display: flex; justify-content: space-between; align-items: center; }
.edit-action-bar { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 16px 0 24px; }
.act-btn { padding: 6px 16px; border-radius: 48px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all .2s; }
.act-btn:disabled { opacity: .5; cursor: not-allowed; }
.act-submit { background: var(--button-bg, #42b983); color: #fff; }
.act-submit:hover:not(:disabled) { background: #2c6e4f; }
.act-draft { border-color: var(--button-bg, #42b983); color: var(--button-bg, #42b983); background: transparent; }
.act-draft:hover:not(:disabled) { background: rgba(66,185,131,.08); }
.act-discard { border-color: #ef4444; color: #ef4444; background: transparent; }
.act-discard:hover:not(:disabled) { background: #fef2f2; }
.title { text-align: center; font-size: 28px; font-weight: 700; background: linear-gradient(135deg,var(--text-primary,#1f2d3d) 0%,var(--button-bg,#42b983) 100%); background-clip: text; -webkit-background-clip: text; color: transparent; margin-bottom: 12px; }
.meta-info { text-align: center; font-size: 14px; color: var(--text-secondary, #6c757d); margin-bottom: 32px; border-bottom: 1px solid var(--input-border, #e2e8f0); padding-bottom: 16px; }
.meta-author { display: inline; }
.meta-avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; vertical-align: -3px; display: inline-block; }
.meta-sep { margin: 0 10px; color: var(--text-muted, #adb5bd); }
.status-badge { display: inline-block; padding: 2px 10px; border-radius: 24px; font-size: 12px; font-weight: 600; }
.status-0 { background: #fee2e2; color: #dc2626; }
.status-1 { background: #fef9c3; color: #a16207; }
.status-2 { background: #dcfce7; color: #16a34a; }
.status-4 { background: #e0e7ff; color: #4338ca; }
.markdown-body { font-size: 15px; line-height: 1.75; color: var(--text-primary, #1f2d3d); }
.markdown-body :deep(h1), .markdown-body :deep(h3), .markdown-body :deep(h4) { font-weight: 600; color: var(--text-primary, #1f2d3d); margin-top: 32px; margin-bottom: 16px; padding-left: 12px; border-left: 5px solid var(--button-bg, #42b983); }
.markdown-body :deep(h2) { font-size: 22px; font-weight: 600; color: var(--text-primary, #1f2d3d); margin-top: 0; margin-bottom: 18px; padding: 0 0 0 12px; border-left: 5px solid var(--button-bg, #42b983); }
.markdown-body :deep(p) { margin-bottom: 12px; color: var(--text-secondary, #4b5563); line-height: 1.65; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 24px; margin: 12px 0; }
.markdown-body :deep(li) { margin-bottom: 10px; }
.markdown-body :deep(a) { color: var(--button-bg, #42b983); text-decoration: none; font-weight: 500; }
.markdown-body :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border-radius: 8px;
    box-shadow: 0 6px 14px rgba(0,0,0,.08);
    object-fit: scale-down;
}
.markdown-body :deep(video) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border-radius: 8px;
    box-shadow: 0 6px 14px rgba(0,0,0,.08);
}
.markdown-body :deep(blockquote) { margin: 16px 0; padding: 12px 20px; background: var(--code-bg, #f1f5f9); border-left: 4px solid var(--button-bg, #42b983); border-radius: 8px; }
.markdown-body :deep(code) { background: var(--code-bg, #f1f5f9); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.markdown-body :deep(pre) { background: var(--code-bg, #f1f5f9); padding: 16px 20px; border-radius: 16px; overflow-x: auto; }
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; }
.markdown-body :deep(th), .markdown-body :deep(td) { padding: 10px 14px; border: 1px solid var(--input-border, #e2e8f0); text-align: left; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--input-border, #e2e8f0); margin: 28px 0; }
.edit-title-row { margin-bottom: 24px; }
.edit-title-input { width: 100%; font-size: 24px; font-weight: 700; border: none; border-bottom: 2px solid var(--input-border, #e2e8f0); padding: 8px 4px; background: transparent; color: var(--text-primary, #1f2d3d); outline: none; }
.edit-title-input:focus { border-bottom-color: var(--button-bg, #42b983); }
/* 总标题所见所得预览 */
.title-preview { margin-top: 12px; padding: 4px 0; }
.title-preview :deep(h1) {
    font-size: 26px;
    font-weight: 700;
    text-align: center;
    margin: 0;
    padding: 0;
    border: none;
    background: linear-gradient(135deg,var(--text-primary,#1f2d3d) 0%,var(--button-bg,#42b983) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
}
.edit-sections { margin-bottom: 24px; }
.edit-section-wrapper { margin-bottom: 0; }
.btn-insert-section { width: 100%; padding: 10px; margin: 8px 0; border: 2px dashed var(--input-border, #e2e8f0); border-radius: 12px; background: transparent; color: var(--text-muted, #adb5bd); font-size: 14px; cursor: pointer; transition: all .2s; }
.btn-insert-section:hover { border-color: var(--button-bg, #42b983); color: var(--button-bg, #42b983); background: rgba(66,185,131,.05); }
.edit-section { background: var(--bg-secondary, #f8f9fa); border-radius: 16px; padding: 20px 24px; margin-bottom: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.edit-preamble { background: var(--bg-secondary, #f8f9fa); border-radius: 16px; padding: 16px 20px; margin-bottom: 4px; }
.edit-heading-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.edit-heading-prefix { font-size: 14px; font-weight: 700; color: var(--button-bg, #42b983); opacity: .6; }
.edit-heading-input { flex: 1; font-size: 20px; font-weight: 600; border: none; border-bottom: 1px dashed transparent; padding: 4px 0; background: transparent; color: var(--text-primary, #1f2d3d); outline: none; }
.edit-heading-input:focus { border-bottom-color: var(--button-bg, #42b983); }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px 6px; border-radius: 6px; opacity: .5; transition: opacity .2s; }
.btn-icon:hover { opacity: 1; background: rgba(0,0,0,.05); }
.btn-danger:hover { background: #fee2e2; }
.edit-toolbar { display: flex; gap: 6px; padding: 8px 0; margin-bottom: 8px; flex-wrap: wrap; }
.tb-btn { padding: 4px 12px; border: 1px solid var(--input-border, #e2e8f0); border-radius: 6px; background: var(--card-bg, #fff); cursor: pointer; font-size: 13px; color: var(--text-primary, #1f2d3d); transition: all .15s; }
.tb-btn:hover { border-color: var(--button-bg, #42b983); color: var(--button-bg, #42b983); }
.tb-sep { border-color: var(--button-bg, #42b983); background: var(--button-bg, #42b983); color: #fff; }
.edit-content-wrap { position: relative; }
.edit-textarea { width: 100%; border: 1px solid var(--input-border, #e2e8f0); border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.65; font-family: inherit; background: var(--card-bg, #fff); color: var(--text-primary, #1f2d3d); resize: vertical; outline: none; transition: border-color .2s; }
.edit-textarea:focus, .edit-focused { border-color: var(--button-bg, #42b983); }

/* === 实时预览面板 - 图片缩放预览(不裁剪,完整显示) === */
.live-preview {
    margin-top: 12px;
    padding: 14px 16px;
    background: var(--card-bg, #ffffff);
    border: 1px solid var(--input-border, #e2e8f0);
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.65;
    color: var(--text-primary, #1f2d3d);
    max-width: 100%;
    overflow-wrap: break-word;
}
.live-preview p { margin-bottom: 8px; color: var(--text-secondary, #4b5563); }
/* 图片自适应缩放:宽图缩小至面板宽度,不裁剪,保持宽高比 */
/* 使用 :deep() 穿透 v-html,否则 scoped CSS 不会命中动态插入的 <img> */
.live-preview :deep(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 8px 0;
    display: block;
    object-fit: scale-down;
}
.live-preview :deep(video) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    margin: 8px 0;
    display: block;
}
.live-preview :deep(code) { background: var(--code-bg, #f1f5f9); padding: 1px 4px; border-radius: 4px; font-size: 13px; }
.live-preview :deep(a) { color: var(--button-bg, #42b983); }
.live-preview :deep(ul), .live-preview :deep(ol) { padding-left: 20px; margin: 8px 0; }
.live-preview :deep(li) { margin-bottom: 4px; }

.btn-edit-float { position: absolute; top: 8px; right: 8px; background: var(--card-bg, #fff); border: 1px solid var(--input-border, #e2e8f0); border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 14px; opacity: .6; transition: opacity .2s; }
.btn-edit-float:hover { opacity: 1; }
.back-link { text-align: center; margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--input-border, #e2e8f0); }
.back-link a { color: var(--button-bg, #42b983); text-decoration: none; font-weight: 600; transition: all .2s; font-size: 15px; }
.back-link a:hover { opacity: .75; text-decoration: underline; letter-spacing: .3px; }
.footer-beian { position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 12px; color: var(--text-secondary, #6c757d); z-index: 1; }
.footer-beian a { color: inherit; text-decoration: none; }
.footer-beian a:hover { opacity: .7; text-decoration: underline; }
.footer-beian .sep { margin: 0 8px; color: var(--text-muted, #adb5bd); }

html[data-theme="dark"] .page-view, html.dark .page-view, .dark .page-view {
    --text-primary: #f3f4f6 !important; --text-secondary: #d1d5db !important; --text-muted: #9ca3af !important;
    --card-bg: #1f2937 !important; --bg-color: #111827 !important; --bg-secondary: #1e293b !important;
    --input-border: #374151 !important; --code-bg: #00000066 !important; }
html[data-theme="dark"] .edit-textarea { background: #111827 !important; }
html[data-theme="dark"] .status-0 { background: #450a0a !important; color: #fca5a5 !important; }
html[data-theme="dark"] .status-1 { background: #451a03 !important; color: #fde68a !important; }
html[data-theme="dark"] .status-2 { background: #052e16 !important; color: #86efac !important; }
html[data-theme="dark"] .status-4 { background: #1e1b4b !important; color: #a5b4fc !important; }

@media (max-width: 760px) {
    .container { padding: 24px 20px; }
    .title { font-size: 24px; }
    .markdown-body :deep(h2) { font-size: 19px; }
    .edit-heading-input { font-size: 17px; }
    .edit-nav-bar { }
    .edit-action-bar { margin: 12px 0 20px; }
    .act-btn { font-size: 12px; padding: 5px 12px; }
    .meta-info { display: flex; flex-direction: column; align-items: center; gap: 4px; }
    .meta-sep { display: none; }
    .page-interaction-bar { gap: 6px; flex-wrap: wrap; }
    .interact-btn { font-size: 13px; padding: 6px 12px; }
    .comments-section { padding: 0; }
    .comment-item { padding: 14px; }
}

/* ========== 点赞 / 评论 样式 ========== */

/* 按钮栏 */
.page-interaction-bar {
    display: flex;
    gap: 10px;
    justify-content: center;
    align-items: center;
    padding: 14px 0 18px;
    border-bottom: 1px solid var(--input-border, #e2e8f0);
    margin-bottom: 18px;
}
.interact-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 7px 16px;
    border: 1px solid var(--input-border, #e2e8f0);
    border-radius: 48px;
    background: var(--card-bg, #fff);
    color: var(--text-primary, #1f2d3d);
    font-size: 14px;
    cursor: pointer;
    transition: all .2s;
}
.interact-btn:hover {
    border-color: var(--button-bg, #42b983);
    color: var(--button-bg, #42b983);
    background: rgba(66,185,131,.06);
}
.interact-count {
    font-weight: 600;
    min-width: 12px;
}

/* 评论区 */
.comments-section {
    margin-top: 28px;
    padding-top: 8px;
    border-top: 2px solid var(--input-border, #e2e8f0);
}
.comments-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary, #1f2d3d);
    margin-bottom: 18px;
}
.comment-input-area {
    margin-bottom: 20px;
}
.comment-textarea {
    width: 100%;
    border: 1px solid var(--input-border, #e2e8f0);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    background: var(--card-bg, #fff);
    color: var(--text-primary, #1f2d3d);
    resize: vertical;
    outline: none;
    transition: border-color .2s;
    box-sizing: border-box;
}
.comment-textarea:focus {
    border-color: var(--button-bg, #42b983);
}
.comment-submit-btn {
    margin-top: 8px;
    padding: 6px 20px;
    border: none;
    border-radius: 48px;
    background: var(--button-bg, #42b983);
    color: #fff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: background .2s;
}
.comment-submit-btn:disabled {
    opacity: .5;
    cursor: not-allowed;
}
.comment-submit-btn:hover:not(:disabled) {
    background: #2c6e4f;
}
.comment-login-hint {
    text-align: center;
    padding: 20px;
    color: var(--text-muted, #adb5bd);
    font-size: 14px;
}
.comment-empty {
    text-align: center;
    padding: 30px 0;
    color: var(--text-muted, #adb5bd);
    font-size: 14px;
}

/* 评论项 */
.comment-item {
    padding: 18px 20px;
    border: 1px solid var(--input-border, #e2e8f0);
    border-radius: 14px;
    margin-bottom: 14px;
    background: var(--bg-secondary, #f8f9fa);
}
.comment-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
}
.comment-avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
}
.comment-author {
    font-weight: 600;
    font-size: 14px;
    color: var(--text-primary, #1f2d3d);
}
.comment-time {
    font-size: 12px;
    color: var(--text-muted, #adb5bd);
    margin-left: auto;
}
.comment-body {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary, #1f2d3d);
    margin-bottom: 8px;
    word-break: break-word;
}
.reply-to-label {
    color: var(--button-bg, #42b983);
    font-weight: 500;
}
.comment-actions {
    display: flex;
    gap: 12px;
}
.comment-action-btn {
    background: none;
    border: none;
    font-size: 13px;
    color: var(--text-secondary, #6c757d);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
    transition: all .15s;
}
.comment-action-btn:hover {
    color: var(--button-bg, #42b983);
    background: rgba(66,185,131,.08);
}
.comment-action-btn.liked {
    color: var(--button-bg, #42b983);
}

/* 回复列表 */
.replies-wrap {
    margin-top: 10px;
    margin-left: 12px;
    padding-left: 12px;
    border-left: 2px solid var(--input-border, #e2e8f0);
}
.reply-item {
    padding: 10px 0;
    border-bottom: 1px solid var(--input-border, #e2e8f0);
}
.reply-item:last-child {
    border-bottom: none;
}

/* 回复输入框 */
.reply-input-area {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--input-border, #e2e8f0);
}
.reply-input-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
}
.comment-cancel-btn {
    padding: 6px 14px;
    border: 1px solid var(--input-border, #e2e8f0);
    border-radius: 48px;
    background: transparent;
    color: var(--text-secondary, #6c757d);
    font-size: 13px;
    cursor: pointer;
    transition: all .15s;
}
.comment-cancel-btn:hover {
    border-color: #ef4444;
    color: #ef4444;
}

/* 赞列表浮层 */
.like-list-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,.45);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
}
.like-list-panel {
    background: var(--card-bg, #fff);
    border-radius: 16px;
    padding: 24px 28px;
    max-width: 360px;
    width: 90%;
    max-height: 70vh;
    overflow-y: auto;
}
.like-list-panel h3 {
    font-size: 18px;
    margin-bottom: 14px;
    text-align: center;
    color: var(--text-primary, #1f2d3d);
}
.like-list-empty {
    text-align: center;
    color: var(--text-muted, #adb5bd);
    padding: 16px;
}
.like-user-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 0;
}
.like-user-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    object-fit: cover;
}

html[data-theme="dark"] .comment-item,
html.dark .comment-item,
.dark .comment-item {
    background: #1e293b !important;
}
html[data-theme="dark"] .like-list-panel,
html.dark .like-list-panel,
.dark .like-list-panel {
    background: #1f2937 !important;
}
</style>

<style>
.markdown-section { background: var(--bg-secondary, #f8f9fa); border-radius: 16px; padding: 24px 28px; margin-bottom: 28px; box-shadow: 0 2px 8px rgba(0,0,0,.04); }
.markdown-section:last-child { margin-bottom: 0; }
html[data-theme="dark"] .markdown-section { background: #1e293b !important; box-shadow: 0 2px 8px rgba(0,0,0,.15) !important; }
</style>