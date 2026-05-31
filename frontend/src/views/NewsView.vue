<template>
  <div class="join-play news-page">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">黑爪情报局</div>
      <div class="section coming-soon-section">
        <h2 class="section-title">✨ 敬请期待 ✨</h2>
        <div class="coming-soon-content">
          <p>我们正在积极筹备更多精彩内容，</p>
          <p>包括赛事数据、战队故事、专属活动等。</p>
          <p>请保持关注，黑爪需要你！</p>
        </div>
        <div class="placeholder-icon">🎮</div>
      </div>
      <div class="section">
        <h2 class="section-title">近期动态</h2>
        <div class="test-elements-grid">
          <div class="test-element">即将揭晓</div>
          <div class="test-element">敬请期待</div>
          <div class="test-element">coming soon</div>
          <div class="test-element">stay tuned</div>
        </div>
      </div>
    </div>
    <div class="fixed-bottom-nav">
      <router-link to="/news" class="nav-tab" active-class="active">
        <div>黑爪动态</div>
      </router-link>
      <router-link to="/main" class="nav-tab" active-class="active">
        <div>主页</div>
      </router-link>
      <router-link to="/profile" class="nav-tab" active-class="active">
        <div>我的</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import ThemeToggle from '@/components/ThemeToggle.vue'
</script>

<style scoped>
.news-page .content-area {
  padding-top: 20px;
}
.coming-soon-section {
  text-align: center;
  background: var(--card-bg);
  border-radius: 24px;
  padding: 40px 20px;
  margin: 20px 0;
}
.coming-soon-content {
  font-size: 18px;
  line-height: 1.8;
  color: var(--text-primary);
  margin: 30px 0;
}
.placeholder-icon {
  font-size: 64px;
  opacity: 0.7;
  margin-top: 20px;
}
.test-elements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 20px;
  margin-top: 20px;
}
.test-element {
  height: 100px;
  background: var(--accent);
  color: var(--bg-primary);
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 18px;
  box-shadow: 0 5px 15px var(--shadow-color);
  transition: all 0.3s ease;
}
.test-element:hover {
  transform: translateY(-5px);
  box-shadow: 0 8px 25px var(--shadow-color);
}
.top-tip-text {
  font-size: clamp(20px, 5vw, 36px);
  text-align: center;
  padding: 20px 0 10px;
  font-weight: bold;
  color: var(--text-primary);
}
</style>