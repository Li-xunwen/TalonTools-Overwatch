<template>
  <div class="profile-page">

    <!-- 主题切换 -->
    <ThemeToggle />
    <!-- Toast -->
    <Toast :message="toastMessage" :duration="3000" />
    <!-- 顶部按钮：左（编辑资料）右（文件库） -->
    <div class="top-actions">
      <button class="top-action-btn" @click="toggleEdit">
        {{ isEditing ? '取消编辑' : '编辑资料' }}
      </button>
      <button class="top-action-btn" @click="showFileLibrary = true">
        📁 文件库
      </button>
    </div>
    <div class="content-area">
    <!-- Loading -->
    <div v-if="loading" class="loading">
      加载中...
    </div>
    <!-- 主体 -->
    <div v-else class="profile-container">
      <!-- 用户头像 -->
      <div class="profile-header">
        <div class="avatar-wrapper">
          <img class="profile-avatar" :src="avatarUrl" @error="onAvatarError" alt="Avatar">
          <!-- 编辑头像按钮：仅在编辑模式下显示 -->
          <label v-if="isEditing" class="edit-avatar-btn" title="更换头像">
            ✏️
            <input type="file" accept="image/*" hidden @change="handleAvatarChange" />
          </label>
        </div>
        <div class="profile-greeting">
          欢迎回来
        </div>
        <div class="profile-id">
          {{ profile.battletag }}
        </div>
      </div>

      <!-- 段位区域 -->
      <section class="rank-section">
        <h3 class="section-title">
          我的段位
        </h3>
        <div class="rank-list">
          <!-- 开放职责 -->
          <div class="rank-card">
            <div class="rank-title">
              开放6v6
            </div>
            <div class="profile-rank" @click="openRankPicker('rank_open_6v6')">
              <template v-if="profile.rank_open_6v6">
                <img :src="getRankImage(profile.rank_open_6v6.rank)">
                <div class="rank-level">
                  {{ profile.rank_open_6v6.level }}
                </div>

              </template>
              <div v-else class="empty-rank">
                +
              </div>
            </div>
          </div>

          <!-- 重装 -->
          <div class="rank-card">
            <div class="rank-title">
              重装
            </div>
            <div class="profile-rank" @click="openRankPicker('rank_tank_5v5')">
              <template v-if="profile.rank_tank_5v5">
                <img :src="getRankImage(profile.rank_tank_5v5.rank)">
                <div class="rank-level">
                  {{ profile.rank_tank_5v5.level }}
                </div>
              </template>
              <div v-else class="empty-rank">
                +
              </div>
            </div>
          </div>

          <!-- 输出 -->
          <div class="rank-card">
            <div class="rank-title">
              输出
            </div>
            <div class="profile-rank" @click="openRankPicker('rank_dps_5v5')">
              <template v-if="profile.rank_dps_5v5">
                <img :src="getRankImage(profile.rank_dps_5v5.rank)">

                <div class="rank-level">
                  {{ profile.rank_dps_5v5.level }}
                </div>

              </template>
              <div v-else class="empty-rank">
                +
              </div>
            </div>
          </div>

          <!-- 辅助 -->
          <div class="rank-card">
            <div class="rank-title">
              辅助
            </div>
            <div class="profile-rank" @click="openRankPicker('rank_support_5v5')">
              <template v-if="profile.rank_support_5v5">
                <img :src="getRankImage(profile.rank_support_5v5.rank)">
                <div class="rank-level">
                  {{ profile.rank_support_5v5.level }}
                </div>
              </template>
              <div v-else class="empty-rank">
                +
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 擅长英雄 -->
      <section class="hero-edit-wrapper">

        <h3 class="section-title">
          擅长英雄
        </h3>

        <div class="profile-heroes">
          <div v-for="(hero, index) in profile.heroes" :key="hero + index" class="hero-slot">
            <div class="profile-hero-icon">
              <img :src="getHeroImage(hero)" :alt="hero">
              <button v-if="isEditing" class="remove-hero" @click="removeHero(index)">
                ×
              </button>
            </div>
          </div>

          <!-- 添加英雄 -->
          <div v-if="isEditing && profile.heroes.length < 5" class="hero-slot">
            <div class="empty-slot" @click="showHeroPicker = true">
              +
            </div>
          </div>
        </div>
      </section>
      <!-- 保存 -->
      <div v-if="isEditing" class="edit-actions">
        <button class="btn-save" @click="saveProfile">
          保存资料
        </button>
        <button class="btn-cancel" @click="cancelEdit">
          放弃修改
        </button>
      </div>
      <!-- 修改密码区域 -->
      <div class="change-password-section">
        <button v-if="!isChangingPassword" class="change-pwd-btn" @click="startChangePassword">
          修改密码
        </button>
        <div v-else class="password-edit-form">
          <input type="password" v-model="newPassword" placeholder="新密码（至少6位）" class="pwd-input" />
          <input type="password" v-model="confirmPassword" placeholder="确认新密码" class="pwd-input" />
          <div class="pwd-actions">
            <button class="pwd-submit" @click="submitPasswordChange">提交</button>
            <button class="pwd-cancel" @click="cancelPasswordChange">取消</button>
          </div>
        </div>
      </div>

      <!-- 登出 -->
      <div class="logout-section">
        <button class="logout-btn" @click="logout">
          退出登录
        </button>
      </div>
    </div>

    </div>

    <!-- 文件库弹窗 -->
    <FileLibrary v-if="showFileLibrary" @close="showFileLibrary = false" />

    <!-- Hero Picker -->
    <div v-if="showHeroPicker" class="hero-picker">

      <button class="picker-close" @click="showHeroPicker = false">
        ×
      </button>
      <div class="picker-title">
        选择英雄
      </div>
      <div class="hero-groups">
        <!-- Tank -->
        <div class="hero-group">
          <div class="group-title">
            重装
          </div>
          <div class="hero-grid">
            <div v-for="hero in tankHeroes" :key="hero.name" class="hero-picker-item" @click="selectHero(hero.name)">
              <img :src="getHeroImage(hero.name)">
              <div class="hero-name">{{ hero.zh_name }}</div>
            </div>
          </div>
        </div>
        <!-- DPS -->
        <div class="hero-group">
          <div class="group-title">
            输出
          </div>
          <div class="hero-grid">
            <div v-for="hero in dpsHeroes" :key="hero.name" class="hero-picker-item" @click="selectHero(hero.name)">
              <img :src="getHeroImage(hero.name)">
              <div class="hero-name">
                {{ hero.zh_name }}
              </div>
            </div>
          </div>
        </div>

        <!-- Support -->
        <div class="hero-group">
          <div class="group-title">
            辅助
          </div>
          <div class="hero-grid">
            <div v-for="hero in supportHeroes" :key="hero.name" class="hero-picker-item" @click="selectHero(hero.name)">
              <img :src="getHeroImage(hero.name)">
              <div class="hero-name">
                {{ hero.zh_name }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Rank Picker -->
    <div v-if="showRankPicker" class="rank-picker">
      <button class="picker-close" @click="closeRankPicker">
        ×
      </button>
      <div class="picker-title">
        选择段位
      </div>
      <div class="rank-grid">
        <div v-for="rank in ranks" :key="rank" class="rank-item" @click="selectRank(rank)">
          <img :src="getRankImage(rank)">
          <span>
            {{ rank }}
          </span>
        </div>
      </div>
      <div v-if="selectedRank" class="rank-level-grid">
        <button v-for="level in [1, 2, 3, 4, 5]" :key="level" class="rank-level-btn" @click="selectRankLevel(level)">
          {{ level }}
        </button>
      </div>
    </div>
    <!-- 管理员日志按钮（左下角） -->
    <div v-if="!loading && isAdmin" class="admin-log-btn" @click="goToEventLog">
      📈
    </div>
    <!-- 遮罩 -->
    <div v-if="showHeroPicker || showRankPicker" class="picker-mask" @click="closeAllPicker"></div>
    <BottomNav />

  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Toast from '@/components/Toast.vue'
import { authFetch } from '@/utils/request'
import BottomNav from '@/components/BottomNav.vue'
import { useRouter } from 'vue-router';
import FileLibrary from '@/components/FileLibrary.vue';
/* =========================
   类型定义
========================= */

interface RankData {
  rank: string
  level: number
}

interface UserInfo {
  battletag: string

  role?: string

  rank_open_6v6: RankData | null
  rank_tank_5v5: RankData | null
  rank_dps_5v5: RankData | null
  rank_support_5v5: RankData | null

  heroes: string[]
}

/* =========================
   页面状态
========================= */

const loading = ref(true)
const saving = ref(false)

const toastMessage = ref('')

const isEditing = ref(false)

const showHeroPicker = ref(false)
const showRankPicker = ref(false)

const selectedRank = ref('')
const selectedField = ref('')

// 修改密码相关状态
const isChangingPassword = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')

// 文件库
const showFileLibrary = ref(false)

const router = useRouter();
const isAdmin = computed(() => profile.value.role === 'ADMIN' || profile.value.role === 'MODERATOR');
function goToEventLog() {
  router.push('/admin/events');
}
/* =========================
   用户资料
========================= */

const profile = ref<UserInfo>({
  battletag: '',

  rank_open_6v6: null,
  rank_tank_5v5: null,
  rank_dps_5v5: null,
  rank_support_5v5: null,

  heroes: []
})

const originalProfile = ref<UserInfo>({
  battletag: '',

  rank_open_6v6: null,
  rank_tank_5v5: null,
  rank_dps_5v5: null,
  rank_support_5v5: null,

  heroes: []
})

/* =========================
   段位列表
========================= */

const ranks = [
  'bronze',
  'silver',
  'gold',
  'platinum',
  'diamond',
  'master',
  'grandmaster',
  'champion'
]

/* =========================
   英雄列表
========================= */
const tankHeroes = ref<{ name: string; zh_name: string }[]>([])
const dpsHeroes = ref<{ name: string; zh_name: string }[]>([])
const supportHeroes = ref<{ name: string; zh_name: string }[]>([])
const heroesLoading = ref(true)

// 获取英雄列表
async function loadHeroesList() {
  try {
    const res = await fetch('/api/heroeslist')
    if (!res.ok) throw new Error('获取英雄列表失败')
    const data = await res.json()
    // data 格式: [{ id, name, zh_name, role }, ...]
    // 按 role 分组
    tankHeroes.value = data.filter((h: any) => h.role === 'tank').map((h: any) => ({ name: h.name, zh_name: h.zh_name }))
    dpsHeroes.value = data.filter((h: any) => h.role === 'damage').map((h: any) => ({ name: h.name, zh_name: h.zh_name }))
    supportHeroes.value = data.filter((h: any) => h.role === 'support').map((h: any) => ({ name: h.name, zh_name: h.zh_name }))
  } catch (err) {
    console.error(err)
    showToast('加载英雄列表失败')
  } finally {
    heroesLoading.value = false
  }
}

/* =========================
   图片工具
========================= */

function getHeroImage(hero: string) {
  return `/res/imge/hero/${hero}.png`
}

function getRankImage(rank: string) {
  return `/res/imge/rank/${rank}.png`
}

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = '/res/imge/default-avatar.png'
  img.onerror = null // 防止无限循环
}

