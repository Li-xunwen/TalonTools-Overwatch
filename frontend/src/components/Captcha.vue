<template>
  <div>
    <div id="captcha-button" :class="{ disabled: countdown > 0 }">
      {{ countdown > 0 ? `${countdown}秒` : '获取验证码' }}
    </div>
    <div id="captcha-element"></div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref } from 'vue';

const captchaInstance = ref(null);
const countdown = ref(0);
let timer = null;

// 获取阿里云验证码实例
function getInstance(instance) {
  captchaInstance.value = instance;
}

// 在 success 函数中调用后端接口
async function success(captchaVerifyParam) {
  console.log('前端获取的凭证:', captchaVerifyParam);

  const testPassword = '123';
  const testNewPhone = '19264505004';
  try {
    const response = await fetch(`/api/send-sms-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        battletag: "Node#51456",
        password: testPassword,
        captchaVerifyParam: captchaVerifyParam,
        newPhone: testNewPhone
      })
    });

    // 先获取原始响应文本（用于调试）
    const rawText = await response.text();
    console.log('原始响应:', rawText);

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (e) {
      console.error('响应不是合法JSON:', rawText);
      alert(`服务器返回异常: ${rawText.substring(0, 100)}`);
      return;
    }

    if (response.ok) {
      console.log('验证码发送成功:', data);
      alert('验证码已发送，请查看后端控制台');
      if (data.token) localStorage.setItem('smsToken', data.token);
    } else {
      console.error('发送失败:', data.error);
      alert(data.error || '发送失败');
    }
  } catch (error) {
    console.error('网络错误:', error);
    alert('网络错误，请检查后端服务是否启动');
  }
}
// 验证失败回调
function fail(error) {
  console.error('验证码验证失败:', error);
}

// 开始倒计时
function startCountdown() {
  if (countdown.value > 0) return;
  countdown.value = 60;
  timer = setInterval(() => {
    if (countdown.value <= 1) {
      clearInterval(timer);
      timer = null;
      countdown.value = 0;
      // 倒计时结束，刷新验证码实例
      if (captchaInstance.value && captchaInstance.value.refresh) {
        captchaInstance.value.refresh();
      }
    } else {
      countdown.value--;
    }
  }, 1000);
}

// 手动处理按钮点击
function handleButtonClick() {
  if (countdown.value > 0) {
    // 倒计时中，不弹出验证码
    console.log('请等待倒计时结束');
    return;
  }
  if (captchaInstance.value && captchaInstance.value.show) {
    captchaInstance.value.show();  // 显示验证码弹窗
    startCountdown();              // 弹出后立即开始倒计时
  } else {
    console.error('验证码实例未就绪');
  }
}

// 初始化阿里云验证码
function initCaptcha() {
  window.initAliyunCaptcha({
    SceneId: 'f7f4dz8z',
    mode: 'popup',
    element: '#captcha-element',
    button: null,              // 不自动绑定按钮，手动控制
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
  initCaptcha();
  const btn = document.getElementById('captcha-button');
  if (btn) {
    btn.addEventListener('click', handleButtonClick);
  }
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  const btn = document.getElementById('captcha-button');
  if (btn) {
    btn.removeEventListener('click', handleButtonClick);
  }
});
</script>

<style scoped>
#captcha-button {
  z-index: 99;
  min-width: 100px;          /* 自适应宽度 */
  padding: 6px 16px;         /* 调整内边距，更舒适 */
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
  transition: background-color 0.2s, opacity 0.2s;
}

#captcha-button:hover {
  background-color: var(--button-hover, #359268);
}

#captcha-button.disabled {
  cursor: not-allowed;
  opacity: 0.6;
  background-color: var(--button-bg, #42b983);
  pointer-events: auto;      /* 保留点击事件但由逻辑阻止 */
}

/* 可选：深色/浅色模式适配 */
@media (prefers-color-scheme: dark) {
  #captcha-button {
    --button-bg: #2c6e4f;
    --button-hover: #1f533c;
  }
}
</style>