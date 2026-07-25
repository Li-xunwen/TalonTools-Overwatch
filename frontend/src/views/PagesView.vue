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
                <button v-if="isAuthor" class="nav-link btn-transfer" @click="showTransferDialog = true">🔄 转让作者</button>
                <router-link to="/main" class="nav-link back-home">返回首页 →</router-link>
            </div>
            <h1 class="title" v-html="renderedPageTitle"></h1>
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
                    <span class="like-icon">{{ pageLiked ? '🐮' : '🐮' }}</span>
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
                            {{ comment.is_liked ? '🐮' : '🐮' }} {{ comment.like_count }}
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
                                    {{ reply.is_liked ? '🐮' : '🐮' }} {{ reply.like_count }}
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

            <!-- ===== 编辑模式切换：全文编辑 / 按章节编辑 ===== -->
            <div class="edit-mode-toggle">
                <button
                    class="mode-btn"
                    :class="{ active: editMode === 'section' }"
                    @click="switchToSectionMode">
                    📖 按章节编辑
                </button>
                <button
                    class="mode-btn"
                    :class="{ active: editMode === 'full' }"
                    @click="switchToFullMode">
                    📝 全文编辑
                </button>
            </div>

            <div class="edit-title-row">
                <input v-model="editTitle" class="edit-title-input" placeholder="页面标题" @input="onTitleChange" />
                <div class="title-preview" v-if="editTitle.trim()" v-html="renderedTitlePreview"></div>
            </div>

            <!-- ===== 按章节编辑模式（默认） ===== -->
            <div v-show="editMode === 'section'" class="edit-sections">
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
                            <button class="tb-btn" @click="insertFile(idx)">📁 插入文件</button>
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

            <!-- ===== 全文编辑模式 ===== -->
            <div v-show="editMode === 'full'" class="full-edit-wrap">
                <div class="full-edit-toolbar">
                    <button class="tb-btn" @click="wrapFullText('**', '**')"><b>B</b></button>
                    <button class="tb-btn" @click="wrapFullText('*', '*')"><i>I</i></button>
                    <button class="tb-btn" @click="wrapFullText('`', '`')">代码</button>
                    <button class="tb-btn" @click="insertLinkFull">🔗 链接</button>
                    <button class="tb-btn" @click="insertFileFull">📁 插入文件</button>
                </div>
                <textarea
                    v-model="fullTextContent"
                    class="full-edit-textarea"
                    placeholder="全文 Markdown 内容（# 标题 + 正文）"
                    @input="onFullTextInput"
                ></textarea>
                <div class="full-edit-preview-label">📋 全文预览</div>
                <div class="full-edit-preview" v-html="fullPreviewHtml"></div>
            </div>

            <!-- 文件库弹窗 -->
            <FileLibrary v-if="showFileLibrary" @close="showFileLibrary = false" @select="onFileSelected" />

        </div>

        <!-- 转让作者弹窗（独立于阅读/编辑模式块，可随时弹出） -->
        <TransferAuthorDialog
            v-if="showTransferDialog"
            :pageId="pageData.id"
            @close="showTransferDialog = false"
            @transferred="onTransferComplete"
        />

        <div class="back-link" v-if="pageData && !loading && !isEditing"><a href="#" @click.prevent="scrollToTop">🔝 回到最顶上</a></div>
        <div class="footer-beian">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ icpNumber }}</a>
            <span class="sep">|</span>
            <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">{{ policeNumber }}</a>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUpdated, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import ThemeToggle from '@/components/ThemeToggle.vue';
import FileLibrary from '@/components/FileLibrary.vue';
import TransferAuthorDialog from '@/components/TransferAuthorDialog.vue';
import { authFetch } from '@/utils/request';
import {
    PageSection, parseSections, mergeSections,
    insertSection, removeSection as removeSectionUtil,
    undoSection,
    loadEditCache, saveEditCache, clearEditCache, isCacheStale,
} from '@/utils/pageEditor';

// marked 自定义渲染 — 视频扩展名直接输出 <video>
const VIDEO_EXT = /\.(mp4|webm|ogv|mov)$/i;
const TYPE_MAP: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', ogv: 'video/ogg', mov: 'video/quicktime' };

const renderer = new marked.Renderer();
renderer.image = ({ href, text }) => {
    if (VIDEO_EXT.test(href)) {
        const ext = href.match(VIDEO_EXT)![1].toLowerCase();
        const type = TYPE_MAP[ext] || 'video/mp4';
        return `<video controls playsinline muted width="100%" src="${href}"></video>`;
    }
    return `<img src="${href}" alt="${text}">`;
};