/* =========================
   Toast
========================= */

function showToast(message: string) {
  toastMessage.value = message

  setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

/* =========================
   编辑模式
========================= */

function toggleEdit() {
  if (isEditing.value) {
    cancelEdit()
    return
  }

  originalProfile.value =
    JSON.parse(
      JSON.stringify(profile.value)
    )

  isEditing.value = true
}

function cancelEdit() {
  profile.value =
    JSON.parse(
      JSON.stringify(
        originalProfile.value
      )
    )

  isEditing.value = false

  showHeroPicker.value = false
  showRankPicker.value = false

  showToast('已取消修改')
}

/* =========================
   Hero
========================= */

function selectHero(hero: string) {
  if (
    profile.value.heroes.includes(hero)
  ) {
    showToast('该英雄已存在')
    return
  }

  if (
    profile.value.heroes.length >= 5
  ) {
    showToast('最多选择5名英雄')
    return
  }

  profile.value.heroes.push(hero)

  showHeroPicker.value = false
}

function removeHero(index: number) {
  profile.value.heroes.splice(
    index,
    1
  )
}

/* =========================
   Rank
========================= */

function openRankPicker(
  field: string
) {
  if (!isEditing.value) return

  selectedField.value = field

  selectedRank.value = ''

  showRankPicker.value = true
}

function closeRankPicker() {
  showRankPicker.value = false

  selectedField.value = ''
  selectedRank.value = ''
}

function selectRank(
  rank: string
) {
  selectedRank.value = rank
}

function selectRankLevel(
  level: number
) {
  if (
    !selectedField.value ||
    !selectedRank.value
  ) {
    return
  }

  ; (
    profile.value as any
  )[selectedField.value] = {
    rank: selectedRank.value,
    level
  }

  showRankPicker.value = false

  selectedField.value = ''
  selectedRank.value = ''

  showToast('段位已更新')
}

/* =========================
   Picker
========================= */

function closeAllPicker() {
  showHeroPicker.value = false
  showRankPicker.value = false
}

/* =========================
   加载资料
========================= */

async function loadProfile() {
  try {
    loading.value = true

    const meRes =
      await authFetch(
        '/api/users/me'
      )

    if (!meRes.ok) {
      throw new Error(
        '获取用户失败'
      )
    }

    const me =
      await meRes.json()

    const battletag =
      encodeURIComponent(
        me.battletag
      )

    const detailRes =
      await authFetch(
        `/api/${battletag}/rank_hero`
      )

    if (!detailRes.ok) {
      throw new Error(
        '获取详情失败'
      )
    }

    const detail =
      await detailRes.json()

    const parseRank = (
      value: any
    ): RankData | null => {
      if (!value) return null

      if (
        typeof value === 'object'
      ) {
        return value
      }

      if (
        typeof value === 'string'
      ) {
        try {
          return JSON.parse(value)
        } catch {
          return null
        }
      }

      return null
    }

    profile.value = {
      battletag:
        detail.battletag || '',

      role: detail.role,

      rank_open_6v6:
        parseRank(
          detail.rank_open_6v6
        ),

      rank_tank_5v5:
        parseRank(
          detail.rank_tank_5v5
        ),

      rank_dps_5v5:
        parseRank(
          detail.rank_dps_5v5
        ),

      rank_support_5v5:
        parseRank(
          detail.rank_support_5v5
        ),

      heroes:
        detail.heroes || []
    }

    originalProfile.value =
      JSON.parse(
        JSON.stringify(
          profile.value
        )
      )
  } catch (err) {
    console.error(err)

    showToast(
      '加载资料失败'
    )
  } finally {
    loading.value = false
  }
}

/* =========================
   保存资料
========================= */

async function saveProfile() {
  try {
    saving.value = true

    await authFetch(
      '/api/user/heroes',
      {
        method: 'PUT',
        body: JSON.stringify({
          heroes:
            profile.value.heroes
        })
      }
    )

    await authFetch(
      '/api/user/rank',
      {
        method: 'PUT',
        body: JSON.stringify({
          rank_open_6v6:
            profile.value.rank_open_6v6,

          rank_tank_5v5:
            profile.value.rank_tank_5v5,

          rank_dps_5v5:
            profile.value.rank_dps_5v5,

          rank_support_5v5:
            profile.value.rank_support_5v5
        })
      }
    )

    originalProfile.value =
      JSON.parse(
        JSON.stringify(
          profile.value
        )
      )

    isEditing.value = false

    showToast('保存成功')
  } catch (err) {
    console.error(err)

    showToast('保存失败')
  } finally {
    saving.value = false
  }
}

/* =========================
   Avatar
========================= */

// 添加一个时间戳来强制刷新图片，避免浏览器缓存旧头像
const avatarTimestamp = ref<number>(Date.now())

const avatarUrl = computed(() => {
  if (!profile.value.battletag) {
    return '/res/imge/default-avatar.png'
  }
  // 在 URL 后添加时间戳参数以破坏缓存
  return `/api/users/${encodeURIComponent(profile.value.battletag)}/avatar?t=${avatarTimestamp.value}`
})

// 处理头像文件选择与上传
async function handleAvatarChange(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]

  if (!file) return

  // 简单校验文件大小 (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showToast('头像大小不能超过 5MB')
    return
  }

  try {
    const formData = new FormData()
    formData.append('avatar', file)

    const token = localStorage.getItem('authToken')
    // 注意：这里假设 battletag 不需要再次编码，因为它是从 profile 中获取的原始值
    // 但为了安全起见，URL 路径中的特殊字符最好还是编码一下，不过 fetch 的 URL 字符串通常能处理
    const url = `/api/users/${encodeURIComponent(profile.value.battletag)}/avatar`

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
        // 注意：发送 FormData 时不要手动设置 Content-Type，浏览器会自动设置 boundary
      },
      body: formData
    })

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      throw new Error(errData.error || '头像上传失败')
    }

    // 上传成功，更新时间戳以刷新图片显示
    avatarTimestamp.value = Date.now()
    showToast('头像更新成功')

    // 清空 input，允许重复选择同一文件
    target.value = ''
  } catch (err: any) {
    console.error(err)
    showToast(err.message || '头像上传出错')
  }
}


