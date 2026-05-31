<template>
  <div class="join-play">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">这个未来值得为之奋战</div>
      <div class="poster-wrapper">
        <PosterHeroes />
      </div>
      <Toast :message="toastMessage" :duration="3000" />
      <div class="section">
        <h2 class="section-title">成员名单</h2>
        <div class="members-grid">
          <MemberCard
            v-for="member in sortedMembers"
            :key="member.username"
            :user="member"
            :self-tag="selfTag"
            :current-expand-id="currentExpandId"
            :like-cache="likeCache"
            :eval-cache="evalCache"
            :fetch-evaluations="fetchEvaluations"
            @expand-like="handleExpandLike"
            @expand-eval="handleExpandEval"
            @like-click="handleLikeClick"
            @eval-submit="handleEvalSubmit"
          />
        </div>
      </div>

      <!-- 底部静态区块 -->
      <div class="section">
        <h2 class="section-title">活动亮点</h2>
        <div class="test-elements-grid">
          <div class="test-element">特色玩法</div>
          <div class="test-element">限定皮肤</div>
          <div class="test-element">专属成就</div>
          <div class="test-element">团队竞技</div>
        </div>
      </div>
      <div class="section">
        <h2 class="section-title">测试内容区域</h2>
        <p class="section-content">
          此区域用于展示测试元素和占位内容。<br />
          在实际开发中，这里将包含更多详细信息、排行榜、玩家统计数据等内容。
        </p>
        <div class="test-elements-grid">
          <div class="test-element">数据统计</div>
          <div class="test-element">排行榜</div>
          <div class="test-element">奖励预览</div>
          <div class="test-element">玩家社区</div>
        </div>
      </div>
    </div>

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
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive, nextTick } from 'vue'
import MemberCard from './MemberCard.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import PosterHeroes from '@/components/PosterHeroes.vue'
import Toast from '@/components/Toast.vue'

// ---------- 类型定义 ----------
interface UserData {
  username: string
  hero?: string[]
  rank_open_6v6?: { rank: string; level: number } | null
  rank_tank_5v5?: { rank: string; level: number } | null
  rank_dps_5v5?: { rank: string; level: number } | null
  rank_support_5v5?: { rank: string; level: number } | null
  error?: boolean
}

interface LikeItem {
  ID: string
  Like: number
}

interface EvalItem {
  ID: string
  evaluation: string
}

// ---------- 全局状态 ----------
const token = localStorage.getItem('authToken')
const selfTag = ref<string | null>(null)
const members = ref<UserData[]>([])
// 将 likeCache 改为响应式对象，以便 Vue 检测变化
const likeCache = reactive<Record<string, LikeItem[]>>({})
const evalCache = new Map<string, EvalItem[]>()
const toastMessage = ref('')
const currentExpandId = ref<string>('')

// 防止短时间内重复点赞（简单锁）
const likePending = new Map<string, boolean>()

// ---------- 辅助函数 ----------
async function fetchUserList(): Promise<string[]> {
  const res = await fetch('/api/users/battletaglist')
  if (!res.ok) throw new Error('获取用户列表失败')
  selfTag.value = await fetch('/api/users/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
    .then(res => res.json())
    .then(data => data.battletag)
  const battletagList: string[] = await res.json()
  return battletagList
}

async function fetchUserData(username: string): Promise<UserData> {
  const encoded = encodeURIComponent(username)
  const url = `/api/${encoded}/rank_hero`
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const parseRank = (raw: any): { rank: string; level: number } | null => {
      if (!raw) return null
      if (typeof raw === 'object') return raw
      if (typeof raw === 'string') {
        try { return JSON.parse(raw) } catch { return null }
      }
      return null
    }
    return {
      username: data.battletag,
      hero: data.heroes,
      rank_open_6v6: parseRank(data.rank_open_6v6),
      rank_tank_5v5: parseRank(data.rank_tank_5v5),
      rank_dps_5v5: parseRank(data.rank_dps_5v5),
      rank_support_5v5: parseRank(data.rank_support_5v5)
    }
  } catch {
    return { username, hero: [], error: true }
  }
}

// ---------- 点赞数据 ----------
async function fetchLikes(username: string): Promise<LikeItem[]> {
  if (likeCache[username]) return likeCache[username]
  const encoded = encodeURIComponent(username)
  const url = `/api/${encoded}/likelist`
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return []
    const data = await res.json()
    if (Array.isArray(data)) {
      likeCache[username] = data
      return data
    }
    return []
  } catch {
    return []
  }
}

function getTotalLikes(username: string): number {
  const likes = likeCache[username] || []
  return likes.reduce((sum, item) => sum + (item.Like || 0), 0)
}

