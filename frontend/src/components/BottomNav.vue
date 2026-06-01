<template>
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
</template>

<script setup lang="ts">
const isActive = (path: string) => window.location.pathname === path
</script>

<style scoped>
/* 基础样式（浅色模式默认） */
.fixed-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  height: 64px;
  display: flex;
  /* 浅色模式：白色半透明毛玻璃 */
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(12px);
  border-top: 1px solid rgba(0, 0, 0, 0.08);
  z-index: 999;
}

/* 深色模式（通过父级 .dark-theme 类切换） */
.dark-theme .fixed-bottom-nav {
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(12px);
  border-top-color: rgba(255, 255, 255, 0.1);
}

/* 导航项 */
.nav-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: var(--text-primary, #333);
  font-size: 14px;
  transition: all 0.2s;
  border-radius: 8px;
  margin: 8px 4px;
  position: relative;
}

/* 浅色模式选中状态：背景高亮 + 文字加粗变色 */
.nav-tab.active {
  color: var(--accent, #007aff);
  font-weight: bold;
  background-color: rgba(0, 122, 255, 0.15);
}

/* 深色模式选中状态 */
.dark-theme .nav-tab.active {
  background-color: rgba(0, 122, 255, 0.3);
  color: #4dabf7;
}

/* 可选：底部指示条（更明显） */
.nav-tab.active::after {
  content: '';
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 24px;
  height: 2px;
  background: var(--accent, #007aff);
  border-radius: 2px;
}

/* 确保深色模式下指示条颜色 */
.dark-theme .nav-tab.active::after {
  background: #4dabf7;
}

/* 点击区域优化 */
.nav-tab div {
  pointer-events: none;
}
</style>