/* =========================
   登出
========================= */

function logout() {
  localStorage.removeItem(
    'authToken'
  )

  location.href = '/'
}


/* =========================
   修改密码
========================= */

function startChangePassword() {
  isChangingPassword.value = true
  newPassword.value = ''
  confirmPassword.value = ''
}

function cancelPasswordChange() {
  isChangingPassword.value = false
  newPassword.value = ''
  confirmPassword.value = ''
}

async function submitPasswordChange() {
  const pwd = newPassword.value.trim()
  if (!pwd || pwd.length < 6) {
    showToast('新密码长度不能少于6位')
    return
  }
  if (pwd !== confirmPassword.value.trim()) {
    showToast('两次输入的密码不一致')
    return
  }

  try {
    const token = localStorage.getItem('authToken')
    const encodedBattletag = encodeURIComponent(profile.value.battletag)
    const url = `/api/users/${encodedBattletag}/change-password`

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ newPassword: pwd })
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '修改失败')

    showToast('密码修改成功，请重新登录')
    // 可选：自动退出登录或清空token强制重新登录
    setTimeout(() => {
      logout()
    }, 1500)
  } catch (err: any) {
    console.error(err)
    showToast(err.message || '修改密码失败')
  } finally {
    cancelPasswordChange()
  }
}

