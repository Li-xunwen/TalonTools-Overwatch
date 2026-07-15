<template>
    <div class="page-view">
        <ThemeToggle class="theme-toggle" />

        <div class="container" v-if="loading">
            <div class="state-card">
                <div class="spinner"></div>
                <p class="state-text">页面加载中…</p>
            </div>
        </div>

        <div class="container" v-else-if="error">
            <div class="state-card error-card">
                <span class="state-icon">⚠️</span>
                <p class="state-text">{{ error }}</p>
                <button v-if="isAuthError" class="btn-retry" @click="$router.push('/')">返回登录</button>
                <button v-else class="btn-retry" @click="fetchPage">重试</button>
            </div>
        </div>

        <!-- ===== 阅读模式 ===== -->
        <div class="container" v-else-if="pageData && !isEditing">
            <div class="top-nav-bar">
                <a href="javascript:void(0)" @click="$router.back()" class="nav-link back-prev">← 返回上一页</a>
                <button v-if="isAuthor" class="nav-link btn-edit" @click="enterEditMode">✏️ 编辑</button>
                <router-link to="/main" class="nav-link back-home">返回首页 →</router-link>
            </div>

            <h1 class="title">{{ pageData.title }}</h1>

            <div class="meta-info">
                <span class="meta-author">
                    <img :src="getAvatarUrl(pageData.author_name)" class="meta-avatar"
                        @error="handleAvatarError" alt="" />
                    {{ pageData.author_name }}
                </span>
                <span class="meta-sep">|</span>
                <span class="meta-date">📅 {{ formatDate(pageData.updated_at) }}</span>
                <template v-if="pageData.status !== 3">
                    <span class="meta-sep">|</span>
                    <span :class="['status-badge', 'status-' + pageData.status]">
                        {{ statusLabel(pageData.status) }}
                    </span>
                </template>
            </div>

            <div class="markdown-body" v-html="renderedContent"></div>
        </div>

        <!-- ===== 编辑模式 ===== -->
        <div class="container" v-else-if="pageData && isEditing">
            <div class="top-nav-bar edit-nav-bar">
                <a href="javascript:void(0)" @click="confirmDiscard" class="nav-link back-prev">← 返回</a>
                <div class="nav-actions">
                    <button class="act-btn act-submit" @click="submitForReview" :disabled="saving">{{ saving ? '提交中…' : '提交审核' }}</button>
                    <button class="act-btn act-draft" @click="saveAsDraft" :disabled="saving">{{ saving ? '保存中…' : '转为草稿' }}</button>
                    <button class="act-btn act-discard" @click="confirmDiscard">撤销修改</button>
                </div>
                <router-link to="/main" class="nav-link back-home">返回首页 →</router-link>
            </div>

            <div class="edit-title-row">
                <input v-model="editTitle" class="edit-title-input" placeholder="页面标题" />
            </div>

            <div class="edit-sections">
                <div v-for="(section, idx) in editSections" :key="section.id" class="edit-section-wrapper">
                    <button v-if="idx > 0" class="btn-insert-section" @click="addSection(idx)">+ 插入段落</button>
                    <div v-if="!section.heading" class="edit-preamble">
                        <textarea v-model="section.content" class="edit-textarea" rows="4"
                            @input="onSectionChange(idx)" @keydown.ctrl.z.prevent="onUndo(idx)" />
                    </div>
                    <div v-else class="edit-section">
                        <div class="edit-heading-row">
                            <span class="edit-heading-prefix">##</span>
                            <input v-model="section.heading" class="edit-heading-input" placeholder="段落标题"
                                @input="onSectionChange(idx)" />
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
                                rows="6" placeholder="正文（Markdown 格式）"
                                @focus="editingSectionIdx = idx"
                                @input="onSectionChange(idx)"
                                @keydown.ctrl.z.prevent="onUndo(idx)" />
                            <button v-if="editingSectionIdx !== idx" class="btn-edit-float"
                                @click="editingSectionIdx = idx">✏️</button>
                        </div>
                    </div>
                </div>
                <button class="btn-insert-section" @click="addSection(editSections.length)">+ 插入段落</button>
            </div>
        </div>

        <div class="back-link" v-if="pageData && !loading && !isEditing">
            <a href="#" @click.prevent="scrollToTop">🔝 回到最顶上</a>
        </div>

        <div class="footer-beian">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ icpNumber }}</a>
            <span class="sep">|</span>
            <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">{{ policeNumber }}</a>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
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

