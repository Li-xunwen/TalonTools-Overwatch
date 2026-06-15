<template>
  <div class="join-play news-page">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">⚡ 黑爪服务器 | 我的世界专区 ⚡</div>

      <!-- 修改后的 Minecraft 安装版面（原 coming-soon-section） -->
      <div class="section minecraft-section">
        <h2 class="section-title">⛏️ 我的世界 (Minecraft) 安装</h2>
        <div class="minecraft-content">
          <p>欢迎来到黑爪旗下的Minecraft！我们提供 <strong>Java版 1.21.4</strong>服务器。</p>
          <div class="button-group">
            <router-link to="/MinecraftHelp" class="mc-btn secondary">
              📖 完整安装教程与下载链接
            </router-link>
            <a href="https://kook.vip/KWcZc1" target="_blank" rel="noopener noreferrer" class="mc-btn secondary">
             🎧 黑爪 Kook 语音频道
            </a>
          </div>
        </div>
      </div>

      <!-- 保留原有的近期动态区块，增加 Minecraft 相关动态 -->
      <div class="section">
        <h2 class="section-title">📢 近期动态 / 服务器活动</h2>
        <div class="test-elements-grid">
          <div class="test-element">🎉 黑爪建筑师大赛</div>
          <div class="test-element">🚀 1.21 版本前瞻</div>
          <div class="test-element">🏆 PVP 联赛报名</div>
          <div class="test-element">💎 周末三倍经验</div>
        </div>
      </div>
    </div>
    <BottomNav />
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
import ThemeToggle from '@/components/ThemeToggle.vue'
import BottomNav from '@/components/BottomNav.vue'
const icpNumber = import.meta.env.VITE_ICP_NUMBER || "待备案";
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || "办理中";
// 演示直接下载跳转（根据题目要求，仍导向 /MinecraftHelp）
const handleDirectDownload = () => {
  // 实际生产环境可改为真实的下载链接，按题目要求跳转到帮助页
  window.location.href = '/MinecraftHelp'
}
</script>

<style scoped>
.news-page .content-area {
  padding-top: 20px;
}

/* 修改后的 Minecraft 版面样式 */
.minecraft-section {
  text-align: center;
  background: var(--card-bg);
  border-radius: 32px;
  padding: 40px 24px;
  margin: 20px 0;
  box-shadow: var(--shadow);
  transition: transform 0.2s;
}

.minecraft-subtitle {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--accent, #42b983);
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px dashed var(--border-light, #e2e8f0);
  display: inline-block;
}

.minecraft-content p {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text-primary);
  margin: 16px 0;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  margin: 32px 0 24px;
}

.mc-btn {
  display: inline-block;
  padding: 12px 28px;
  border-radius: 48px;
  font-weight: 700;
  text-decoration: none;
  transition: 0.2s ease;
  cursor: pointer;
  font-size: 1rem;
  border: none;
  background: none;
  font-family: inherit;
}

.mc-btn.primary {
  background: linear-gradient(135deg, #2c7a4d, #1e5a3a);
  color: white;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
}

.mc-btn.primary:hover {
  transform: translateY(-3px);
  filter: brightness(1.05);
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.15);
}

.mc-btn.secondary {
  background: #2c3e66;
  color: white;
}

.mc-btn.secondary:hover {
  background: #1f2c4b;
  transform: translateY(-2px);
}

.mc-btn.outline {
  background: transparent;
  border: 2px solid var(--accent, #42b983);
  color: var(--accent, #42b983);
}

.mc-btn.outline:hover {
  background: var(--accent, #42b983);
  color: white;
}

.notice {
  font-size: 0.85rem;
  color: var(--text-secondary, #5a6e8a);
  background: var(--bg-secondary, #f1f5f9);
  padding: 10px 16px;
  border-radius: 24px;
  display: inline-block;
  margin-top: 12px;
}

.inline-link {
  color: var(--accent, #42b983);
  text-decoration: underline;
  font-weight: 500;
}

.placeholder-icon {
  font-size: 64px;
  opacity: 0.7;
  margin-top: 30px;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
}

/* 原有近期动态样式保持不变并增强 */
.test-elements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.test-element {
  height: 100px;
  background: var(--accent, #42b983);
  color: var(--bg-primary, #ffffff);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1rem;
  box-shadow: 0 5px 15px var(--shadow-color, rgba(0, 0, 0, 0.1));
  transition: all 0.3s ease;
  text-align: center;
  padding: 12px;
}

.test-element:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 25px var(--shadow-color, rgba(0, 0, 0, 0.15));
}

.top-tip-text {
  font-size: clamp(20px, 5vw, 36px);
  text-align: center;
  padding: 20px 0 10px;
  font-weight: bold;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.section-title {
  font-size: 1.8rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}
</style>