/* =========================
   生命周期
========================= */

onMounted(() => {
  loadProfile()
  loadHeroesList()
})
</script>
<style scoped>
.profile-page {
  min-height: 100vh;
  padding-bottom: 90px;
}

.profile-page .content-area {
  position: relative;
  z-index: 3;
  padding: 50px 20px;
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
}

/* =========================
   主体
========================= */

.profile-container {
  max-width: 900px;
  margin: 0 auto;
  padding: 80px 20px 40px;
}

.loading {
  text-align: center;
  padding: 120px 20px;
  font-size: 18px;
}

/* =========================
   编辑按钮
========================= */

.top-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 30px;
  margin-bottom: 12px;
}

.top-action-btn {
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  font-size: 14px;
  color: #000;
  background: #2c6bff47;
  transition: opacity .2s;
}
.top-action-btn:hover {
  opacity: .7;
}

/* =========================
   头像
========================= */

.profile-avatar {
  width: 130px;
  height: 130px;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  margin: 0 auto;
  border: 4px solid var(--accent);
  background: var(--surface);
}

.profile-greeting {
  text-align: center;
  margin-top: 18px;
  opacity: .85;
  font-size: 18px;
}

.profile-id {
  text-align: center;
  font-size: 28px;
  font-weight: bold;
  margin-top: 8px;
  margin-bottom: 30px;
  word-break: break-all;
}