const icpNumber = import.meta.env.VITE_ICP_NUMBER || '沪ICP备备2026XXXX号';
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || '沪公网安备 3101150200XXXX号';

// ===== 阅读模式渲染 =====
const renderedContent = computed(() => {
    if (!pageData.value?.content) return '';
    let html = marked.parse(pageData.value.content, { async: false }) as string;
    html = html.replace(/<h2/g, '</div><div class="markdown-section"><h2');
    html = html.replace(/^<\/div><div class="markdown-section"><h2/, '<div class="markdown-section"><h2');
    if (/markdown-section/.test(html)) html += '</div>';
    return DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'], ADD_TAGS: ['img'] });
});

const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

// 时间显示精确到秒
const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日 ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

// 头像
const getAvatarUrl = (name: string) => {
    if (!name) return '';
    return `/api/users/${encodeURIComponent(name)}/avatar`;
};
function handleAvatarError(e: Event) {
    const img = e.target as HTMLImageElement;
    img.src = '/res/imge/default-avatar.png';
    img.onerror = null;
}

const statusLabel = (s: number): string =>
    ({ 0: '已删除', 1: '审核中', 2: '已发布', 3: '完全开放', 4: '草稿' })[s] || '未知';

// ===== 获取数据 =====
async function fetchPage() {
    const id = route.params.id;
    if (!id) { error.value = '页面不存在'; loading.value = false; return; }
    loading.value = true;
    error.value = '';
    isAuthError.value = false;
    pageData.value = null;
    try {
        const res = await authFetch(`/api/pages/${id}`);
        if (res.status === 404) { error.value = '页面不存在'; return; }
        if (res.status === 401) { error.value = '请先登录后再查看此页面'; isAuthError.value = true; return; }
        if (res.status === 403) { error.value = '你没有权限查看此页面'; return; }
        if (!res.ok) { error.value = '加载失败，请稍后重试'; return; }
        pageData.value = await res.json();
        document.title = pageData.value.title;
        try {
            const token = localStorage.getItem('authToken');
            if (token) {
                const payload = JSON.parse(atob(token.split('.')[1]));
                isAuthor.value = payload.userId === pageData.value.author_id || payload.role === 'ADMIN';
            }
        } catch { /* */ }
    } catch {
        error.value = '网络错误，请检查网络连接后重试';
    } finally { loading.value = false; }
}

function getUserId(): number | null {
    try {
        const token = localStorage.getItem('authToken');
        if (!token) return null;
        return JSON.parse(atob(token.split('.')[1])).userId;
    } catch { return null; }
}

// ===== 编辑模式 =====
function enterEditMode() {
    editTitle.value = pageData.value.title;
    const userId = getUserId();
    if (userId) {
        const cache = loadEditCache(pageData.value.id, userId);
        if (cache && !isCacheStale(cache, pageData.value.updated_at)) {
            if (confirm('检测到未保存的编辑，是否恢复？')) {
                editSections.value = cache.sections;
                isEditing.value = true;
                return;
            } else { clearEditCache(pageData.value.id, userId); }
        }
    }
    editSections.value = parseSections(pageData.value.content);
    isEditing.value = true;
    window.scrollTo({ top: 0 });
}

