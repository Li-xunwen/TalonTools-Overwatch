<template>
  <div class="join-play news-page">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">快马加鞭修复中...</div>
      <div class="section coming-soon-section">
        <h2 class="section-title">你给了Node一鞭，Node正在拼命修复该页</h2>
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
@import '../style/main.css';
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