.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 30px;
}

.avatar-wrapper {
  position: relative;
  display: inline-block;
}

/* 编辑头像按钮样式 */
.edit-avatar-btn {
  position: absolute;
  bottom: 5px;
  right: 5px;
  width: 36px;
  height: 36px;
  background: var(--accent);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: transform 0.2s;
  font-size: 18px;
  color: white;
  border: 2px solid var(--surface);
}

.edit-avatar-btn:hover {
  transform: scale(1.1);
  background: var(--accent-hover, #1e90ff);
  /* 如果有 accent-hover 变量 */
}

.profile-greeting {
  text-align: center;
  margin-top: 18px;
  opacity: .85;
  font-size: 18px;
}

.profile-id {
  text-align: center;
  font-size: 28px;
  font-weight: bold;
  margin-top: 8px;
  word-break: break-all;
}

/* =========================
   段位区域
========================= */

.rank-section {
  background: var(--surface);
  border-radius: 16px;
  padding: 0px;
  margin-bottom: 24px;
}

.rank-section h3 {
  margin-bottom: 20px;
}

.rank-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
}

.rank-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rank-title {
  font-size: 12px;
  margin-bottom: 0px;
}

.profile-rank {
  width: 60px;
  height: 60px;
  position: relative;
  cursor: pointer;
}

