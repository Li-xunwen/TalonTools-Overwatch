<template>
    <div class="page-view">
        <ThemeToggle class="theme-toggle" />

        <!-- ==================== 加载中 ==================== -->
        <div class="container" v-if="loading">
            <div class="state-card">
                <div class="spinner"></div>
                <p class="state-text">页面加载中…</p>
            </div>
        </div>

        <!-- ==================== 错误/无权限 ==================== -->
        <div class="container" v-else-if="error">
            <div class="state-card error-card">
                <span class="state-icon">⚠️</span>
                <p class="state-text">{{ error }}</p>
                <button class="btn-retry" @click="fetchPage">重试</button>
            </div>
        </div>

        <!-- ==================== 正常展示 ==================== -->
        <div class="container" v-else-if="pageData">
            <div class="top-nav-bar">
                <a href="javascript:void(0)" @click="$router.back()" class="nav-link back-prev">
                    ← 返回上一页
                </a>
                <router-link to="/main" class="nav-link back-home">
                    返回首页 →
                </router-link>
            </div>

            <h1 class="title">{{ pageData.title }}</h1>

            <div class="meta-info">
                <span class="meta-author">👤 {{ pageData.author_name }}</span>
                <span class="meta-sep">|</span>
                <span class="meta-date">📅 {{ formatDate(pageData.updated_at) }}</span>
            </div>

            <!-- Markdown 渲染内容 -->
            <div class="markdown-body" v-html="renderedContent"></div>
        </div>

        <!-- 回到顶部 -->
        <div class="back-link" v-if="pageData && !loading">
            <a href="#" @click.prevent="scrollToTop">🔝 回到最顶上</a>
        </div>

        <!-- 备案信息 -->
        <div class="footer-beian">
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
                {{ icpNumber }}
            </a>
            <span class="sep">|</span>
            <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">
                {{ policeNumber }}
            </a>
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

const route = useRoute();
const loading = ref(true);
const error = ref('');
const pageData = ref<any>(null);

const icpNumber = import.meta.env.VITE_ICP_NUMBER || '沪ICP备备2026XXXX号';
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || '沪公网安备 3101150200XXXX号';

/** Markdown → HTML → 按 h2 分段包裹 → 安全过滤 */
const renderedContent = computed(() => {
    if (!pageData.value?.content) return '';
    let html = marked.parse(pageData.value.content, { async: false }) as string;

    // 将每个 <h2> 及其后续内容包进 <div class="markdown-section">
    html = html.replace(/<h2/g, '</div><div class="markdown-section"><h2');
    html = html.replace(/^<\/div><div class="markdown-section"><h2/, '<div class="markdown-section"><h2');
    if (/markdown-section/.test(html)) {
        html = html + '</div>';
    }

    return DOMPurify.sanitize(html, {
        ADD_ATTR: ['target', 'rel'],
        ADD_TAGS: ['img'],
    });
});

