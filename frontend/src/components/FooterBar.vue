<template>
  <div class="footer-bar">
    <!-- 链接区 -->
    <div class="footer-link">
      <a href="https://kook.vip/KWcZc1" target="_blank" rel="noopener noreferrer">Kook黑爪语音频道</a>
      <span class="sep">|</span>
      <router-link to="/Thanks">鸣谢支持</router-link>
      <span class="sep">|</span>
      <router-link to="/PrivacyPolicy">隐私政策</router-link>
    </div>

    <!-- 备案区 -->
    <div class="footer-beian">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">{{ icpNumber }}</a>
      <span class="sep">|</span>
      <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">{{ policeNumber }}</a>
    </div>
  </div>
</template>

<script setup lang="ts">
const icpNumber = import.meta.env.VITE_ICP_NUMBER || '沪ICP备备2026XXXX号';
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || '沪公网安备 3101150200XXXX号';
</script>

<style scoped>
.footer-bar {
  /* 全宽，背景延申至屏幕最下方 */
  width: 100%;
  background: var(--bg-primary);
  border-top: 1px solid var(--input-border, #e9ecef);
  /* 预留 BottomNav 固定位（64px） */
  padding-bottom: calc(70px + env(safe-area-inset-bottom, 0px));
}

/* 链接区 */
.footer-link {
  text-align: center;
  padding: 16px 12px 5px;
  font-size: 12px;
  color: var(--accent, #6c757d);
}

.footer-link a {
  color: var(--link-color);
  text-decoration: none;
}

.footer-link a:hover {
  text-decoration: underline;
}

.footer-link .sep {
  margin: 0 8px;
  opacity: 0.4;
}

/* 备案区 */
.footer-beian {
  text-align: center;
  padding: 0 12px 16px;
  font-size: 12px;
  color: var(--accent, #6c757d);
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
  opacity: 0.4;
}
</style>
