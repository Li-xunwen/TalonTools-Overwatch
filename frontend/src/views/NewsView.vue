<template>
  <div class="news-page">
    
    <PosterHeroes />
    <!-- 内容区 -->
    <div class="profile-container">
        <PosterHeroes />
    </div>

    <!-- 底部导航栏 -->
    <div class="fixed-bottom-nav">
      <router-link to="/news" class="nav-tab active">
        <div>黑爪动态</div>
      </router-link>
      <router-link to="/main" class="nav-tab">
        <div>主页</div>
      </router-link>
      <router-link to="/profile" class="nav-tab">
        <div>我的</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import PosterHeroes from '@/components/PosterHeroes.vue'


// ---------- 生命周期 ----------
onMounted(() => {

})
</script>

<style scoped>
/* 如果需要引入全局样式，建议在 main.ts 中引入，或者在这里使用 @import */
/* @import '../styles/main.css'; */
/* @import '../styles/profile.css'; */

/* 这里可以添加组件特有的样式，或者确保全局样式已正确加载 */
.news-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* 继承全局背景色 */
  background-color: var(--bg-body, #121212); 
  color: var(--text-primary, #f0f0f0);
}

.profile-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  width: 100%;
  padding: 20px;
}

.loading {
  font-size: 1.5rem;
  margin-bottom: 20px;
}

img {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

/* 确保主题切换按钮和底部导航栏的样式与全局一致 */
/* 如果 main.css 中已经定义了 .theme-toggle 和 .fixed-bottom-nav，则无需在此重复定义 */
</style>