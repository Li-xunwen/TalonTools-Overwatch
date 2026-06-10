<template>
  <ThemeToggle />
  <div class="login-page">
    <div class="login-container">
      <!-- 正常登录界面，当 needBindPhone 为 false 时显示 -->
      <div v-if="!needBindPhone">
        <h2> </h2>
        <h2>{{ title }}</h2>
        <form @submit.prevent="handleLogin">
          <div class="autocomplete-wrapper">
            <input v-model="battletag" class="input-fieldA" placeholder="战网ID" @focus="showDropdown = true"
              @input="filterUsers" />
            <ul v-if="showDropdown && filteredUsers.length" class="dropdown">
              <li v-for="user in filteredUsers" :key="user" @click="selectUser(user)">
                {{ user }}
              </li>
            </ul>
          </div>
          <input v-model="password" type="password" class="input-fieldB" placeholder="密码" />
          <div class="error-message">{{ errorMessage }}</div>
          <a href="#" class="forgot-password">忘记密码？</a>
          <button type="submit" class="login-btn" :disabled="loading || isLoadingUsers">
            {{ loading ? "登录中..." : "登录" }}
          </button>
        </form>
      </div>

      <!-- 手机号绑定界面，当 needBindPhone 为 true 时显示 -->
      <div v-else>
        <h2> </h2>
        <h2>绑定手机号</h2>
        <div class="bind-form">
          <!-- 手机号输入框（单独一行） -->
          <input :value="formattedPhone" @input="handlePhoneInput" type="tel" class="input-fieldB phone-input"
            placeholder="手机号" :disabled="bindPhoneSending" />

          <!-- 短信验证码输入行：输入框 + 获取验证码按钮（同行） -->
          <div class="verification-row">
            <input v-model="bindSmsCode" type="text" class="input-fieldB sms-input" placeholder="验证码"
              :disabled="bindPhoneSending" />
            <div id="bind-captcha-button" class="bind-captcha-btn" :class="{ disabled: bindCountdown > 0 }"
              @click="handleGetBindCode">
              {{ bindCountdown > 0 ? `${bindCountdown}秒` : '发送验证' }}
            </div>
          </div>

          <!-- 提交按钮 -->
          <button class="login-btn" :disabled="bindPhoneSending || !bindSmsCode" @click="handleSubmitBind">
            {{ bindPhoneSending ? "绑定中..." : "绑定并登录" }}
          </button>
          <div class="error-message">{{ bindErrorMessage }}</div>
        </div>
        <div class="bind-info">
          根据法律法规，平台需要依规绑定用户手机号，给您造成不便，十分抱歉。我们会保护您的隐私，详情请跳转：
          <router-link to="/PrivacyPolicy" class="privacy-link-inline">隐私政策</router-link>
        </div>
      </div>


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
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import ThemeToggle from "@/components/ThemeToggle.vue";
import { useTheme } from "@/composables/useTheme";
import { createCaptcha } from "@/utils/captcha";

const icpNumber = import.meta.env.VITE_ICP_NUMBER || "待备案";
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || "办理中";

const router = useRouter();
const { initTheme } = useTheme();

// 正常登录相关
const title = ref("欢迎回来,黑爪特工");
const battletag = ref("");
const password = ref("");
const validUsers = ref<string[]>([]);
const isLoadingUsers = ref(true);
const loading = ref(false);
const errorMessage = ref("");
const showDropdown = ref(false);

// 手机号绑定相关
const needBindPhone = ref(false);
const pendingBindBattletag = ref("");
const pendingBindPassword = ref("");
const bindPhone = ref("");
const bindSmsCode = ref("");
const bindCountdown = ref(0);
let bindTimer: ReturnType<typeof setInterval> | null = null;
const bindPhoneSending = ref(false);
const bindErrorMessage = ref("");
let bindCaptchaController: ReturnType<typeof createCaptcha> | null = null;
let bindSmsToken = ""; // 存储发送验证码接口返回的 token

