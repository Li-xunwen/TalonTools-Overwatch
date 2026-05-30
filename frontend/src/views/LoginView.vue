<template>
  <ThemeToggle />

  <div class="login-container">
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
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useRouter } from "vue-router";
import ThemeToggle from "@/components/ThemeToggle.vue";
import { useTheme } from "@/composables/useTheme";

const router = useRouter();
const { initTheme } = useTheme();

const title = ref("欢迎回来,黑爪特工");

const battletag = ref("");
const password = ref("");
const validUsers = ref<string[]>([]);
const isLoadingUsers = ref(true);
const loading = ref(false);
const errorMessage = ref("");
const showDropdown = ref(false);

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

  if (!token || !expiresAtStr) {
    return { token: null, isValid: false };
  }

  const expiresAt = parseInt(expiresAtStr, 10);
  if (Date.now() > expiresAt) {
    // Token 已过期
    clearAuthData();
    return { token: null, isValid: false };
  }

  return { token, isValid: true };
}

function clearAuthData() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(EXPIRES_AT_KEY);
}

// ---------- 加载用户列表（用于输入自动补全）----------
async function loadUserList() {
  try {
    errorMessage.value = "正在加载用户列表...";
    const res = await fetch("http://localhost:3000/api/users/battletaglist", {
      cache: "no-store",
    });
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

// ---------- 登录（使用后端 JWT）----------
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
    const res = await fetch("http://localhost:3000/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ battletag: tag, password: pwd }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "登录失败");

    const token = data.token;
    if (!token) throw new Error("服务器未返回令牌");

    // 使用新的 LocalStorage 方式保存
    saveAuthData(token);
    console.log("登录成功，Token 已存入 LocalStorage");
    router.push("/main");
  } catch (err: any) {
    console.error(err);
    errorMessage.value = err.message || "登录过程中发生错误";
  } finally {
    loading.value = false;
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function autoLogin() {
  const { token, isValid } = getAuthData();
  
  if (!token || !isValid) {
    return;
  }

  title.value = "自动登录中...";

  let loginSuccess = false;

  try {
    const res = await fetch("http://localhost:3000/api/users/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      loginSuccess = true;
      console.log("自动登录成功，正在跳转...");
      await sleep(1500);
      router.push("/main");
    } else {
      // 后端验证失败（如 Token 被撤销），清除本地存储
      clearAuthData();
      console.log("Token 无效或已撤销，已清除");
    }
  } catch (err) {
    console.error("自动登录验证失败", err);
    clearAuthData();
  } finally {
    if (!loginSuccess) {
      title.value = "欢迎回来,黑爪特工";
    }
  }
}

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

// ---------- 点击外部关闭下拉框 ----------
function handleClickOutside(event: MouseEvent) {
  const wrapper = document.querySelector(".autocomplete-wrapper");
  if (wrapper && !wrapper.contains(event.target as Node)) {
    showDropdown.value = false;
  }
}

// ---------- 生命周期 ----------
onMounted(async () => {
  initTheme();

  await loadUserList();
  await autoLogin();

  document.addEventListener("click", handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});
</script>

<style scoped>
/* =========================
   Theme Variables
========================= */

:global(:root) {
  --bg-body: #f0f2f5;
  --card-bg: #ffffff;
  --text-primary: #1c1e21;

  --input-border: #ddd;
  --input-focus: #1877f2;

  --button-bg: #1877f2;
  --button-hover: #156ae9;

  --link-color: #1877f2;

  --shadow:
    0 14px 28px rgba(0, 0, 0, 0.25),
    0 10px 10px rgba(0, 0, 0, 0.22);
}

:global(.dark-theme) {
  --bg-body: #121212;
  --card-bg: #1e1e1e;
  --text-primary: #f0f0f0;

  --input-border: #444;
  --input-focus: #4dabf7;

  --button-bg: #1877f2;
  --button-hover: #339af0;

  --link-color: #4dabf7;

  --shadow:
    0 10px 20px rgba(0, 0, 0, 0.5);
}

/* =========================
   Layout
========================= */

:global(body) {
  margin: 0;
  min-height: 100vh;

  display: flex;
  justify-content: center;
  align-items: center;

  font-family:
    "Segoe UI",
    Arial,
    sans-serif;

  background: var(--bg-body);
  color: var(--text-primary);

  transition: 0.3s;
}

* {
  box-sizing: border-box;
}

/* =========================
   Login Card
========================= */

.login-container {
  width: 360px;
  max-width: calc(100vw - 40px);

  padding: 40px;

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
</style>