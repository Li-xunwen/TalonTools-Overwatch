<template>
  <div>
    <div id="captcha-button">获取验证码</div>
    <div id="captcha-element"></div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';

const captcha = ref(null);

function getInstance(instance) {
  captcha.value = instance;
}

function success(captchaVerifyParam) {
  console.log(captchaVerifyParam);
}

function fail(error) {
  console.error(error);
}

function initCaptcha() {
  window.initAliyunCaptcha({
    SceneId: 'f7f4dz8z',
    mode: 'popup',
    element: '#captcha-element',
    button: '#captcha-button',
    success: success,
    fail: fail,
    getInstance: getInstance,
    slideStyle: {
      width: 360,
      height: 40,
    },
    language: 'cn',
  });
}

onMounted(() => {
  console.log('组件已挂载到DOM！');
  initCaptcha();
});
</script>

<style scoped>
/* 使用与登录页一致的 CSS 变量，自动适配深色/浅色模式 */
#captcha-button {
  z-index: 99;
  width: 80px;
  box-sizing: border-box;
  border-radius: 6px;          /* 与登录按钮保持一致 */
  border: 1px solid transparent;
  cursor: pointer;
  /* 使用主题变量 */
  background-color: var(--button-bg, #42b983);
  color: #fff;
  padding: 2px 2px;             /* 与登录按钮内边距一致 */
  font-size: 12px;
  font-weight: 20;
  line-height: 1;
  text-align: center;
  transition: background-color 0.2s;
}

#captcha-button:hover {
  background-color: var(--button-hover, #359268);
}

/* 可选的刷新按钮样式（如果需要和主题协调）*/
#refresh-button {
  margin-top: 12px;
  background: transparent;
  border: 1px solid var(--input-border, #ddd);
  color: var(--text-primary, #333);
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  transition: all 0.2s;
}

#refresh-button:hover {
  background-color: var(--card-bg-hover, rgba(0,0,0,0.05));
  border-color: var(--input-focus, #42b983);
}
</style>