const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`;
};

async function fetchPage() {
    const id = route.params.id;
    if (!id) {
        error.value = '页面不存在';
        loading.value = false;
        return;
    }

    loading.value = true;
    error.value = '';
    pageData.value = null;

    try {
        const res = await authFetch(`/api/pages/${id}`);

        if (res.status === 404) {
            error.value = '页面不存在';
            return;
        }
        if (res.status === 401) {
            error.value = '请先登录后再查看此页面';
            return;
        }
        if (res.status === 403) {
            error.value = '你没有权限查看此页面';
            return;
        }
        if (!res.ok) {
            error.value = '加载失败，请稍后重试';
            return;
        }

        pageData.value = await res.json();
        document.title = pageData.value.title;
    } catch {
        error.value = '网络错误，请检查网络连接后重试';
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    fetchPage();
});
</script>

<style scoped>
/* ============ 基础布局 ============ */
* {
    box-sizing: border-box;
}

.page-view {
    min-height: 100vh;
    background: var(--bg-color, #f5f7fa);
    padding: 40px 20px 80px;
    position: relative;
}

.theme-toggle {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 100;
}

.container {
    max-width: 900px;
    margin: 0 auto;
    background: var(--card-bg, #ffffff);
    border-radius: 24px;
    box-shadow: var(--shadow, 0 20px 35px -10px rgba(0, 0, 0, 0.1));
    padding: 40px 32px;
}

/* ============ 状态组件（加载 / 错误） ============ */
.state-card {
    text-align: center;
    padding: 64px 24px;
}

.state-icon {
    font-size: 48px;
    display: block;
    margin-bottom: 16px;
}

.state-text {
    font-size: 16px;
    color: var(--text-secondary, #6c757d);
    margin-bottom: 20px;
}

.btn-retry {
    padding: 8px 28px;
    border: 1px solid var(--button-bg, #42b983);
    background: transparent;
    color: var(--button-bg, #42b983);
    border-radius: 48px;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn-retry:hover {
    background: var(--button-bg, #42b983);
    color: #fff;
}

/* 加载旋转动画 */
.spinner {
    width: 36px;
    height: 36px;
    border: 3px solid var(--input-border, #e2e8f0);
    border-top-color: var(--button-bg, #42b983);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin: 0 auto 16px;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* ============ 顶部导航栏 ============ */
.top-nav-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    padding-bottom: 12px;
    border-bottom: 1px solid var(--input-border, #e2e8f0);
}

.nav-link {
    font-size: 14px;
    font-weight: 600;
    text-decoration: none;
    transition: opacity 0.2s;
    cursor: pointer;
    background: none;
    border: none;
}

.nav-link.back-prev {
    color: var(--text-secondary, #6c757d);
}

.nav-link.back-home {
    color: var(--button-bg, #42b983);
}

.nav-link:hover {
    opacity: 0.7;
    text-decoration: underline;
}

/* ============ 标题与元信息 ============ */
.title {
    text-align: center;
    font-size: 28px;
    font-weight: 700;
    background: linear-gradient(135deg, var(--text-primary, #1f2d3d) 0%, var(--button-bg, #42b983) 100%);
    background-clip: text;
    -webkit-background-clip: text;
    color: transparent;
    margin-bottom: 12px;
}

.meta-info {
    text-align: center;
    font-size: 14px;
    color: var(--text-secondary, #6c757d);
    margin-bottom: 32px;
    border-bottom: 1px solid var(--input-border, #e2e8f0);
    padding-bottom: 16px;
}

.meta-sep {
    margin: 0 10px;
    color: var(--text-muted, #adb5bd);
}

/* ============ Markdown 内容样式 ============ */
.markdown-body {
    font-size: 15px;
    line-height: 1.75;
    color: var(--text-primary, #1f2d3d);
}

.markdown-body :deep(h1),
.markdown-body :deep(h3),
.markdown-body :deep(h4) {
    font-weight: 600;
    color: var(--text-primary, #1f2d3d);
    margin-top: 32px;
    margin-bottom: 16px;
    padding-left: 12px;
    border-left: 5px solid var(--button-bg, #42b983);
}

/* 二级标题：背景框 + 上下隔开（参考 MinecraftHelp 风格） */
/* 每个 h2 区块的背景框 */
.markdown-body :deep(.markdown-section) {
    background: var(--bg-secondary, #f8f9fa);
    border-radius: 16px;
    padding: 24px 28px;
    margin-bottom: 28px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.markdown-body :deep(h2) {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary, #1f2d3d);
    margin-top: 0;
    margin-bottom: 18px;
    padding: 0 0 0 12px;
    border-left: 5px solid var(--button-bg, #42b983);
}

.markdown-body :deep(.markdown-section):last-child {
    margin-bottom: 0;
}

.markdown-body :deep(h2:first-child) {
    margin-top: 0;
}

.markdown-body :deep(h3) {
    font-size: 18px;
}

.markdown-body :deep(p) {
    margin-bottom: 12px;
    color: var(--text-secondary, #4b5563);
    line-height: 1.65;
}

.markdown-body :deep(ul),
.markdown-body :deep(ol) {
    padding-left: 24px;
    margin: 12px 0;
}

.markdown-body :deep(li) {
    margin-bottom: 10px;
}

.markdown-body :deep(a) {
    color: var(--button-bg, #42b983);
    text-decoration: none;
    font-weight: 500;
}

.markdown-body :deep(a):hover {
    text-decoration: underline;
}

.markdown-body :deep(img) {
    max-width: 100%;
    height: auto;
    display: block;
    margin: 20px auto;
    border-radius: 20px;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.08);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.markdown-body :deep(img):hover {
    transform: translateY(-3px);
    box-shadow: 0 12px 24px -10px rgba(0, 0, 0, 0.15);
}

.markdown-body :deep(blockquote) {
    margin: 16px 0;
    padding: 12px 20px;
    background: var(--code-bg, #f1f5f9);
    border-left: 4px solid var(--button-bg, #42b983);
    border-radius: 8px;
    color: var(--text-secondary, #4b5563);
}

.markdown-body :deep(code) {
    background: var(--code-bg, #f1f5f9);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
    color: var(--text-primary, #1f2d3d);
}

.markdown-body :deep(pre) {
    background: var(--code-bg, #f1f5f9);
    padding: 16px 20px;
    border-radius: 16px;
    overflow-x: auto;
    margin: 16px 0;
}

.markdown-body :deep(pre) code {
    background: none;
    padding: 0;
}

.markdown-body :deep(table) {
    width: 100%;
    border-collapse: collapse;
    margin: 16px 0;
}

.markdown-body :deep(th),
.markdown-body :deep(td) {
    padding: 10px 14px;
    border: 1px solid var(--input-border, #e2e8f0);
    text-align: left;
}

.markdown-body :deep(th) {
    background: var(--code-bg, #f1f5f9);
    font-weight: 600;
}

.markdown-body :deep(hr) {
    border: none;
    border-top: 1px solid var(--input-border, #e2e8f0);
    margin: 28px 0;
}

/* ============ 回到顶部 & 备案 ============ */
.back-link {
    text-align: center;
    margin-top: 48px;
    padding-top: 28px;
    border-top: 1px solid var(--input-border, #e2e8f0);
}

.back-link a {
    color: var(--button-bg, #42b983);
    text-decoration: none;
    font-weight: 600;
    transition: all 0.2s;
    font-size: 15px;
}

.back-link a:hover {
    opacity: 0.75;
    text-decoration: underline;
    letter-spacing: 0.3px;
}

.footer-beian {
    position: absolute;
    bottom: 20px;
    left: 0;
    right: 0;
    text-align: center;
    font-size: 12px;
    color: var(--text-secondary, #6c757d);
    background: transparent;
    z-index: 1;
}

.footer-beian a {
    color: inherit;
    text-decoration: none;
    transition: opacity 0.2s;
}

.footer-beian a:hover {
    opacity: 0.7;
    text-decoration: underline;
}

.footer-beian .sep {
    margin: 0 8px;
    color: var(--text-muted, #adb5bd);
}

/* ============ 深色模式适配 ============ */
html[data-theme="dark"] .page-view,
html.dark .page-view,
.dark .page-view {
    --text-primary: #f3f4f6 !important;
    --text-secondary: #d1d5db !important;
    --text-muted: #9ca3af !important;
    --card-bg: #1f2937 !important;
    --bg-color: #111827 !important;
    --input-border: #374151 !important;
    --code-bg: #00000066 !important;
}

html[data-theme="dark"] .markdown-body :deep(p),
html[data-theme="dark"] .markdown-body :deep(li),
html[data-theme="dark"] .state-text {
    color: var(--text-secondary, #d1d5db) !important;
}

html[data-theme="dark"] .markdown-body :deep(h1),
html[data-theme="dark"] .markdown-body :deep(h3),
html[data-theme="dark"] .markdown-body :deep(h4),
html[data-theme="dark"] .title {
    color: var(--text-primary, #f3f4f6) !important;
}

html[data-theme="dark"] .markdown-body :deep(.markdown-section) {
    background: #1e293b !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15) !important;
}

html[data-theme="dark"] .markdown-body :deep(h2) {
    color: var(--text-primary, #f3f4f6) !important;
    border-left-color: #5fcb97 !important;
}

html[data-theme="dark"] .markdown-body :deep(code),
html[data-theme="dark"] .markdown-body :deep(pre) {
    background: #1e293b !important;
}

html[data-theme="dark"] .container {
    background: #1f2937 !important;
}

/* ============ 响应式 ============ */
@media (max-width: 760px) {
    .container {
        padding: 24px 20px;
    }

    .title {
        font-size: 24px;
    }

    .markdown-body :deep(h2) {
        font-size: 19px;
    }
}
</style>