// 计算属性：格式化显示（如 "192 6450 5004"）
const formattedPhone = computed(() => {
  const digits = bindPhone.value.replace(/\D/g, ''); // 清除非数字
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 7)} ${digits.slice(7, 11)}`;
});

// 处理输入事件
function handlePhoneInput(e: Event) {
  const input = e.target as HTMLInputElement;
  let value = input.value.replace(/\s/g, ''); // 移除空格
  value = value.replace(/\D/g, ''); // 只保留数字
  value = value.slice(0, 11); // 最多11位
  bindPhone.value = value; // 存储纯数字
  // 更新输入框显示值（触发 reactivity）
  input.value = formattedPhone.value;
}

// ---------- LocalStorage 操作 ----------
const TOKEN_KEY = "authToken";
const EXPIRES_AT_KEY = "tokenExpiresAt";
const TOKEN_EXPIRY_DAYS = 7;

function saveAuthData(token: string) {
  const expiresAt = Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(EXPIRES_AT_KEY, expiresAt.toString());
}

function getAuthData(): { token: string | null; isValid: boolean } {
  const token = localStorage.getItem(TOKEN_KEY);
  const expiresAtStr = localStorage.getItem(EXPIRES_AT_KEY);
  if (!token || !expiresAtStr) return { token: null, isValid: false };
  const expiresAt = parseInt(expiresAtStr, 10);
  if (Date.now() > expiresAt) {
    clearAuthData();
    return { token: null, isValid: false };
  }
  return { token, isValid: true };
}

function clearAuthData() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
}

// ---------- 加载用户列表（自动补全） ----------
async function loadUserList() {
  try {
    errorMessage.value = "正在加载用户列表...";
    const res = await fetch("/api/users/battletaglist", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error("数据格式错误");
    validUsers.value = data;
    errorMessage.value = "";
  } catch (err) {
    console.error(err);
    errorMessage.value = "用户列表加载失败，请刷新页面";
  } finally {
    isLoadingUsers.value = false;
  }
}

// 登录处理（捕获需要绑定手机号的错误）
async function handleLogin() {
  errorMessage.value = "";
  const tag = battletag.value.trim();
  const pwd = password.value;
  if (!tag || !pwd) {
    errorMessage.value = "请输入战网ID和密码";
    return;
  }
  if (!validUsers.value.includes(tag)) {
    errorMessage.value = "战网ID不存在";
    return;
  }

  loading.value = true;
  try {
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ battletag: tag, password: pwd }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 403 && data.error === "请先绑定手机号") {
        // 需要绑定手机号
        needBindPhone.value = true;
        pendingBindBattletag.value = tag;
        pendingBindPassword.value = pwd;
        // 锁定原表单输入（这里通过 v-if 切换界面）
        return;
      }
      throw new Error(data.error || "登录失败");
    }
    const token = data.token;
    if (!token) throw new Error("服务器未返回令牌");
    saveAuthData(token);
    console.log("登录成功，Token 已存入 LocalStorage");
    router.push("/main");
  } catch (err: any) {
    console.error("登录网络错误详情:", err);
    let errorMsg = err.message || "登录过程中发生错误";
    if (err instanceof TypeError && err.message === "Failed to fetch") {
      errorMsg = "网络请求失败，请检查手机与电脑是否在同一WiFi，且后端服务已启动并监听0.0.0.0";
    }
    errorMessage.value = errorMsg;
  } finally {
    loading.value = false;
  }
}

// 自动登录（同样捕获需要绑定手机号的错误）
async function autoLogin() {
  const { token, isValid } = getAuthData();
  if (!token || !isValid) return;

  title.value = "自动登录中...";
  try {
    const res = await fetch("/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      console.log("自动登录成功，正在跳转...");
      await sleep(1500);
      router.push("/main");
    } else if (res.status === 403) {
      const data = await res.json();
      if (data.error === "请先绑定手机号") {
        // 自动登录时遇到未绑定手机号，需要用户重新手动登录（因为无法获得密码）
        // 清除 token 并提示用户重新登录
        clearAuthData();
        needBindPhone.value = false; // 回到正常登录界面
        errorMessage.value = "账号未绑定手机号，请手动登录后绑定";
        // 同时预填 battletag？可以从 token 解析？简单处理：不清除，仅提示
        return;
      }
    } else {
      clearAuthData();
      console.log("Token 无效或已撤销，已清除");
    }
  } catch (err) {
    console.error("自动登录验证失败", err);
    clearAuthData();
  } finally {
    title.value = "欢迎回来,黑爪特工";
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- 自动补全逻辑 ----------
const filteredUsers = computed(() => {
  const keyword = battletag.value.trim().toLowerCase();
  if (!keyword) return validUsers.value;
  return validUsers.value.filter((item) => item.toLowerCase().includes(keyword));
});

function filterUsers() {
  showDropdown.value = true;
}

function selectUser(user: string) {
  battletag.value = user;
  showDropdown.value = false;
}

function handleClickOutside(event: MouseEvent) {
  const wrapper = document.querySelector(".autocomplete-wrapper");
  if (wrapper && !wrapper.contains(event.target as Node)) {
    showDropdown.value = false;
  }
}

// ---------- 绑定手机号相关函数 ----------
function startBindCountdown(seconds: number) {
  if (bindCountdown.value > 0) return;
  bindCountdown.value = seconds;
  bindTimer = setInterval(() => {
    if (bindCountdown.value <= 1) {
      if (bindTimer) clearInterval(bindTimer);
      bindTimer = null;
      bindCountdown.value = 0;
      if (bindCaptchaController) {
        bindCaptchaController.refresh();
        console.log('绑定页面验证码已刷新');
      }
    } else {
      bindCountdown.value--;
    }
  }, 1000);
}

// 获取验证码（带人机验证）
async function handleGetBindCode() {
  if (bindCountdown.value > 0) return;
  if (!bindPhone.value || !/^1[3-9]\d{9}$/.test(bindPhone.value)) {
    bindErrorMessage.value = "请输入有效的手机号";
    return;
  }
  if (!bindCaptchaController) {
    bindErrorMessage.value = "验证码组件未就绪，请稍后重试";
    return;
  }

  bindErrorMessage.value = "";
  // 弹出人机验证
  const result = await bindCaptchaController.show();
  if (!result.success || !result.captchaVerifyParam) {
    bindErrorMessage.value = "请完成人机验证";
    bindCaptchaController.refresh();
    return;
  }

  // 调用后端发送短信接口
  bindPhoneSending.value = true;
  try {
    const res = await fetch("/api/bind-phone/send-sms-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        battletag: pendingBindBattletag.value,
        password: pendingBindPassword.value,
        captchaVerifyParam: result.captchaVerifyParam,
        newPhone: bindPhone.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      bindErrorMessage.value = data.error || "发送验证码失败";
      bindCaptchaController.refresh();
      return;
    }
    // 保存 smsToken 用于后续绑定
    if (data.token) bindSmsToken = data.token;
    startBindCountdown(60);
    bindErrorMessage.value = "验证码已发送";
  } catch (error) {
    console.error("发送验证码错误:", error);
    bindErrorMessage.value = "网络错误，请稍后重试";
    bindCaptchaController.refresh();
  } finally {
    bindPhoneSending.value = false;
  }
}

// 提交绑定（调用真实后端接口）
async function handleSubmitBind() {
  if (!bindPhone.value || !/^1[3-9]\d{9}$/.test(bindPhone.value)) {
    bindErrorMessage.value = "手机号无效";
    return;
  }
  if (!bindSmsCode.value || bindSmsCode.value.length !== 5) {
    bindErrorMessage.value = "请输入5位短信验证码";
    return;
  }
  if (!bindSmsToken) {
    bindErrorMessage.value = "请先获取验证码";
    return;
  }

  bindPhoneSending.value = true;
  bindErrorMessage.value = "";

  try {
    const res = await fetch("/api/bind-phone/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        battletag: pendingBindBattletag.value,
        password: pendingBindPassword.value,
        smsCode: bindSmsCode.value,
        smsToken: bindSmsToken,
      }),
    });
    const data = await res.json();

    if (!res.ok) {
      // 后端返回错误（如验证码错误、密码错误等）
      bindErrorMessage.value = data.error || "绑定失败，请稍后重试";
      return;
    }

    // 绑定成功！立即重新登录获取 token
    const loginRes = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        battletag: pendingBindBattletag.value,
        password: pendingBindPassword.value,
      }),
    });
    const loginData = await loginRes.json();

    if (loginRes.ok && loginData.token) {
      saveAuthData(loginData.token);
      router.push("/main");
    } else {
      bindErrorMessage.value = loginData.error || "绑定成功但登录失败，请手动重新登录";
      needBindPhone.value = false; // 返回登录界面
    }
  } catch (err) {
    console.error("绑定请求失败:", err);
    bindErrorMessage.value = "网络错误，请检查后端服务是否运行";
  } finally {
    bindPhoneSending.value = false;
  }
}

// 初始化绑定页面的验证码控制器
function initBindCaptcha() {
  if (bindCaptchaController) return;
  bindCaptchaController = createCaptcha({
    sceneId: "f7f4dz8z",
    mode: "popup",
    button: null,
    container: "#bind-captcha-container",
    slideStyle: { width: 360, height: 40 },
    language: "cn",
  });
}

// 生命周期
onMounted(async () => {
  initTheme();
  await loadUserList();
  await autoLogin();
  document.addEventListener("click", handleClickOutside);
  // 延迟初始化绑定验证码（确保 DOM 元素存在）
  setTimeout(() => initBindCaptcha(), 100);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
  if (bindTimer) clearInterval(bindTimer);
});
</script>

<style scoped>
* {
  box-sizing: border-box;
}

/* =========================
   Login Card
========================= */

.login-container {
  width: 300px;
  max-width: calc(100vw - 80px);
  height: 400px;
  padding: 25px;
  background: var(--card-bg);
  border-radius: 12px;
  box-shadow: var(--shadow);
  transition: 0.3s;
}

.login-container h2 {
  text-align: center;
  margin-bottom: 24px;
  font-weight: 600;
}

/* =========================
   Inputs
========================= */

.autocomplete-wrapper {
  position: relative;
}

.input-fieldA,
.input-fieldB {
  width: 100%;

  padding: 12px 10px;

  margin: 8px 0 16px;

  background: transparent;

  color: var(--text-primary);

  font-size: 16px;

  border: none;
  border-bottom: 2px solid var(--input-border);

  outline: none;

  transition: 0.2s;
}

.input-fieldA:focus,
.input-fieldB:focus {
  border-bottom-color: var(--input-focus);
}

/* =========================
   Dropdown
========================= */

.dropdown {
  position: absolute;

  top: calc(100% - 10px);
  left: 0;
  right: 0;

  z-index: 100;

  max-height: 220px;
  overflow-y: auto;

  margin: 0;
  padding: 6px 0;

  list-style: none;

  background: var(--card-bg);

  border: 1px solid var(--input-border);
  border-radius: 8px;

  box-shadow:
    0 8px 24px rgba(0, 0, 0, 0.15);
}

.dropdown li {
  padding: 10px 14px;

  cursor: pointer;

  color: var(--text-primary);

  transition: 0.15s;
}

.dropdown li:hover {
  background: rgba(24, 119, 242, 0.12);
}

/* =========================
   Error
========================= */

.error-message {
  min-height: 22px;

  margin-bottom: 12px;

  color: #ff4d4f;
  font-size: 14px;
}

/* =========================
   Link
========================= */

.forgot-password {
  display: block;

  text-align: right;

  margin-top: -8px;
  margin-bottom: 20px;

  font-size: 14px;

  color: var(--link-color);

  text-decoration: none;
}

.forgot-password:hover {
  text-decoration: underline;
}

/* =========================
   Login Button
========================= */

.login-btn {
  width: 100%;

  padding: 12px;

  border: none;
  border-radius: 6px;

  background: var(--button-bg);

  color: #fff;

  font-size: 16px;
  font-weight: 600;

  cursor: pointer;

  transition: 0.2s;
}

.login-btn:hover:not(:disabled) {
  background: var(--button-hover);
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-page {
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* =========================
   Mobile
========================= */

@media (max-width: 480px) {
  .login-container {
    width: 100%;
    padding: 28px;
  }

  .login-container h2 {
    font-size: 22px;
  }
}

/* 备案页脚 - 绝对定位，固定在底部 */
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

/* 为绝对定位的页脚留出底部空间，防止覆盖内容 */
.login-page {
  position: relative;
  min-height: 100vh;
  padding-bottom: 50px;
  /* 避免页脚遮挡表单底部 */
}

/* 短信验证码行：flex 布局 */
.verification-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.sms-input {
  flex: 1;
  margin: 0;
}

.bind-info {
  font-size: 12px;
  text-align: left;
  color: var(--text-secondary);
  text-indent: 2em;
  line-height: 1.5;
}

.bind-form {
  margin-top: 20px;
}

.captcha-row {
  margin: 16px 0;
  display: flex;
  justify-content: flex-end;
}

.bind-captcha-btn {
  z-index: 99;
  min-width: 30px;
  padding: 6px 16px;
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
  margin: 0;
  white-space: nowrap;
}

.bind-captcha-btn:hover {
  background-color: var(--button-hover, #359268);
}

.bind-captcha-btn.disabled {
  cursor: not-allowed;
  opacity: 0.6;
  pointer-events: auto;
}

#bind-captcha-container {
  display: none;
}

.links-row {
  display: flex;
  justify-content: space-between;
  margin-bottom: 20px;
}

.privacy-link-inline {
  color: var(--link-color);
  text-decoration: none;
  display: inline;
  margin-left: 4px;
}

.privacy-link-inline:hover {
  text-decoration: underline;
}
</style>