.profile-rank img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.rank-level {
  position: absolute;
  bottom: 5px;
  right: 5px;
  color: #222;
  padding: 2px 2x;
  font-size: 12px;
}

/* 深色模式 */
.dark-theme .rank-level {
  color: #fff;
}

.empty-rank {
  width: 50px;
  height: 50px;
  border: 2px dashed #888;
  border-radius: 14px;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 28px;
  cursor: pointer;
}

/* =========================
   英雄区域
========================= */

.hero-edit-wrapper {
  background: var(--surface);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
}

.hero-edit-wrapper h3 {
  margin-bottom: 20px;
}

.profile-heroes {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.hero-slot {
  width: 50px;
  height: 50px;
  position: relative;
}

.profile-hero-icon {
  width: 100%;
  height: 100%;
}

.profile-hero-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.remove-hero {
  position: absolute;
  top: -6px;
  right: -6px;

  width: 22px;
  height: 22px;

  border: none;
  border-radius: 50%;

  background: #ff4d4f;
  color: white;

  cursor: pointer;
}

.empty-slot {
  width: 50px;
  height: 50px;

  border: 2px dashed #888;
  border-radius: 12px;

  display: flex;
  align-items: center;
  justify-content: center;

  font-size: 32px;
  cursor: pointer;
}

/* =========================
   保存按钮
========================= */

.edit-actions {
  display: flex;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}

.btn-save,
.btn-cancel {
  border: none;
  border-radius: 10px;
  padding: 10px 24px;
  cursor: pointer;
}

.btn-save {
  background: var(--accent);
  color: white;
}

.btn-cancel {
  background: #666;
  color: white;
}

/* =========================
   Hero Picker
========================= */

.hero-picker,
.rank-picker {
  position: fixed;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);

  z-index: 1001;

  background: rgba(35, 35, 35, .96);
  backdrop-filter: blur(12px);

  border-radius: 18px;
}