marked.setOptions({ renderer, breaks: true });

const VIDEO_ALLOW = {
    ADD_TAGS: ['img', 'video', 'source'],
    ADD_ATTR: ['target', 'rel', 'controls', 'preload', 'playsinline', 'type', 'src', 'width', 'muted'],
};

const route = useRoute();
const router = useRouter();
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
const showFileLibrary = ref(false);
const fileLibrarySectionIdx = ref(0);

// ===== 转让作者 =====
const showTransferDialog = ref(false);

function onTransferComplete(payload: { newAuthorId: number; newAuthorName: string }) {
    pageData.value.author_id = payload.newAuthorId;
    pageData.value.author_name = payload.newAuthorName;
    isAuthor.value = false;
    showTransferDialog.value = false;
    alert('转让成功');
}

// ===== 编辑模式切换 =====
const editMode = ref<'section' | 'full'>('section');    // 默认按章节编辑
const fullTextContent = ref('');                         // 全文编辑模式的完整 Markdown 文本

// 全文编辑模式的预览 HTML
const fullPreviewHtml = computed(() => {
    if (!fullTextContent.value.trim()) return '';
    let html = marked.parse(fullTextContent.value, { async: false }) as string;
    // 与 page 页预览保持一致：移除第一个 <h1>（标题已在上方单独渲染）
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
    // 包裹 <h2> 段落为 .markdown-section
    html = html.replace(/<h2/g, '</div><div class="markdown-section"><h2');
    html = html.replace(/^<\/div><div class="markdown-section"><h2/, '<div class="markdown-section"><h2');
    if (/markdown-section/.test(html)) html += '</div>';
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
});

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
    let html = marked.parse(pageData.value.content, { async: false }) as string;
    // 移除第一个 <h1>(标题已在外部 .title 渲染,避免重复)
    html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>/, '');
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
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
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

// 总标题所见所得预览（编辑器）
const renderedTitlePreview = computed(() => {
    if (!editTitle.value.trim()) return '';
    const html = marked.parse(`# ${editTitle.value}`, { async: false }) as string;
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
});

// page 页阅读模式的标题（支持 Markdown 内联格式）
const renderedPageTitle = computed(() => {
    if (!pageData.value?.title) return '';
    const html = marked.parseInline(pageData.value.title, { async: false }) as string;
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
});

const renderPreview = (md: string): string => {
    if (!md) return '';
    let html = marked.parse(md, { async: false }) as string;
    return DOMPurify.sanitize(html, VIDEO_ALLOW);
};

