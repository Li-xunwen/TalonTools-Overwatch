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
            <h1 class="title">⛏️ Minecraft黑爪服安装教程</h1>
            <div class="update-time">📅 整合包版本：v1.0.2 | 最后更新：2026年6月15日</div>

            <!-- 0. 教程简介（改为 Minecraft 相关） -->
            <section class="section">
                <h2>🎮 欢迎来到黑爪我的世界服务器</h2>
                <p>本教程将引导你通过 <strong>PCL2 启动器</strong> 一键安装黑爪专属整合包，快速加入我们的生存服务器。</p>
            </section>

            <!-- 1. 下载PCL2整合包 -->
            <section class="section">
                <h2>1. 📥下载PCL2整合包</h2>
                <div class="download-link-wrapper">
                    <a href="https://talon-public-1258609989.cos.ap-chongqing.myqcloud.com/PCL2%E9%BB%91%E7%88%AA1.0.zip"
                        class="download-sample-btn" target="_blank" rel="noopener noreferrer">
                        🎯 点击下载PCL2
                    </a>
                </div>
                 <router-link to="/TPAteach" class="mc-btn secondary">
                        TPA(传送指令教程)
                    </router-link>
                    、
                    <a href="https://www.mcmod.cn/class/1483.html" target="_blank" rel="noopener noreferrer">
                      世界地图模组百科
                    </a>
                    、
                    <a href="https://www.mcmod.cn/class/4104.html" target="_blank" rel="noopener noreferrer">
                      背包整理模组百科
                    </a>
                    
                <!-- <a href="https://talon-public-1258609989.cos.ap-chongqing.myqcloud.com/%E9%98%BF%E9%9C%9C%E6%95%B4%E5%90%88%E5%8C%85v1.0.zip"
                    class="download-sample-btn" target="_blank" rel="noopener noreferrer">
                    (可选)点击下载阿霜模组整合包
                </a>
                <p>
                    阿霜模组整合包内置了
                    <a href="https://www.mcmod.cn/class/5009.html" target="_blank" rel="noopener noreferrer">
                        遥远地平线
                    </a>
                    、小地图以及客户端优化模组。
                    <router-link to="/AShuangmod" class="mc-btn secondary">
                        导入教程
                    </router-link>
                </p> -->
            </section>

            <!-- 2. 解压 -->
            <section class="section">
                <h2>2. 📂 解压到需要安装的目录</h2>
                <figure class="image-card">
                    <p>a.例如下图，将整合包移动到 D 盘 Game 文件夹内。<strong>右键选择“全部解压缩”</strong></p>
                    <img src="/public/minecraft/step2.png" alt="解压步骤-复制压缩包" loading="lazy">
                </figure>
                <p class="separator">——————————————</p>
                <figure class="image-card">
                    <p><strong>b. 直接点击提取</strong></p>
                    <img src="/public/minecraft/step3.png" alt="解压步骤-解压压缩包" loading="lazy">
                </figure>
            </section>

            <!-- 3.运行 -->
            <section class="section">
                <h2>3. 🚀 运行 PCL2 启动器</h2>
                <figure class="image-card">
                    <img src="/public/minecraft/step4.png" alt="双击启动器图标" loading="lazy">
                    <figcaption>打开解压后的文件夹，双击 <code>Plain Craft Launcher 2.exe</code> 即可运行。</figcaption>
                </figure>
                <p class="separator">————————可选操作————————</p>
                <figure class="image-card">
                    <p><strong>添加桌面快捷方式：</strong>右键启动器 → “显示更多选项” → “发送到” → “桌面快捷方式”。</p>
                    <img src="/public/minecraft/step5.png" alt="创建快捷方式-右键菜单" loading="lazy">
                </figure>
                <figure class="image-card">
                    <p>选择“桌面快捷方式”即可。</p>
                    <img src="/public/minecraft/step6.png" alt="发送到桌面快捷方式" loading="lazy">
                </figure>
            </section>

            <!-- 4.改ID -->
            <section class="section">
                <h2>4. ✏️ 修改你的游戏ID</h2>
                <figure class="image-card">
                    <img src="/public/minecraft/step7.png" alt="修改ID界面" loading="lazy">
                    <figcaption>启动器内点击“设置” → “游戏外昵称”，输入你心仪的ID（仅支持英文、数字、下划线）。</figcaption>
                </figure>
            </section>

            <!-- 5.享受 -->
            <section class="section">
                <h2>5. 🎉 开始享受！</h2>
                <figure class="image-card">
                    <img src="/public/minecraft/enjoy.jpg" alt="游戏内截图" loading="lazy">
                    <!-- <figcaption>点击“启动游戏”，输入服务器地址 <code>play.heizhao.com</code> 即可加入黑爪世界！</figcaption> -->
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
    border-radius: 20px;
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
    aspect-ratio: 16 / 9;
    object-fit: cover;
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