.hero-picker {
  width: 95%;
  max-width: 900px;
  max-height: 85vh;
  overflow-y: auto;
  padding: 24px;
}

.picker-close {
  position: absolute;
  top: 10px;
  right: 12px;

  border: none;
  background: none;

  color: white;
  font-size: 28px;

  cursor: pointer;
}

.picker-title {
  text-align: center;
  font-size: 22px;
  font-weight: bold;
  margin-bottom: 24px;
}

.hero-groups {
  display: flex;
  gap: 20px;
}

.hero-group {
  flex: 1;
}

.group-title {
  text-align: center;
  margin-bottom: 12px;
  font-weight: bold;
}

.hero-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.hero-picker-item {
  background: var(--surface);
  border-radius: 10px;
  padding: 8px;
  text-align: center;
  cursor: pointer;

  transition: .15s;
}

.hero-picker-item:hover {
  transform: scale(1.05);
}

.hero-picker-item img {
  width: 52px;
  height: 52px;
  object-fit: contain;
}

.hero-name {
  margin-top: 4px;
  font-size: 12px;
}

/* =========================
   Rank Picker
========================= */

.rank-picker {
  width: 420px;
  padding: 24px;
}

.rank-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.rank-item {
  text-align: center;
  cursor: pointer;
  border-radius: 10px;
  padding: 8px;
}

.rank-item:hover {
  background: rgba(255, 255, 255, .08);
}

.rank-item img {
  width: 70px;
  height: 70px;
}

.rank-level-grid {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 20px;
}

.rank-level-btn {
  width: 42px;
  height: 42px;

  border: none;
  border-radius: 50%;

  cursor: pointer;

  background: var(--accent);
  color: white;
}

/* =========================
   遮罩
========================= */

.picker-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .65);
  z-index: 1000;
}

/* =========================
   登出
========================= */

.logout-section {
  text-align: center;
  margin-top: 40px;
}

.logout-btn {
  border: none;
  border-radius: 10px;
  padding: 12px 22px;
  background: #ff4d4f;
  color: white;
  cursor: pointer;
  font-size: 16px;
}

/* 修改密码区域 */
.change-password-section {
  margin-top: 20px;
  text-align: center;
}

.change-pwd-btn {
  background: #2c6bff;
  color: white;
  border: none;
  border-radius: 10px;
  padding: 12px 22px;
  cursor: pointer;
  font-size: 16px;
}

.password-edit-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}

.pwd-input {
  width: 260px;
  padding: 10px;
  border-radius: 8px;
  border: 1px solid #ccc;
  background: var(--bg-body);
  color: var(--text-primary);
}

.pwd-actions {
  display: flex;
  gap: 16px;
}

.pwd-submit,
.pwd-cancel {
  border: none;
  border-radius: 8px;
  padding: 8px 20px;
  cursor: pointer;
  font-size: 14px;
}

.pwd-submit {
  background: #2c6bff;
  color: white;
}

.pwd-cancel {
  background: #666;
  color: white;
}

/* 管理员日志按钮 */
.admin-log-btn {
  position: fixed;
  bottom: 80px;      /* 避开底部导航栏（高度64px） */
  left: 20px;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--accent);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 24px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  z-index: 100;
  transition: 0.2s;
}
.admin-log-btn:hover {
  transform: scale(1.05);
  opacity: 0.9;
}

/* =========================
   手机适配
========================= */

@media (max-width: 768px) {
  /* .rank-list 保持默认的 4 列布局，不再强制改为 2 列 */

  .hero-groups {
    flex-direction: column;
  }

  .rank-picker {
    width: 92%;
  }
}
</style>