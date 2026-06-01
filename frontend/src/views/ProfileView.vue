<template>
  <div class="profile-page">

    <!-- 主题切换 -->
    <ThemeToggle />

    <!-- Toast -->
    <Toast
      :message="toastMessage"
      :duration="3000"
    />

    <!-- 编辑按钮 -->
    <div class="top-actions">
      <button
        class="edit-btn"
        @click="toggleEdit"
      >
        {{ isEditing ? '取消编辑' : '编辑资料' }}
      </button>
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="loading"
    >
      加载中...
    </div>

    <!-- 主体 -->
    <div
      v-else
      class="profile-container"
    >

      <!-- 用户头像 -->
      <div class="profile-header">

        <img
          class="profile-avatar"
          :src="avatarUrl"
          @error="onAvatarError"
        >

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
              开放职责 6v6
            </div>

            <div
              class="profile-rank"
              @click="openRankPicker('rank_open_6v6')"
            >

              <template v-if="profile.rank_open_6v6">

                <img
                  :src="getRankImage(profile.rank_open_6v6.rank)"
                >

                <div class="rank-level">
                  {{ profile.rank_open_6v6.level }}
                </div>

              </template>

              <div
                v-else
                class="empty-rank"
              >
                +
              </div>

            </div>

          </div>

          <!-- 重装 -->
          <div class="rank-card">

            <div class="rank-title">
              重装
            </div>

            <div
              class="profile-rank"
              @click="openRankPicker('rank_tank_5v5')"
            >

              <template v-if="profile.rank_tank_5v5">

                <img
                  :src="getRankImage(profile.rank_tank_5v5.rank)"
                >

                <div class="rank-level">
                  {{ profile.rank_tank_5v5.level }}
                </div>

              </template>

              <div
                v-else
                class="empty-rank"
              >
                +
              </div>

            </div>

          </div>

          <!-- 输出 -->
          <div class="rank-card">

            <div class="rank-title">
              输出
            </div>

            <div
              class="profile-rank"
              @click="openRankPicker('rank_dps_5v5')"
            >

              <template v-if="profile.rank_dps_5v5">

                <img
                  :src="getRankImage(profile.rank_dps_5v5.rank)"
                >

                <div class="rank-level">
                  {{ profile.rank_dps_5v5.level }}
                </div>

              </template>

              <div
                v-else
                class="empty-rank"
              >
                +
              </div>

            </div>

          </div>

          <!-- 辅助 -->
          <div class="rank-card">

            <div class="rank-title">
              辅助
            </div>

            <div
              class="profile-rank"
              @click="openRankPicker('rank_support_5v5')"
            >

              <template v-if="profile.rank_support_5v5">

                <img
                  :src="getRankImage(profile.rank_support_5v5.rank)"
                >

                <div class="rank-level">
                  {{ profile.rank_support_5v5.level }}
                </div>

              </template>

              <div
                v-else
                class="empty-rank"
              >
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

          <div
            v-for="(hero,index) in profile.heroes"
            :key="hero + index"
            class="hero-slot"
          >

            <div class="profile-hero-icon">

              <img
                :src="getHeroImage(hero)"
                :alt="hero"
              >

              <button
                v-if="isEditing"
                class="remove-hero"
                @click="removeHero(index)"
              >
                ×
              </button>

            </div>

          </div>

          <!-- 添加英雄 -->
          <div
            v-if="isEditing && profile.heroes.length < 5"
            class="hero-slot"
          >

            <div
              class="empty-slot"
              @click="showHeroPicker = true"
            >
              +
            </div>

          </div>

        </div>

      </section>

      <!-- 保存 -->
      <div
        v-if="isEditing"
        class="edit-actions"
      >

        <button
          class="btn-save"
          @click="saveProfile"
        >
          保存资料
        </button>

        <button
          class="btn-cancel"
          @click="cancelEdit"
        >
          放弃修改
        </button>

      </div>

      <!-- 登出 -->
      <div class="logout-section">

        <button
          class="logout-btn"
          @click="logout"
        >
          退出登录
        </button>

      </div>

    </div>

    <!-- Hero Picker -->
    <div
      v-if="showHeroPicker"
      class="hero-picker"
    >

      <button
        class="picker-close"
        @click="showHeroPicker = false"
      >
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

            <div
              v-for="hero in tankHeroes"
              :key="hero"
              class="hero-picker-item"
              @click="selectHero(hero)"
            >

              <img
                :src="getHeroImage(hero)"
              >

              <div class="hero-name">
                {{ hero }}
              </div>

            </div>

          </div>

        </div>

        <!-- DPS -->
        <div class="hero-group">

          <div class="group-title">
            输出
          </div>

          <div class="hero-grid">

            <div
              v-for="hero in dpsHeroes"
              :key="hero"
              class="hero-picker-item"
              @click="selectHero(hero)"
            >

              <img
                :src="getHeroImage(hero)"
              >

              <div class="hero-name">
                {{ hero }}
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

            <div
              v-for="hero in supportHeroes"
              :key="hero"
              class="hero-picker-item"
              @click="selectHero(hero)"
            >

              <img
                :src="getHeroImage(hero)"
              >

              <div class="hero-name">
                {{ hero }}
              </div>

            </div>

          </div>

        </div>

      </div>

    </div>

    <!-- Rank Picker -->
    <div
      v-if="showRankPicker"
      class="rank-picker"
    >

      <button
        class="picker-close"
        @click="closeRankPicker"
      >
        ×
      </button>

      <div class="picker-title">
        选择段位
      </div>

      <div class="rank-grid">

        <div
          v-for="rank in ranks"
          :key="rank"
          class="rank-item"
          @click="selectRank(rank)"
        >

          <img
            :src="getRankImage(rank)"
          >

          <span>
            {{ rank }}
          </span>

        </div>

      </div>

      <div
        v-if="selectedRank"
        class="rank-level-grid"
      >

        <button
          v-for="level in [1,2,3,4,5]"
          :key="level"
          class="rank-level-btn"
          @click="selectRankLevel(level)"
        >
          {{ level }}
        </button>

      </div>

    </div>

    <!-- 遮罩 -->
    <div
      v-if="showHeroPicker || showRankPicker"
      class="picker-mask"
      @click="closeAllPicker"
    />

    <!-- 底部导航 -->
    <div class="fixed-bottom-nav">

      <router-link
        to="/news"
        class="nav-tab"
      >
        黑爪动态
      </router-link>

      <router-link
        to="/main"
        class="nav-tab"
      >
        主页
      </router-link>

      <router-link
        to="/profile"
        class="nav-tab active"
      >
        我的
      </router-link>

    </div>

  </div>