// 每次点击立即发送一次点赞请求（不再累积）
async function submitLike(targetUser: string) {
  const self = selfTag.value
  if (!self) return

  // 防止重复请求（对同一个目标用户，上一个请求未完成时忽略新点击）
  if (likePending.get(targetUser)) return
  likePending.set(targetUser, true)

  const encoded = encodeURIComponent(targetUser)
  const url = `/api/${encoded}/like`

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
      // 不再发送 increment 字段，后端默认加 1
    })

    const data = await res.json()
    if (!res.ok) {
      let errorMsg = ''
      if (res.status === 429) {
        errorMsg = data.error || '今日点赞已达上限'
      } else {
        errorMsg = data.error || '点赞失败，请稍后重试'
      }
      toastMessage.value = ''
      setTimeout(() => { toastMessage.value = errorMsg }, 0)
      throw new Error(data.error)
    }

    const newTotalLike = data.likeCount // 当前用户给目标用户的累计总赞数

    // 更新 likeCache[targetUser] 中当前用户自己的 Like 值
    const currentLikes = [...(likeCache[targetUser] || [])]
    const existingIndex = currentLikes.findIndex(item => item.ID === self)
    if (existingIndex >= 0) {
      currentLikes[existingIndex].Like = newTotalLike
    } else {
      currentLikes.push({ ID: self, Like: newTotalLike })
    }
    currentLikes.sort((a, b) => b.Like - a.Like)
    // 直接赋值触发响应式更新
    likeCache[targetUser] = currentLikes
  } catch (err) {
    console.error('点赞失败:', err)
  } finally {
    likePending.delete(targetUser)
  }
}

// ---------- 评价数据 ----------
async function fetchEvaluations(username: string): Promise<EvalItem[]> {
  if (evalCache.has(username)) return evalCache.get(username)!
  const encoded = encodeURIComponent(username)
  const url = `https://talon-public-1258609989.cos.ap-chongqing.myqcloud.com/${encoded}/evaluation.json?t=${Date.now()}`
  try {
    const res = await fetch(url)
    if (!res.ok) return []
    const data = await res.json()
    if (Array.isArray(data)) {
      evalCache.set(username, data)
      return data
    }
    return []
  } catch {
    return []
  }
}

async function saveEvaluations(username: string, evaluations: EvalItem[]) {
  const encoded = encodeURIComponent(username)
  const url = `https://talon-public-1258609989.cos.ap-chongqing.myqcloud.com/${encoded}/evaluation.json`
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(evaluations)
  })
  if (res.ok) {
    evalCache.set(username, evaluations)
  } else {
    throw new Error('保存评价失败')
  }
}

// ---------- 事件处理 ----------
function handleExpandLike(username: string) {
  const id = `like-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}

function handleExpandEval(username: string) {
  const id = `eval-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}

// 滚动到指定卡片（使其在视口中垂直居中，平滑动画）
function scrollToCard(username: string) {
  const cards = document.querySelectorAll('.member-card')
  for (const card of cards) {
    const idEl = card.querySelector('.member-id')
    if (idEl && idEl.textContent === username) {
      card.scrollIntoView({ behavior: 'smooth', block: 'center' })
      break
    }
  }
}

// 点赞点击：先发送请求，等待 DOM 更新，再滚动到卡片
async function handleLikeClick(targetUser: string) {
  await submitLike(targetUser)   // 等待点赞完成（包括 likeCache 更新）
  await nextTick()               // 等待 Vue 重新渲染 DOM
  // 微延迟确保布局完全稳定，避免滚动抖动
  setTimeout(() => scrollToCard(targetUser), 60)
}

async function handleEvalSubmit(targetUser: string, newText: string) {
  const self = selfTag.value
  if (!self) return
  let evals = await fetchEvaluations(targetUser)
  const existing = evals.find(item => item.ID === self)
  if (newText.trim() === '') {
    if (existing) evals = evals.filter(item => item.ID !== self)
  } else {
    if (existing) existing.evaluation = newText.trim()
    else evals.push({ ID: self, evaluation: newText.trim() })
  }
  await saveEvaluations(targetUser, evals)
  evalCache.delete(targetUser)
  await fetchEvaluations(targetUser)
  members.value = [...members.value]
}

// ---------- 加载成员数据 ----------
async function loadMembers() {
  const usernames = await fetchUserList()
  // 清空现有列表（避免重复）
  members.value = []
  // 逐个加载用户数据
  for (const username of usernames) {
    // 获取用户基本信息（段位、英雄等）
    const userData = await fetchUserData(username)
    if (userData.username) {
      // 获取该用户的点赞数据（缓存到 likeCache）
      await fetchLikes(username)
      // 添加到列表末尾，触发视图更新
      members.value.push(userData)
    }
  }
}

// ---------- 排序 ----------
const sortedMembers = computed(() => {
  const self = selfTag.value
  if (!self) return members.value
  return [...members.value].sort((a, b) => {
    if (a.username === self && b.username !== self) return -1
    if (a.username !== self && b.username === self) return 1
    if (a.username !== self && b.username !== self) {
      const likesA = likeCache[a.username] || []
      const likesB = likeCache[b.username] || []
      const countA = likesA.find(item => item.ID === self)?.Like || 0
      const countB = likesB.find(item => item.ID === self)?.Like || 0
      return countB - countA
    }
    return 0
  })
})

// ---------- 全局点击处理 ----------
function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.member-card')) {
    currentExpandId.value = ''
  }
}

onMounted(async () => {
  await loadMembers()
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<style>
@import '../style/main.css';
.poster-wrapper {
  width: 100%;
  aspect-ratio: 2 / 1;
}
.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 25px;
  margin-top: 20px;
}
</style>