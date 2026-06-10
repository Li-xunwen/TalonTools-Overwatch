/////以下是captcha使用示例
<template>
  <div>
    <div 
      id="captcha-button" 
      :class="{ disabled: countdown > 0 }"
      @click="handleGetCode"
    >
      {{ countdown > 0 ? `${countdown}秒` : '获取验证码' }}
    </div>
    <div id="captcha-container"></div> <!-- 验证码渲染容器 -->
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue';
import { createCaptcha } from '@/utils/captcha';

const countdown = ref(0);
let timer: ReturnType<typeof setInterval> | null = null;
let captchaController: ReturnType<typeof createCaptcha> | null = null;

async function handleGetCode() {
  if (countdown.value > 0) return;
  if (!captchaController) return;

  // 弹出验证码并等待用户完成
  const result = await captchaController.show();
  
  if (result.success && result.captchaVerifyParam) {
    // 验证通过，调用后端发送短信接口
    try {
      const response = await fetch('/api/baind-phone/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          battletag: 'Node#51456',
          password: '1234', // 实际应从表单获取
          captchaVerifyParam: result.captchaVerifyParam,
          newPhone: '19264505004', // 实际应从表单获取
        }),
      });
      const data = await response.json();
      if (response.ok) {
        alert('验证码已发送');
        if (data.token) localStorage.setItem('smsToken', data.token);
        startCountdown(); // 开始倒计时
      } else {
        alert(data.error || '发送失败');
        // 验证码刷新，让用户可以重试
        captchaController?.refresh();
      }
    } catch (error) {
      console.error('网络错误:', error);
      alert('网络错误');
      captchaController?.refresh();
    }
  } else {
    // 验证失败，可提示或刷新验证码
    alert('请完成验证');
    captchaController?.refresh();
  }
}

function startCountdown() {
  if (countdown.value > 0) return;
  countdown.value = 60; // 60秒倒计时
  timer = setInterval(() => {
    if (countdown.value <= 1) {
      if (timer) clearInterval(timer);
      timer = null;
      countdown.value = 0;
      if (captchaController) {
        captchaController.refresh();
      }
    } else {
      countdown.value--;
    }
  }, 1000);
}

onMounted(() => {
  captchaController = createCaptcha({
    sceneId: 'f7f4dz8z',
    mode: 'popup',
    button: null, // 手动控制，不自动绑定
    container: '#captcha-container',
  });
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});
</script>

<style scoped>
#captcha-button {
  z-index: 99;
  min-width: 100px; /* 自适应宽度 */
  padding: 6px 16px; /* 调整内边距，更舒适 */
  box-sizing: border-box;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  background-color: var(--button-bg, #42b983);
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.2;
  text-align: center;
  transition:
    background-color 0.2s,
    opacity 0.2s;
}

#captcha-button:hover {
  background-color: var(--button-hover, #359268);
}

#captcha-button.disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background-color: var(--button-bg, #42b983);
  pointer-events: auto; /* 保留点击事件但由逻辑阻止 */
}

/* 可选：深色/浅色模式适配 */
@media (prefers-color-scheme: dark) {
  #captcha-button {
    --button-bg: #2c6e4f;
    --button-hover: #1f533c;
  }
}
</style>