</template>
<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Toast from '@/components/Toast.vue'
import { authFetch } from '@/utils/request'

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

const tankHeroes = [
  'dva',
  'doomfist',
  'hazard',
  'junker-queen',
  'mauga',
  'orisa',
  'ramattra',
  'reinhardt',
  'roadhog',
  'sigma',
  'winston',
  'wrecking-ball',
  'zarya'
]

const dpsHeroes = [
  'ashe',
  'bastion',
  'cassidy',
  'echo',
  'freja',
  'genji',
  'hanzo',
  'junkrat',
  'mei',
  'pharah',
  'reaper',
  'sojourn',
  'soldier-76',
  'sombra',
  'symmetra',
  'torbjorn',
  'tracer',
  'venture',
  'widowmaker'
]

const supportHeroes = [
  'ana',
  'baptiste',
  'brigitte',
  'illari',
  'juno',
  'kiriko',
  'lifeweaver',
  'lucio',
  'mercy',
  'moira',
  'zenyatta'
]

/* =========================
   Avatar
========================= */

const avatarUrl = computed(() => {
  if (!profile.value.battletag) {
    return '/res/imge/default-avatar.png'
  }

  return `/res/imge/${profile.value.battletag.replace(
    /#/g,
    '-'
  )}.jpg`
})

/* =========================
   图片工具
========================= */

function getHeroImage(hero: string) {
  return `/res/imge/hero/${hero}.png`
}

function getRankImage(rank: string) {
  return `/res/imge/rank/${rank}.png`
}

function onAvatarError(
  e: Event
) {
  const img = e.target as HTMLImageElement

  img.src =
    '/res/imge/default-avatar.png'
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

  ;(
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
   登出
========================= */

function logout() {
  localStorage.removeItem(
    'authToken'
  )

  location.href = '/'
}

/* =========================
   生命周期
========================= */

onMounted(() => {
  loadProfile()
})
</script>
<style scoped>
@import "../style/main.css";

.profile-page {
  min-height: 100vh;
  padding-bottom: 90px;
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

.edit-btn {
  position: fixed;
  top: 18px;
  left: 20px;
  z-index: 100;
  border: none;
  border-radius: 10px;
  padding: 10px 16px;
  cursor: pointer;
  background: var(--accent);
  color: #fff;
  font-size: 14px;
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

/* =========================
   段位区域
========================= */

.rank-section {
  background: var(--surface);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
}

.rank-section h3 {
  margin-bottom: 20px;
}

.rank-list {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

.rank-card {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.rank-title {
  font-size: 14px;
  margin-bottom: 10px;
}

.profile-rank {
  width: 80px;
  height: 80px;
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
  bottom: -4px;
  right: -4px;
  background: rgba(0,0,0,.75);
  color: white;
  padding: 2px 7px;
  border-radius: 8px;
  font-size: 12px;
}

.empty-rank {
  width: 80px;
  height: 80px;
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
  gap: 16px;
  flex-wrap: wrap;
}

.hero-slot {
  width: 80px;
  height: 80px;
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
  width: 80px;
  height: 80px;

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

  background: rgba(35,35,35,.96);
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
  background: rgba(255,255,255,.08);
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
  background: rgba(0,0,0,.65);
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
}

/* =========================
   底部导航
========================= */

.fixed-bottom-nav {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;

  height: 64px;

  display: flex;

  background: var(--surface);

  border-top: 1px solid var(--border);

  z-index: 999;
}

.nav-tab {
  flex: 1;

  display: flex;
  align-items: center;
  justify-content: center;

  text-decoration: none;
  color: var(--text-primary);
}

.nav-tab.active {
  color: var(--accent);
  font-weight: bold;
}

/* =========================
   手机适配
========================= */

@media (max-width: 768px) {
  .rank-list {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-groups {
    flex-direction: column;
  }

  .rank-picker {
    width: 92%;
  }
}
</style>