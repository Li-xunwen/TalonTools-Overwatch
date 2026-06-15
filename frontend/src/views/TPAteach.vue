<template>
    <div class="tutorial-page">
        <ThemeToggle class="theme-toggle" />
        <div class="privacy-container">
            <!-- 新增顶部导航栏：左返回上一页，右返回首页 -->
            <div class="top-nav-bar">
                <a href="javascript:void(0)" @click="$router.back()" class="nav-link back-prev">
                    返回上一页
                </a>
                <router-link to="/main" class="nav-link back-home">
                    返回首页
                </router-link>
            </div>
            <h1 class="title">TP(传送指令教程)</h1>


            <!-- 1. 输入TPA指令 -->
            <section class="section">
                <h2>1. 输入TPA指令</h2>
                <figure class="image-card">
                    <p><strong>当你想tp其他玩家的时候 输入 /trigger TPA 然后回车发送</strong></p>
                    <img src="/public/minecraft/TPAstep1.png" alt="输入TPA指令" loading="lazy">
                    <p>小提示：当系统出现符合你需要的指令时按TAB键自动补全</p>
                </figure>
            </section>

            <!-- 2. 点击你想tp的玩家 -->
            <section class="section">
                <h2>2. 点击你想tp的玩家</h2>
                <figure class="image-card">
                    <p><strong>出现玩家列表时候按T键变成鼠标点击你想tp的玩家</strong></p>
                    <img src="/public/minecraft/TPAstep2.png" alt="点击你想tp的玩家" loading="lazy">
                </figure>
            </section>

            <!-- 被TP（传输）视角： -->
            <section class="section">
                <h2>被TP（传输）视角：</h2>
                <figure class="image-card">
                    <p><strong>被TP玩家只需要按T点击绿色字体即可同意TP</strong></p>
                    <img src="/public/minecraft/TPAstep3.png" alt="点击你想tp的玩家" loading="lazy">
                </figure>
            </section>

        </div>

        <div class="back-link">
            <a href="#" @click.prevent="scrollToTop">🔝 回到最顶上</a>
        </div>
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
import ThemeToggle from "@/components/ThemeToggle.vue";

const icpNumber = import.meta.env.VITE_ICP_NUMBER || "沪ICP备备2026XXXX号";
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || "沪公网安备 3101150200XXXX号";
const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

</script>

<style scoped>
* {
    box-sizing: border-box;
}

.tutorial-page {
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

.privacy-container {
    max-width: 900px;
    margin: 0 auto;
    background: var(--card-bg, #ffffff);
    border-radius: 24px;
    box-shadow: var(--shadow, 0 20px 35px -10px rgba(0, 0, 0, 0.1));
    padding: 40px 32px;
}

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

.update-time {
    text-align: center;
    font-size: 14px;
    color: var(--text-secondary, #6c757d);
    margin-bottom: 32px;
    border-bottom: 1px solid var(--input-border, #e2e8f0);
    padding-bottom: 16px;
}

.section {
    margin-bottom: 38px;
}

.section h2 {
    font-size: 22px;
    font-weight: 600;
    color: var(--text-primary, #1f2d3d);
    margin-bottom: 18px;
    padding-left: 12px;
    border-left: 5px solid var(--button-bg, #42b983);
}

.section p,
.section li {
    font-size: 15px;
    line-height: 1.65;
    color: var(--text-secondary, #4b5563);
    margin-bottom: 12px;
}

.section ul {
    padding-left: 24px;
    margin: 12px 0;
}

.section li {
    margin-bottom: 10px;
}

/* 图片卡片样式 */
.image-card {
    background: var(--card-bg, #f9fafb);
    border-radius: 5px;
    overflow: hidden;
    box-shadow: 0 6px 14px rgba(0, 0, 0, 0.05);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    margin-bottom: 24px;
}

.image-card:hover {
    transform: translateY(-5px);
    box-shadow: 0 15px 30px -12px rgba(0, 0, 0, 0.15);
}

.image-card img {
    width: 100%;
    height: auto;
    display: block;
    object-fit: contain;
    background: var(--bg-secondary, #f9fafb);
    border-bottom: 1px solid var(--border-color, #e9ecef);
}

.image-card figcaption {
    padding: 12px 12px 14px;
    font-size: 13px;
    font-weight: 500;
    text-align: center;
    color: var(--text-primary, #374151);
    background: var(--bg-secondary, #ffffff);
}

.image-card p {
    padding: 12px 12px 0 12px;
    margin: 0;
}

.separator {
    text-align: center;
    color: var(--text-muted, #aaa);
    margin: 16px 0;
}

/* 下载按钮样式 */
.download-link-wrapper {
    margin: 16px 0;
}

.download-sample-btn {
    display: inline-block;
    background: var(--button-bg, #42b983);
    color: white;
    padding: 12px 28px;
    border-radius: 48px;
    text-decoration: none;
    font-weight: 700;
    font-size: 1rem;
    transition: all 0.2s ease;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.download-sample-btn:hover {
    background: #2c6e4f;
    transform: translateY(-2px);
    box-shadow: 0 8px 16px rgba(0, 0, 0, 0.15);
}

.tip-text {
    background: var(--code-bg, #f1f5f9);
    padding: 10px 16px;
    border-radius: 16px;
    font-size: 13px;
    color: var(--text-secondary, #2c3e50);
    margin-top: 12px;
}

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

/* 顶部导航栏 */
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

/* 深色模式适配 */
html[data-theme="dark"] .nav-link.back-prev {
    color: #adb5bd;
}

html[data-theme="dark"] .nav-link.back-home {
    color: #5fcb97;
}

/* ========== 深色模式字体亮度增强 ========== */
/* 假设主题切换器会在 html 或 body 上添加 data-theme="dark" 或 class="dark" */
html[data-theme="dark"] .tutorial-page,
html.dark .tutorial-page,
.dark .tutorial-page {
    --text-primary: #f3f4f6 !important;
    /* 主文字更亮 */
    --text-secondary: #d1d5db !important;
    /* 次级文字亮灰色 */
    --text-muted: #9ca3af !important;
    --card-bg: #1f2937 !important;
    --bg-secondary: #111827 !important;
    --input-border: #374151 !important;
    --border-color: #374151 !important;
    --code-bg: #00000066 !important;
}

/* 同时确保具体元素的文字颜色使用 var，已自动继承 */
html[data-theme="dark"] .section p,
html[data-theme="dark"] .section li,
html[data-theme="dark"] .image-card figcaption,
html[data-theme="dark"] .tip-text,
html[data-theme="dark"] .update-time,
html[data-theme="dark"] .separator,
html[data-theme="dark"] .back-link a {
    color: var(--text-secondary, #d1d5db) !important;
}

html[data-theme="dark"] .section h2,
html[data-theme="dark"] .title,
html[data-theme="dark"] .image-card p strong {
    color: var(--text-primary, #f3f4f6) !important;
}

/* 针对图片说明特殊处理 */
html[data-theme="dark"] .image-card figcaption {
    background: #1e293b !important;
    border-top: 1px solid #334155;
}

html[data-theme="dark"] .download-sample-btn {
    background: #2d7a4b;
    color: #f9fafb;
}

html[data-theme="dark"] .download-sample-btn:hover {
    background: #1e5a3a;
}

/* 响应式适配 */
@media (max-width: 760px) {
    .privacy-container {
        padding: 24px 20px;
    }

    .title {
        font-size: 24px;
    }

    .section h2 {
        font-size: 19px;
    }

    .download-sample-btn {
        width: 100%;
        text-align: center;
    }
}
</style>