function onSectionChange(idx: number) { saveToLocal(); }
function addSection(index: number) { editSections.value = insertSection(editSections.value, index); saveToLocal(); }
function removeSection(index: number) {
    if (!confirm('确定删除此段落？')) return;
    editSections.value = removeSectionUtil(editSections.value, index);
    saveToLocal();
}
function onUndo(idx: number) {
    const prev = undoSection(editSections.value[idx]);
    if (prev) { const c = [...editSections.value]; c[idx] = prev; editSections.value = c; saveToLocal(); }
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
    const url = prompt('输入链接地址：', 'https://');
    if (url) wrapText(idx, '[', `](${url})`);
}
function insertImage(idx: number) {
    const url = prompt('输入图片地址：', '/resource/users/');
    if (!url) return;
    editSections.value[idx].content += `\n![${prompt('输入图片描述：', '图片') || '图片'}](${url})`;
    saveToLocal();
}

function saveToLocal() {
    const uid = getUserId();
    if (!uid || !pageData.value) return;
    saveEditCache({ pageId: pageData.value.id, sections: editSections.value, savedAt: Date.now(), userId: uid, originalUpdatedAt: pageData.value.updated_at });
}
function clearCache() {
    const uid = getUserId();
    if (uid && pageData.value) clearEditCache(pageData.value.id, uid);
}

async function submitForReview() {
    if (!confirm('提交后页面将进入审核状态，确定提交？')) return;
    saving.value = true;
    try {
        const merged = mergeSections(editSections.value);
        const sr = await authFetch(`/api/pages/${pageData.value.id}`, { method: 'PUT', body: JSON.stringify({ title: editTitle.value, content: merged }) });
        if (!sr.ok) { const e = await sr.json(); alert('保存失败：' + (e.error || '')); return; }
        const st = await authFetch(`/api/pages/${pageData.value.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 1 }) });
        if (!st.ok) { alert('状态更新失败'); return; }
        clearCache(); await fetchPage(); isEditing.value = false; alert('已提交审核');
    } finally { saving.value = false; }
}

async function saveAsDraft() {
    saving.value = true;
    try {
        const merged = mergeSections(editSections.value);
        const sr = await authFetch(`/api/pages/${pageData.value.id}`, { method: 'PUT', body: JSON.stringify({ title: editTitle.value, content: merged }) });
        if (!sr.ok) { const e = await sr.json(); alert('保存失败：' + (e.error || '')); return; }
        const st = await authFetch(`/api/pages/${pageData.value.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 4 }) });
        if (!st.ok) { alert('状态更新失败'); return; }
        clearCache(); await fetchPage(); isEditing.value = false; alert('已保存为草稿');
    } finally { saving.value = false; }
}

function confirmDiscard() {
    if (!confirm('放弃所有未保存的修改？')) return;
    clearCache(); isEditing.value = false; editingSectionIdx.value = -1;
}

onMounted(() => { fetchPage(); });
</script>