async function fetchPage() {
    const id = route.params.id;

    // 新建文章（用 route.path 判断，避免首次挂载时 params 未就绪）
    if (route.path === '/pages/new' || id === 'new') {
      const template = sessionStorage.getItem('newPageTemplate') || '';
      sessionStorage.removeItem('newPageTemplate');
      const titleMatch = template.match(/^#\s+(.+?)(?:\n|$)/);
      const fallbackTitle = titleMatch ? titleMatch[1].trim() : '新文章';
      pageData.value = { id: 'new', title: fallbackTitle, content: template, author_name: '', updated_at: new Date().toISOString() };
      isAuthor.value = true;
      loading.value = false;
      nextTick(() => enterEditMode());
      return;
    }

    // 路由未就绪时跳过 API 请求
    if (!id || id === 'new') { error.value = ''; loading.value = false; return; }

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
                isAuthor.value = p.userId === pageData.value.author_id;
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
    editMode.value = 'section'; // 默认进入按章节编辑模式
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
                // 恢复全文缓存
                try {
                    const ft = localStorage.getItem(`talon_page_fulltext_${pageData.value.id}_${uid}`);
                    if (ft !== null) fullTextContent.value = ft;
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
    // 初始化全文内容
    fullTextContent.value = buildFullTextFromSections();
    isEditing.value = true;
    window.scrollTo({ top: 0 });
}

/** 从当前编辑状态构建完整的 Markdown 文本（含 # 标题） */
function buildFullTextFromSections(): string {
    return buildContent();
}

// ===== 编辑模式切换函数 =====

/** 切换到全文编辑模式：将章节数据合并为完整 Markdown 文本 */
function switchToFullMode() {
    if (editMode.value === 'full') return;
    fullTextContent.value = buildContent();
    editMode.value = 'full';
}

/** 切换到按章节编辑模式：将全文 Markdown 解析回章节结构 */
function switchToSectionMode() {
    if (editMode.value === 'section') return;
    // 从全文内容中提取标题
    const titleMatch = fullTextContent.value.match(/^#\s+(.+?)(?:\n|$)/);
    let body = fullTextContent.value;
    if (titleMatch) {
        editTitle.value = titleMatch[1].trim();
        body = body.replace(/^#\s+.+?(?:\n|$)/, '').trim();
    }
    editSections.value = parseSections(body);
    editMode.value = 'section';
    saveToLocal();
}

/** 全文编辑器的 input 回调：同步 title 变化 */
function onFullTextInput() {
    // 尝试从全文内容中提取标题并更新 editTitle
    const titleMatch = fullTextContent.value.match(/^#\s+(.+?)(?:\n|$)/);
    if (titleMatch) {
        editTitle.value = titleMatch[1].trim();
    }
    saveToLocal();
}

// ===== 全文编辑工具栏 =====

function wrapFullText(before: string, after: string) {
    const ta = document.querySelector('.full-edit-textarea') as HTMLTextAreaElement;
    if (!ta) return;
    const s = ta.selectionStart, e = ta.selectionEnd;
    fullTextContent.value =
        fullTextContent.value.slice(0, s) +
        before + fullTextContent.value.slice(s, e) + after +
        fullTextContent.value.slice(e);
    saveToLocal();
    requestAnimationFrame(() => {
        ta.focus();
        ta.setSelectionRange(s + before.length, e + before.length);
    });
}

function insertLinkFull() {
    const url = prompt('输入链接地址:', 'https://');
    if (url) wrapFullText('[', `](${url})`);
}

function insertFileFull() {
    const ta = document.querySelector('.full-edit-textarea') as HTMLTextAreaElement | undefined;
    if (ta) {
        const pos = ta.selectionStart;
        const content = fullTextContent.value;
        if (pos > 0 && content[pos - 1] !== '\n') {
            const ok = confirm('光标不在行首，插入内容会接在当前行末尾。是否先换行？');
            if (ok) {
                fullTextContent.value =
                    content.slice(0, pos) + '\n' + content.slice(pos);
                saveToLocal();
                requestAnimationFrame(() => {
                    ta.focus();
                    ta.setSelectionRange(pos + 1, pos + 1);
                });
            }
        }
    }
    fileLibrarySectionIdx.value = -1; // 标记为全文模式
    showFileLibrary.value = true;
}

// ===== 原章节编辑操作 =====

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

/**
 * 打开文件库弹窗，用户选择文件后插入 Markdown 格式内容。
 * 图片 → ![文件名](url)
 * 视频 → ![文件名](url)（marked 渲染器自动转为 <video>）
 * 其他文件 → [文件名](url)
 */
function insertFile(idx: number) {
    // 检查光标是否在行首，否则提醒用户换行
    const ta = document.querySelectorAll('.edit-textarea')[idx] as HTMLTextAreaElement | undefined;
    if (ta) {
        const pos = ta.selectionStart;
        const content = editSections.value[idx].content;
        if (pos > 0 && content[pos - 1] !== '\n') {
            const ok = confirm('光标不在行首，插入内容会接在当前行末尾。是否先换行？');
            if (ok) {
                editSections.value[idx].content =
                    content.slice(0, pos) + '\n' + content.slice(pos);
                saveToLocal();
                requestAnimationFrame(() => {
                    ta.focus();
                    ta.setSelectionRange(pos + 1, pos + 1);
                });
            }
        }
    }
    fileLibrarySectionIdx.value = idx;
    showFileLibrary.value = true;
}

function onFileSelected(file: any) {
    const idx = fileLibrarySectionIdx.value;
    if (idx === -1) {
        // 全文编辑模式
        fullTextContent.value += `\n![${file.name}](${file.url})`;
    } else if (file.type === 'image' || file.type === 'video') {
        editSections.value[idx].content += `\n![${file.name}](${file.url})`;
    } else {
        editSections.value[idx].content += `\n[${file.name}](${file.url})`;
    }
    showFileLibrary.value = false;
    saveToLocal();
}

// 总标题变更时刷新所见所得预览
function onTitleChange() { saveToLocal(); }

// 构建完整 Markdown 内容:总标题 + 各段落
function buildContent(): string {
    if (editMode.value === 'full') {
        // 全文编辑模式：直接使用全文内容
        return fullTextContent.value.trim();
    }
    // 章节编辑模式：合并章节
    const merged = mergeSections(editSections.value);
    const t = editTitle.value.trim();
    return t ? `# ${t}\n\n${merged}` : merged;
}

function saveToLocal() {
    const uid = getUserId(); if (!uid || !pageData.value) return;
    saveEditCache({ pageId: pageData.value.id, sections: editSections.value, savedAt: Date.now(), userId: uid, originalUpdatedAt: pageData.value.updated_at });
    try { localStorage.setItem(`talon_page_title_${pageData.value.id}_${uid}`, editTitle.value); } catch {}
    // 保存全文编辑缓存
    try { localStorage.setItem(`talon_page_fulltext_${pageData.value.id}_${uid}`, fullTextContent.value); } catch {}
}
function clearCache() {
    const uid = getUserId();
    if (uid && pageData.value) {
        clearEditCache(pageData.value.id, uid);
        try {
            localStorage.removeItem(`talon_page_title_${pageData.value.id}_${uid}`);
            localStorage.removeItem(`talon_page_fulltext_${pageData.value.id}_${uid}`);
        } catch {}
    }
}

async function submitForReview() {
    if (!confirm('提交后页面将进入审核状态,确定提交?')) return;
    // 新建文章先 POST 到后端获取真实 ID
    if (pageData.value?.id === 'new') {
      const created = await createPageOnServer();
      if (!created) return;
    }
    saving.value = true;
    try {
        const content = buildContent();
        const sr = await authFetch(`/api/pages/${pageData.value.id}`, { method: 'PUT', body: JSON.stringify({ title: editTitle.value, content }) });
        if (!sr.ok) { const e = await sr.json(); alert('保存失败:' + (e.error || '')); return; }
        const st = await authFetch(`/api/pages/${pageData.value.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 1 }) });
        if (!st.ok) { alert('状态更新失败'); return; }
        clearCache(); isEditing.value = false; alert('已提交审核');
        router.push('/pages/' + pageData.value.id);
    } finally { saving.value = false; }
}

async function saveAsDraft() {
    // 新建文章先 POST 到后端获取真实 ID
    if (pageData.value?.id === 'new') {
      const created = await createPageOnServer();
      if (!created) return;
    }
    saving.value = true;
    try {
        const content = buildContent();
        const sr = await authFetch(`/api/pages/${pageData.value.id}`, { method: 'PUT', body: JSON.stringify({ title: editTitle.value, content }) });
        if (!sr.ok) { const e = await sr.json(); alert('保存失败:' + (e.error || '')); return; }
        const st = await authFetch(`/api/pages/${pageData.value.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 4 }) });
        if (!st.ok) { alert('状态更新失败'); return; }
        clearCache(); isEditing.value = false; alert('已保存为草稿');
        router.push('/pages/' + pageData.value.id);
    } finally { saving.value = false; }
}

async function createPageOnServer(): Promise<boolean> {
  saving.value = true;
  try {
    const content = buildContent();
    const res = await authFetch('/api/pages', {
      method: 'POST',
      body: JSON.stringify({ title: editTitle.value, content })
    });
    if (!res.ok) {
      const e = await res.json().catch(() => ({ error: '创建失败' }));
      alert('创建失败:' + (e.error || ''));
      return false;
    }
    const data = await res.json();
    pageData.value.id = data.id || data.pageId;
    return true;
  } catch {
    alert('网络错误，创建失败');
    return false;
  } finally {
    saving.value = false;
  }
}

function confirmDiscard() {
  if (pageData.value?.id === 'new') {
    // 新建文章撤销 → 返回 news
    clearCache(); router.push('/news'); return;
  }
  if (!confirm('存在未提交的修改')) return;
  clearCache(); isEditing.value = false; editingSectionIdx.value = -1;
}

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

// 使所有 <video> 可点击播放（绕过 Chromium 控件交互 bug）
function bindVideoPlay() {
  nextTick(() => {
    document.querySelectorAll('.page-view video, .markdown-section video, .full-edit-preview video').forEach(v => {
      const video = v as HTMLVideoElement;
      if (!video.dataset._bound) {
        video.dataset._bound = '1';
        video.addEventListener('click', (e) => {
          e.stopPropagation();
          if (video.paused) video.play().catch(() => {});
          else video.pause();
        });
        // 光标提示可点击
        video.style.cursor = 'pointer';
      }
    });
  });
}

onMounted(() => { fetchPage(); bindVideoPlay(); });

// 内容变更后重新绑定
onUpdated(() => { bindVideoPlay(); });

// 路由参数变化时重新拉取（修复 News 页跳转 pages/:id 缓存问题）
watch(() => route.fullPath, () => { fetchPage(); });
</script>

<!-- ===== scoped 样式 ===== -->
<style scoped>
* { box-sizing: border-box; }
.page-view { min-height: 100vh; background: var(--bg-color); padding: 40px 20px 0; position: relative; display: flex; flex-direction: column; }
.theme-toggle { position: fixed; top: 20px; right: 20px; z-index: 100; }
.container { max-width: 900px; margin: 0 auto; background: var(--card-bg); border-radius: var(--glass-radius); border: 1px solid var(--glass-border); box-shadow: var(--glass-shadow); backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur)); padding: 40px 32px; flex: 1; }
.container-edit { padding: 28px 20px; }
.container-edit .edit-section { padding: 16px 18px; }
.container-edit .edit-preamble { padding: 12px 14px; }
.container-edit .edit-textarea { padding: 10px 12px; }
.container-edit .live-preview { padding: 10px 12px; }
.state-card { text-align: center; padding: 64px 24px; }
.state-icon { font-size: 48px; display: block; margin-bottom: 16px; }
.state-text { font-size: 16px; color: var(--accent); margin-bottom: 20px; }
.btn-retry { padding: 8px 28px; border: 1px solid var(--button-bg); background: transparent; color: var(--button-bg); border-radius: 48px; font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-retry:hover { background: var(--button-bg); color: #fff; }
.spinner { width: 36px; height: 36px; border: 3px solid var(--input-border); border-top-color: var(--button-bg); border-radius: 50%; animation: spin .8s linear infinite; margin: 0 auto 16px; }
@keyframes spin { to { transform: rotate(360deg); } }
.top-nav-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--input-border); }
.nav-link { font-size: 14px; font-weight: 600; text-decoration: none; transition: opacity .2s; cursor: pointer; background: none; border: none; }
.nav-link.back-prev { color: var(--accent); }
.nav-link.back-home { color: var(--button-bg); }
.nav-link:hover { opacity: .7; text-decoration: underline; }
.btn-edit { color: var(--button-bg); font-size: 14px; padding: 4px 14px; border: 1px solid var(--button-bg); border-radius: 48px; }
.btn-edit:hover { background: var(--button-bg); color: #fff; text-decoration: none; }
.btn-transfer { color: #f59e0b; font-size: 14px; padding: 4px 14px; border: 1px solid #f59e0b; border-radius: 48px; margin-left: 6px; }
.btn-transfer:hover { background: #f59e0b; color: #fff; text-decoration: none; }
.edit-nav-bar { display: flex; justify-content: space-between; align-items: center; }
.edit-action-bar { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin: 16px 0 24px; }
.act-btn { padding: 6px 16px; border-radius: 48px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all .2s; }
.act-btn:disabled { opacity: .5; cursor: not-allowed; }
.act-submit { background: var(--button-bg); color: #fff; }
.act-submit:hover:not(:disabled) { background: #2c6e4f; }
.act-draft { border-color: var(--button-bg); color: var(--button-bg); background: transparent; }
.act-draft:hover:not(:disabled) { background: rgba(66,185,131,.08); }
.act-discard { border-color: #ef4444; color: #ef4444; background: transparent; }
.act-discard:hover:not(:disabled) { background: #fef2f2; }

/* ===== 编辑模式切换按钮 ===== */
.edit-mode-toggle {
    display: flex;
    justify-content: center;
    gap: 8px;
    margin-bottom: 20px;
}
.mode-btn {
    padding: 8px 20px;
    border: 2px solid var(--input-border);
    border-radius: 48px;
    background: transparent;
    color: var(--accent);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all .2s;
}
.mode-btn:hover {
    border-color: var(--button-bg);
    color: var(--button-bg);
}
.mode-btn.active {
    border-color: var(--button-bg);
    background: var(--button-bg);
    color: #fff;
}

.title { text-align: center; font-size: 28px; font-weight: 700; background: linear-gradient(135deg,var(--text-primary) 0%,var(--button-bg) 100%); background-clip: text; -webkit-background-clip: text; color: transparent; margin-bottom: 12px; }
.meta-info { text-align: center; font-size: 14px; color: var(--accent); margin-bottom: 32px; border-bottom: 1px solid var(--input-border); padding-bottom: 16px; }
.meta-author { display: inline; }
.meta-avatar { width: 18px; height: 18px; border-radius: 50%; object-fit: cover; vertical-align: -3px; display: inline-block; }
.meta-sep { margin: 0 10px; color: var(--accent); }
.status-badge { display: inline-block; padding: 2px 10px; border-radius: 24px; font-size: 12px; font-weight: 600; }
.status-0 { background: #fee2e2; color: #dc2626; }
.status-1 { background: #fef9c3; color: #a16207; }
.status-2 { background: #dcfce7; color: #16a34a; }
.status-4 { background: #e0e7ff; color: #4338ca; }
.markdown-body { font-size: 15px; line-height: 1.75; color: var(--text-primary); }
.markdown-body :deep(h1), .markdown-body :deep(h3), .markdown-body :deep(h4) { font-weight: 600; color: var(--text-primary); margin-top: 32px; margin-bottom: 16px; padding-left: 12px; border-left: 5px solid var(--button-bg); }
.markdown-body :deep(h2) { font-size: 22px; font-weight: 600; color: var(--text-primary); margin-top: 0; margin-bottom: 18px; padding: 0 0 0 12px; border-left: 5px solid var(--button-bg); }
.markdown-body :deep(p) { margin-bottom: 12px; color: var(--accent); line-height: 1.65; }
.markdown-body :deep(ul), .markdown-body :deep(ol) { padding-left: 24px; margin: 12px 0; }
.markdown-body :deep(li) { margin-bottom: 10px; }
.markdown-body :deep(a) { color: var(--button-bg); text-decoration: none; font-weight: 500; }
.markdown-body :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border-radius: 8px;
    box-shadow: 0 6px 14px var(--shadow-color);
    object-fit: scale-down;
}
.markdown-body :deep(video) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border-radius: 8px;
    box-shadow: 0 6px 14px var(--shadow-color);
}
.markdown-body :deep(blockquote) { margin: 16px 0; padding: 12px 20px; background: var(--bg-secondary); border-left: 4px solid var(--button-bg); border-radius: 8px; }
.markdown-body :deep(code) { background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.markdown-body :deep(pre) { background: var(--bg-secondary); padding: 16px 20px; border-radius: 16px; overflow-x: auto; }
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; }
.markdown-body :deep(th), .markdown-body :deep(td) { padding: 10px 14px; border: 1px solid var(--input-border); text-align: left; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--input-border); margin: 28px 0; }
.edit-title-row { margin-bottom: 24px; }
.edit-title-input { width: 100%; font-size: 24px; font-weight: 700; border: none; border-bottom: 2px solid var(--input-border); padding: 8px 4px; background: transparent; color: var(--text-primary); outline: none; }
.edit-title-input:focus { border-bottom-color: var(--button-bg); }
/* 总标题所见所得预览 */
.title-preview { margin-top: 12px; padding: 4px 0; }
.title-preview :deep(h1) {
    font-size: 26px;
    font-weight: 700;
    text-align: center;
    margin: 0;
    padding: 0;
    border: none;
    background: linear-gradient(135deg,var(--text-primary) 0%,var(--button-bg) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
}
.edit-sections { margin-bottom: 24px; }
.edit-section-wrapper { margin-bottom: 0; }
.btn-insert-section { width: 100%; padding: 10px; margin: 8px 0; border: 2px dashed var(--input-border); border-radius: 12px; background: transparent; color: var(--accent); font-size: 14px; cursor: pointer; transition: all .2s; }
.btn-insert-section:hover { border-color: var(--button-bg); color: var(--button-bg); background: rgba(66,185,131,.05); }
.edit-section { background: var(--bg-secondary); border-radius: 16px; padding: 20px 24px; margin-bottom: 4px; box-shadow: 0 2px 8px var(--shadow-color); }
.edit-preamble { background: var(--bg-secondary); border-radius: 16px; padding: 16px 20px; margin-bottom: 4px; }
.edit-heading-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.edit-heading-prefix { font-size: 14px; font-weight: 700; color: var(--button-bg); opacity: .6; }
.edit-heading-input { flex: 1; font-size: 20px; font-weight: 600; border: none; border-bottom: 1px dashed transparent; padding: 4px 0; background: transparent; color: var(--text-primary); outline: none; }
.edit-heading-input:focus { border-bottom-color: var(--button-bg); }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px 6px; border-radius: 6px; opacity: .5; transition: opacity .2s; }
.btn-icon:hover { opacity: 1; background: rgba(0,0,0,.05); }
.btn-danger:hover { background: #fee2e2; }
.edit-toolbar { display: flex; gap: 6px; padding: 8px 0; margin-bottom: 8px; flex-wrap: wrap; }
.tb-btn { padding: 4px 12px; border: 1px solid var(--input-border); border-radius: 6px; background: var(--card-bg); cursor: pointer; font-size: 13px; color: var(--text-primary); transition: all .15s; }
.tb-btn:hover { border-color: var(--button-bg); color: var(--button-bg); }
.tb-sep { border-color: var(--button-bg); background: var(--button-bg); color: #fff; }
.edit-content-wrap { position: relative; }
.edit-textarea { width: 100%; border: 1px solid var(--input-border); border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.65; font-family: inherit; background: var(--card-bg); color: var(--text-primary); resize: vertical; outline: none; transition: border-color .2s; }
.edit-textarea:focus, .edit-focused { border-color: var(--button-bg); }

/* === 实时预览面板 === */
.live-preview {
    margin-top: 12px;
    padding: 14px 16px;
    background: var(--card-bg);
    border: 1px solid var(--input-border);
    border-radius: 12px;
    font-size: 14px;
    line-height: 1.65;
    color: var(--text-primary);
    max-width: 100%;
    overflow-wrap: break-word;
}
.live-preview p { margin-bottom: 8px; color: var(--accent); }
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
.live-preview :deep(code) { background: var(--bg-secondary); padding: 1px 4px; border-radius: 4px; font-size: 13px; }
.live-preview :deep(a) { color: var(--button-bg); }
.live-preview :deep(ul), .live-preview :deep(ol) { padding-left: 20px; margin: 8px 0; }
.live-preview :deep(li) { margin-bottom: 4px; }

.btn-edit-float { position: absolute; top: 8px; right: 8px; background: var(--card-bg); border: 1px solid var(--input-border); border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 14px; opacity: .6; transition: opacity .2s; }
.btn-edit-float:hover { opacity: 1; }



/* ===== 全文编辑模式 ===== */
.full-edit-wrap { margin-bottom: 24px; }
.full-edit-toolbar { display: flex; gap: 6px; padding: 8px 0; margin-bottom: 8px; flex-wrap: wrap; }
.full-edit-textarea {
    width: 100%;
    min-height: 400px;
    border: 1px solid var(--input-border);
    border-radius: 12px;
    padding: 16px;
    font-size: 14px;
    line-height: 1.7;
    font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
    background: var(--card-bg);
    color: var(--text-primary);
    resize: vertical;
    outline: none;
    transition: border-color .2s;
}
.full-edit-textarea:focus {
    border-color: var(--button-bg);
}
.full-edit-preview-label {
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 20px 0 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--input-border);
}
.full-edit-preview {
    padding: 16px 20px;
    background: var(--card-bg);
    border: 1px solid var(--input-border);
    border-radius: 12px;
    font-size: 15px;
    line-height: 1.75;
    color: var(--text-primary);
    max-width: 100%;
    overflow-wrap: break-word;
}
.full-edit-preview p { margin-bottom: 12px; color: var(--accent); }
.full-edit-preview h1 { font-size: 26px; font-weight: 700; text-align: center; margin-bottom: 12px; color: var(--text-primary); }
.full-edit-preview h2 { font-size: 22px; font-weight: 600; margin-top: 28px; margin-bottom: 14px; padding-left: 12px; border-left: 5px solid var(--button-bg); color: var(--text-primary); }
.full-edit-preview h3, .full-edit-preview h4 { font-weight: 600; margin-top: 24px; margin-bottom: 12px; padding-left: 12px; border-left: 5px solid var(--button-bg); color: var(--text-primary); }
.full-edit-preview :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 16px auto;
    border-radius: 8px;
    box-shadow: 0 6px 14px var(--shadow-color);
    object-fit: scale-down;
}
.full-edit-preview :deep(video) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 16px auto;
    border-radius: 8px;
    box-shadow: 0 6px 14px var(--shadow-color);
}
.full-edit-preview :deep(code) { background: var(--bg-secondary); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.full-edit-preview :deep(pre) { background: var(--bg-secondary); padding: 16px 20px; border-radius: 16px; overflow-x: auto; }
.full-edit-preview :deep(a) { color: var(--button-bg); text-decoration: none; font-weight: 500; }
.full-edit-preview :deep(ul), .full-edit-preview :deep(ol) { padding-left: 24px; margin: 12px 0; }
.full-edit-preview :deep(li) { margin-bottom: 6px; }
.full-edit-preview :deep(blockquote) { margin: 16px 0; padding: 12px 20px; background: var(--bg-secondary); border-left: 4px solid var(--button-bg); border-radius: 8px; }
.full-edit-preview :deep(table) { width: 100%; border-collapse: collapse; }
.full-edit-preview :deep(th), .full-edit-preview :deep(td) { padding: 10px 14px; border: 1px solid var(--input-border); text-align: left; }

.back-link { text-align: center; margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--input-border); }
.back-link a { color: var(--button-bg); text-decoration: none; font-weight: 600; transition: all .2s; font-size: 15px; }
.back-link a:hover { opacity: .75; text-decoration: underline; letter-spacing: .3px; }
.footer-beian { text-align: center; font-size: 12px; color: var(--accent); padding: 14px 0 18px; background: var(--bg-secondary); backdrop-filter: blur(var(--glass-blur)); -webkit-backdrop-filter: blur(var(--glass-blur)); border-top: 1px solid var(--glass-border); }
.footer-beian a { color: inherit; text-decoration: none; }
.footer-beian a:hover { opacity: .7; text-decoration: underline; }
.footer-beian .sep { margin: 0 8px; color: var(--accent); }

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
    .full-edit-textarea { min-height: 300px; }
}

/* ========== 点赞 / 评论 样式 ========== */

/* 按钮栏 */
.page-interaction-bar {
    display: flex;
    gap: 10px;
    justify-content: center;
    align-items: center;
    padding: 14px 0 18px;
    border-bottom: 1px solid var(--input-border);
    margin-bottom: 18px;
}
.interact-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 7px 16px;
    border: 1px solid var(--input-border);
    border-radius: 48px;
    background: var(--card-bg);
    color: var(--text-primary);
    font-size: 14px;
    cursor: pointer;
    transition: all .2s;
}
.interact-btn:hover {
    border-color: var(--button-bg);
    color: var(--button-bg);
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
    border-top: 2px solid var(--input-border);
}
.comments-title {
    font-size: 20px;
    font-weight: 700;
    color: var(--text-primary);
    margin-bottom: 18px;
}
.comment-input-area {
    margin-bottom: 20px;
}
.comment-textarea {
    width: 100%;
    border: 1px solid var(--input-border);
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 14px;
    font-family: inherit;
    background: var(--card-bg);
    color: var(--text-primary);
    resize: vertical;
    outline: none;
    transition: border-color .2s;
    box-sizing: border-box;
}
.comment-textarea:focus {
    border-color: var(--button-bg);
}
.comment-submit-btn {
    margin-top: 8px;
    padding: 6px 20px;
    border: none;
    border-radius: 48px;
    background: var(--button-bg);
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
    color: var(--accent);
    font-size: 14px;
}
.comment-empty {
    text-align: center;
    padding: 30px 0;
    color: var(--accent);
    font-size: 14px;
}

/* 评论项 */
.comment-item {
    padding: 18px 20px;
    border: 1px solid var(--input-border);
    border-radius: 14px;
    margin-bottom: 14px;
    background: var(--bg-secondary);
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
    color: var(--text-primary);
}
.comment-time {
    font-size: 12px;
    color: var(--accent);
    margin-left: auto;
}
.comment-body {
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-primary);
    margin-bottom: 8px;
    word-break: break-word;
}
.reply-to-label {
    color: var(--button-bg);
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
    color: var(--accent);
    cursor: pointer;
    padding: 2px 6px;
    border-radius: 6px;
    transition: all .15s;
}
.comment-action-btn:hover {
    color: var(--button-bg);
    background: rgba(66,185,131,.08);
}
.comment-action-btn.liked {
    color: var(--button-bg);
}

/* 回复列表 */
.replies-wrap {
    margin-top: 10px;
    margin-left: 12px;
    padding-left: 12px;
    border-left: 2px solid var(--input-border);
}
.reply-item {
    padding: 10px 0;
    border-bottom: 1px solid var(--input-border);
}
.reply-item:last-child {
    border-bottom: none;
}

/* 回复输入框 */
.reply-input-area {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--input-border);
}
.reply-input-actions {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 6px;
}
.comment-cancel-btn {
    padding: 6px 14px;
    border: 1px solid var(--input-border);
    border-radius: 48px;
    background: transparent;
    color: var(--accent);
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
    background: var(--card-bg);
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
    color: var(--text-primary);
}
.like-list-empty {
    text-align: center;
    color: var(--accent);
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

/* ===== 状态徽章 — 深色模式具体颜色 ===== */
html[data-theme="dark"] .status-0,
.dark .status-0 { background: #450a0a; color: #fca5a5; }
html[data-theme="dark"] .status-1,
.dark .status-1 { background: #451a03; color: #fde68a; }
html[data-theme="dark"] .status-2,
.dark .status-2 { background: #052e16; color: #86efac; }
html[data-theme="dark"] .status-4,
.dark .status-4 { background: #1e1b4b; color: #a5b4fc; }
</style>

<!-- ===== 非 scoped 的全局段管理器样式 ===== -->
<style>
.markdown-section { background: var(--bg-secondary); border-radius: 16px; padding: 24px 28px; margin-bottom: 28px; box-shadow: 0 2px 8px var(--shadow-color); }
.markdown-section:last-child { margin-bottom: 0; }
</style>