<style scoped>
* { box-sizing: border-box; }
.page-view { min-height: 100vh; background: var(--bg-color, #f5f7fa); padding: 40px 20px 100px; position: relative; }
.theme-toggle { position: fixed; top: 20px; right: 20px; z-index: 100; }
.container { max-width: 900px; margin: 0 auto; background: var(--card-bg, #ffffff); border-radius: 24px; box-shadow: var(--shadow, 0 20px 35px -10px rgba(0,0,0,0.1)); padding: 40px 32px; }

.state-card { text-align: center; padding: 64px 24px; }
.state-icon { font-size: 48px; display: block; margin-bottom: 16px; }
.state-text { font-size: 16px; color: var(--text-secondary, #6c757d); margin-bottom: 20px; }
.btn-retry { padding: 8px 28px; border: 1px solid var(--button-bg, #42b983); background: transparent; color: var(--button-bg, #42b983); border-radius: 48px; font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-retry:hover { background: var(--button-bg, #42b983); color: #fff; }
.spinner { width: 36px; height: 36px; border: 3px solid var(--input-border, #e2e8f0); border-top-color: var(--button-bg, #42b983); border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 16px; }
@keyframes spin { to { transform: rotate(360deg); } }

.top-nav-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid var(--input-border, #e2e8f0); }
.nav-link { font-size: 14px; font-weight: 600; text-decoration: none; transition: opacity 0.2s; cursor: pointer; background: none; border: none; }
.nav-link.back-prev { color: var(--text-secondary, #6c757d); }
.nav-link.back-home { color: var(--button-bg, #42b983); }
.nav-link:hover { opacity: 0.7; text-decoration: underline; }
.btn-edit { color: var(--button-bg, #42b983); font-size: 14px; padding: 4px 14px; border: 1px solid var(--button-bg, #42b983); border-radius: 48px; }
.btn-edit:hover { background: var(--button-bg, #42b983); color: #fff; text-decoration: none; }
.edit-nav-bar { flex-wrap: wrap; gap: 8px; }
.nav-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; flex: 1; }
.act-btn { padding: 6px 16px; border-radius: 48px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.2s; }
.act-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.act-submit { background: var(--button-bg, #42b983); color: #fff; }
.act-submit:hover:not(:disabled) { background: #2c6e4f; }
.act-draft { border-color: var(--button-bg, #42b983); color: var(--button-bg, #42b983); background: transparent; }
.act-draft:hover:not(:disabled) { background: rgba(66,185,131,0.08); }
.act-discard { border-color: #ef4444; color: #ef4444; background: transparent; }
.act-discard:hover:not(:disabled) { background: #fef2f2; }

.title { text-align: center; font-size: 28px; font-weight: 700; background: linear-gradient(135deg, var(--text-primary, #1f2d3d) 0%, var(--button-bg, #42b983) 100%); background-clip: text; -webkit-background-clip: text; color: transparent; margin-bottom: 12px; }

/* ===== 元信息栏：作者+时间+状态 ===== */
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
.markdown-body :deep(img) { max-width: 100%; height: auto; display: block; margin: 20px auto; border-radius: 20px; box-shadow: 0 6px 14px rgba(0,0,0,0.08); }
.markdown-body :deep(blockquote) { margin: 16px 0; padding: 12px 20px; background: var(--code-bg, #f1f5f9); border-left: 4px solid var(--button-bg, #42b983); border-radius: 8px; }
.markdown-body :deep(code) { background: var(--code-bg, #f1f5f9); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
.markdown-body :deep(pre) { background: var(--code-bg, #f1f5f9); padding: 16px 20px; border-radius: 16px; overflow-x: auto; }
.markdown-body :deep(table) { width: 100%; border-collapse: collapse; }
.markdown-body :deep(th), .markdown-body :deep(td) { padding: 10px 14px; border: 1px solid var(--input-border, #e2e8f0); text-align: left; }
.markdown-body :deep(hr) { border: none; border-top: 1px solid var(--input-border, #e2e8f0); margin: 28px 0; }

.edit-title-row { margin-bottom: 24px; }
.edit-title-input { width: 100%; font-size: 24px; font-weight: 700; border: none; border-bottom: 2px solid var(--input-border, #e2e8f0); padding: 8px 4px; background: transparent; color: var(--text-primary, #1f2d3d); outline: none; }
.edit-title-input:focus { border-bottom-color: var(--button-bg, #42b983); }
.edit-sections { margin-bottom: 24px; }
.edit-section-wrapper { margin-bottom: 0; }
.btn-insert-section { width: 100%; padding: 10px; margin: 8px 0; border: 2px dashed var(--input-border, #e2e8f0); border-radius: 12px; background: transparent; color: var(--text-muted, #adb5bd); font-size: 14px; cursor: pointer; transition: all 0.2s; }
.btn-insert-section:hover { border-color: var(--button-bg, #42b983); color: var(--button-bg, #42b983); background: rgba(66,185,131,0.05); }
.edit-section { background: var(--bg-secondary, #f8f9fa); border-radius: 16px; padding: 20px 24px; margin-bottom: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.edit-preamble { background: var(--bg-secondary, #f8f9fa); border-radius: 16px; padding: 16px 20px; margin-bottom: 4px; }
.edit-heading-row { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.edit-heading-prefix { font-size: 14px; font-weight: 700; color: var(--button-bg, #42b983); opacity: 0.6; }
.edit-heading-input { flex: 1; font-size: 20px; font-weight: 600; border: none; border-bottom: 1px dashed transparent; padding: 4px 0; background: transparent; color: var(--text-primary, #1f2d3d); outline: none; }
.edit-heading-input:focus { border-bottom-color: var(--button-bg, #42b983); }
.btn-icon { background: none; border: none; cursor: pointer; font-size: 16px; padding: 4px 6px; border-radius: 6px; opacity: 0.5; transition: opacity 0.2s; }
.btn-icon:hover { opacity: 1; background: rgba(0,0,0,0.05); }
.btn-danger:hover { background: #fee2e2; }
.edit-toolbar { display: flex; gap: 6px; padding: 8px 0; margin-bottom: 8px; flex-wrap: wrap; }
.tb-btn { padding: 4px 12px; border: 1px solid var(--input-border, #e2e8f0); border-radius: 6px; background: var(--card-bg, #fff); cursor: pointer; font-size: 13px; color: var(--text-primary, #1f2d3d); transition: all 0.15s; }
.tb-btn:hover { border-color: var(--button-bg, #42b983); color: var(--button-bg, #42b983); }
.tb-sep { border-color: var(--button-bg, #42b983); background: var(--button-bg, #42b983); color: #fff; }
.edit-content-wrap { position: relative; }
.edit-textarea { width: 100%; border: 1px solid var(--input-border, #e2e8f0); border-radius: 12px; padding: 12px 14px; font-size: 14px; line-height: 1.65; font-family: inherit; background: var(--card-bg, #fff); color: var(--text-primary, #1f2d3d); resize: vertical; outline: none; transition: border-color 0.2s; }
.edit-textarea:focus, .edit-focused { border-color: var(--button-bg, #42b983); }
.btn-edit-float { position: absolute; top: 8px; right: 8px; background: var(--card-bg, #fff); border: 1px solid var(--input-border, #e2e8f0); border-radius: 8px; padding: 4px 10px; cursor: pointer; font-size: 14px; opacity: 0.6; transition: opacity 0.2s; }
.btn-edit-float:hover { opacity: 1; }

.back-link { text-align: center; margin-top: 48px; padding-top: 28px; border-top: 1px solid var(--input-border, #e2e8f0); }
.back-link a { color: var(--button-bg, #42b983); text-decoration: none; font-weight: 600; transition: all 0.2s; font-size: 15px; }
.back-link a:hover { opacity: 0.75; text-decoration: underline; letter-spacing: 0.3px; }
.footer-beian { position: absolute; bottom: 20px; left: 0; right: 0; text-align: center; font-size: 12px; color: var(--text-secondary, #6c757d); z-index: 1; }
.footer-beian a { color: inherit; text-decoration: none; }
.footer-beian a:hover { opacity: 0.7; text-decoration: underline; }
.footer-beian .sep { margin: 0 8px; color: var(--text-muted, #adb5bd); }

html[data-theme="dark"] .page-view, html.dark .page-view, .dark .page-view {
    --text-primary: #f3f4f6 !important; --text-secondary: #d1d5db !important; --text-muted: #9ca3af !important;
    --card-bg: #1f2937 !important; --bg-color: #111827 !important; --bg-secondary: #1e293b !important;
    --input-border: #374151 !important; --code-bg: #00000066 !important;
}
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
    .edit-nav-bar { flex-direction: column; gap: 6px; }
    .nav-actions { width: 100%; justify-content: center; }
    .act-btn { font-size: 12px; padding: 5px 12px; }
}
</style>

<!-- markdown-section 背景框样式（非 scoped） -->
<style>
.markdown-section { background: var(--bg-secondary, #f8f9fa); border-radius: 16px; padding: 24px 28px; margin-bottom: 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
.markdown-section:last-child { margin-bottom: 0; }
html[data-theme="dark"] .markdown-section { background: #1e293b !important; box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important; }
</style>
