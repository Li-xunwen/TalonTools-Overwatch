<template>
  <div class="join-play">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">这个未来值得为之奋战</div>
      <div class="poster-wrapper">
        <PosterHeroes />
      </div>
      <Toast :message="toastMessage" :duration="3000" />
      <!-- 搜索栏 -->
      <div class="search-bar">
        <input type="text" v-model="searchKeyword" placeholder="搜索战网ID..." class="search-input" @input="handleSearch" />
        <button v-if="searchKeyword" class="search-clear" @click="clearSearch">✕</button>
      </div>
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">成员名单</h2>
          <button v-if="isAdmin" class="add-member-btn" @click="createNewMember">+</button>
        </div>
        <div ref="membersGridRef" class="members-grid">
          <div
            v-for="member in visibleMembers"
            :key="member.username"
            class="member-card-wrap"
            :class="{ 'unread-wrap': unreadUsernames.has(member.username) }"
          >
            <MemberCard :user="member" :self-tag="selfTag"
              :self-role="selfRole" :current-expand-id="currentExpandId" :like-cache="likeCache" :eval-cache="evalCache"
              :pending-like-count="pendingLikeCount(member.username)"
              :like-countdown-active="!!likeCountdownActive[member.username]"
              :like-countdown-seq="likeCountdownSeq[member.username] || 0"
              :like-submitting="!!inFlightLikes[member.username]"
              :like-success="!!likeSuccess[member.username]"
              :liked-me-label="getLikedMeLabel(member.username)"
              :unread="unreadUsernames.has(member.username)"
              :unread-like="!!unreadByCard[member.username]?.hasUnreadLike"
              :unread-evaluation="unreadByCard[member.username]?.hasUnreadEvaluation ? unreadByCard[member.username]?.evaluationContent : ''"
              :unread-evaluation-actor="unreadByCard[member.username]?.evaluationActor || ''"
              :is-first-unread="member.username === firstUnreadUsername"
              :fetch-evaluations="fetchEvaluations" @expand-like="handleExpandLike" @expand-eval="handleExpandEval"
              @like-click="handleLikeClick" @eval-submit="handleEvalSubmit" @expand-career="handleExpandCareer"
              @expand-summary="handleExpandSummary" @expand-match="handleExpandMatch"
              @expand-strength="handleExpandStrength" @expand-treemap="handleExpandTreemap"
              @expand-admin="handleExpandAdmin" />
          </div>
          <div v-if="unreadUsernames.size" class="unread-guide" :style="unreadGuideStyle">
          </div>
        </div>
        <div ref="loadMoreSentinel" class="load-more-sentinel" :class="{ hidden: !hasMoreMembers }"></div>
      </div>
    </div>
  </div>
  <!-- 页脚组件 — 背景延申至底部，自动预留 BottomNav 空间 -->
  <FooterBar />
  <!-- 底部导航栏 -->
  <BottomNav />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive, nextTick, watch } from 'vue'
import MemberCard from './MemberCard.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import PosterHeroes from '@/components/PosterHeroes.vue'
import Toast from '@/components/Toast.vue'
import BottomNav from '@/components/BottomNav.vue'
import FooterBar from '@/components/FooterBar.vue'

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
  updated_at?: string
}

interface EvalItem {
  ID: string
  evaluation: string
}

interface ActivityLike {
  actor: string
  likeCount: number
  updatedAt: string
}

interface ActivityEvaluation {
  target: string
  actor: string
  content: string
  updatedAt: string
}

interface ActivityUnread {
  card: string
  latestEventId: number
  latestEventAt: string
  hasUnreadLike: boolean
  hasUnreadEvaluation: boolean
  evaluationActor: string
  evaluationContent: string
  evaluationAt: string
}

interface ActivityState {
  cursor: { like: number; evaluation: number }
  likes: ActivityLike[]
  evaluations: ActivityEvaluation[]
  unread: ActivityUnread[]
}

// ---------- 全局状态 ----------
const token = localStorage.getItem('authToken')
const selfTag = ref<string | null>(null)
const members = ref<UserData[]>([])
const likeCache = reactive<Record<string, LikeItem[]>>({})
const evalCache = new Map<string, EvalItem[]>()
const activityState = ref<ActivityState>({
  cursor: { like: 0, evaluation: 0 },
  likes: [],
  evaluations: [],
  unread: []
})
const readingActivity = ref(false)
const pendingReadClear = ref(false)
const membersGridRef = ref<HTMLElement | null>(null)
const unreadGuideStyle = ref<Record<string, string>>({})
let lastWindowScrollY = 0
const toastMessage = ref('')
const currentExpandId = ref<string>('')
const pendingLikes = reactive<Record<string, number>>({})
const inFlightLikes = reactive<Record<string, number>>({})
const likeCountdownActive = reactive<Record<string, boolean>>({})
const likeCountdownSeq = reactive<Record<string, number>>({})
const likeSuccess = reactive<Record<string, boolean>>({})
const likeIdleTimers = new Map<string, ReturnType<typeof setTimeout>>()
const rankAnimating = new Set<string>()
const rankCloneMap = new Map<string, HTMLElement>()
const nowTick = ref(Date.now())
const selfRole = ref<string | null>(null)
const searchKeyword = ref('')
const isAdmin = computed(() => selfRole.value === 'ADMIN' || selfRole.value === 'MODERATOR')
const MAX_LIKE_BATCH = 20
const LIKE_IDLE_MS = 1500
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
const PAGE_SIZE = 20
const visibleMemberCount = ref(PAGE_SIZE)
const loadMoreSentinel = ref<HTMLElement | null>(null)
let memberObserver: IntersectionObserver | null = null
let clockTimer: ReturnType<typeof setInterval> | null = null
// ---------- 辅助函数 ----------
async function fetchUserList(): Promise<string[]> {
  const res = await fetch('/api/users/battletaglist')
  if (!res.ok) throw new Error('获取用户列表失败')
  const meRes = await fetch('/api/users/me', {
    headers: { 'Authorization': `Bearer ${token}` }
  })
  const meData = await meRes.json()
  selfTag.value = meData.battletag
  selfRole.value = meData.role
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
  const encoded = encodeURIComponent(username)
  const url = `/api/${encoded}/likelist?t=${Date.now()}`
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

async function fetchActivity() {
  try {
    const res = await fetch('/api/activity', {
      headers: { 'Authorization': `Bearer ${token}` }
    })
    if (!res.ok) return
    const data = await res.json()
    activityState.value = {
      cursor: {
        like: Number(data.cursor?.like || 0),
        evaluation: Number(data.cursor?.evaluation || 0)
      },
      likes: Array.isArray(data.likes) ? data.likes : [],
      evaluations: Array.isArray(data.evaluations) ? data.evaluations : [],
      unread: Array.isArray(data.unread) ? data.unread : []
    }
    await nextTick()
    updateUnreadGuide()
    checkUnreadScrollEnd()
  } catch (error) {
    console.error('加载点赞/评价动态失败:', error)
  }
}

function getTotalLikeCount(username: string) {
  return (likeCache[username] || []).reduce((sum, item) => sum + (item.Like || 0), 0)
}

function getTodayLikeCount(username: string) {
  const self = selfTag.value
  if (!self) return 0
  const row = (likeCache[username] || []).find(item => item.ID === self)
  if (!row?.updated_at) return 0
  const updatedAt = new Date(row.updated_at)
  if (!Number.isFinite(updatedAt.getTime())) return 0
  // 历史结构把“当天点赞次数”记录在 updated_at 的秒数中
  if (updatedAt.toDateString() !== new Date().toDateString()) return 0
  return Math.min(20, Math.max(0, updatedAt.getSeconds()))
}

function pendingLikeCount(username: string) {
  return (pendingLikes[username] || 0) + (inFlightLikes[username] || 0)
}

function showLikeToast(message: string) {
  toastMessage.value = ''
  setTimeout(() => { toastMessage.value = message }, 0)
}

function scheduleLikeFlush(targetUser: string) {
  const oldTimer = likeIdleTimers.get(targetUser)
  if (oldTimer) clearTimeout(oldTimer)
  const timer = setTimeout(() => {
    likeIdleTimers.delete(targetUser)
    likeCountdownActive[targetUser] = false
    void flushLikes(targetUser)
  }, LIKE_IDLE_MS)
  likeIdleTimers.set(targetUser, timer)
}

function enqueueLike(targetUser: string) {
  if (!selfTag.value) return

  const remaining = Math.max(0, 20 - getTodayLikeCount(targetUser))
  const currentPending = pendingLikes[targetUser] || 0
  const currentInFlight = inFlightLikes[targetUser] || 0

  // 已满 20 次后继续点击只延长“停手”计时，不再增加数量或立即提交。
  if (currentPending >= MAX_LIKE_BATCH) {
    likeCountdownSeq[targetUser] = (likeCountdownSeq[targetUser] || 0) + 1
    likeCountdownActive[targetUser] = true
    scheduleLikeFlush(targetUser)
    return
  }

  if (currentInFlight + currentPending >= remaining) {
    // 已达今日上限：卡片自身已经播放 4 个上浮 emoji，不再进入倒计时/提交
    showLikeToast('每日最多给他20个赞哦')
    return
  }

  pendingLikes[targetUser] = currentPending + 1
  likeCountdownSeq[targetUser] = (likeCountdownSeq[targetUser] || 0) + 1
  likeCountdownActive[targetUser] = true
  scheduleLikeFlush(targetUser)
}

function findCardElement(username: string): HTMLElement | null {
  const cards = document.querySelectorAll<HTMLElement>('.member-card')
  for (const card of cards) {
    if (card.dataset.username === username) return card
  }
  return null
}

interface CardSnapshot {
  index: number
  rect: DOMRect
}

function captureCardSnapshot(username: string): CardSnapshot | null {
  const index = filteredMembers.value.findIndex(member => member.username === username)
  const el = findCardElement(username)
  if (index < 0 || !el) return null
  return { index, rect: el.getBoundingClientRect() }
}

function updateRankCloneCount(clone: HTMLElement | undefined, targetUser: string) {
  if (!clone) return
  const countEl = clone.querySelector<HTMLElement>('.like-count')
  if (!countEl) return
  const total = getTotalLikeCount(targetUser)
  const pending = pendingLikeCount(targetUser)
  countEl.textContent = pending > 0 ? `${total}+${pending}` : String(total)
}

function spawnCloneEmojis(clone: HTMLElement) {
  const layer = clone.querySelector<HTMLElement>('.like-emoji-layer')
  if (!layer) return
  const scopeAttr = Array.from(layer.attributes)
    .find(attribute => attribute.name.startsWith('data-v-'))?.name
  const emojis = ['❤️', '💖', '🌹', '🎁', '💐', '✨']
  const nodes: HTMLElement[] = []
  for (let index = 0; index < 4; index += 1) {
    const node = document.createElement('span')
    node.className = 'like-float-emoji'
    node.textContent = emojis[Math.floor(Math.random() * emojis.length)]
    node.style.setProperty('--like-x', `${(Math.random() - 0.5) * 28}px`)
    node.style.setProperty('--like-drift', `${(Math.random() - 0.5) * 34}px`)
    node.style.setProperty('--like-rot', `${(Math.random() - 0.5) * 36}deg`)
    node.style.setProperty('--like-delay', `${Math.floor(Math.random() * 60)}ms`)
    if (scopeAttr) node.setAttribute(scopeAttr, '')
    layer.appendChild(node)
    nodes.push(node)
  }
  setTimeout(() => nodes.forEach(node => node.remove()), 1650)
}

async function animateRankRise(targetUser: string, before: CardSnapshot) {
  if (rankAnimating.has(targetUser)) return

  const newIndex = filteredMembers.value.findIndex(member => member.username === targetUser)
  if (newIndex < 0 || newIndex >= before.index) return

  const card = findCardElement(targetUser)
  if (!card) return
  const newRect = card.getBoundingClientRect()
  if (!before.rect || newRect.height <= 0) return

  rankAnimating.add(targetUser)
  const clone = card.cloneNode(true) as HTMLElement
  clone.classList.add('rank-rise-clone')
  Object.assign(clone.style, {
    position: 'fixed',
    top: `${before.rect.top}px`,
    left: `${before.rect.left}px`,
    width: `${before.rect.width}px`,
    height: `${before.rect.height}px`,
    margin: '0',
    zIndex: '9999',
    pointerEvents: 'auto',
    transform: 'none'
  })

  card.style.visibility = 'hidden'
  document.body.appendChild(clone)
  rankCloneMap.set(targetUser, clone)
  const cloneHeartWrap = clone.querySelector<HTMLElement>('.like-heart-wrap')
  let cloneCheck: HTMLElement | null = null
  if (cloneHeartWrap && !cloneHeartWrap.querySelector('.like-check')) {
    cloneHeartWrap.classList.add('success')
    cloneCheck = document.createElement('span')
    cloneCheck.className = 'like-check'
    cloneCheck.textContent = '✓'
    cloneCheck.setAttribute('aria-hidden', 'true')
    const scopeAttr = Array.from(cloneHeartWrap.attributes)
      .find(attribute => attribute.name.startsWith('data-v-'))?.name
    if (scopeAttr) cloneCheck.setAttribute(scopeAttr, '')
    cloneHeartWrap.appendChild(cloneCheck)
    setTimeout(() => {
      cloneHeartWrap.classList.remove('success')
      cloneCheck?.remove()
    }, 500)
  }

  const cloneLikeButton = clone.querySelector<HTMLElement>('.like-button-container')
  cloneLikeButton?.addEventListener('click', (event) => {
    event.stopPropagation()
    enqueueLike(targetUser)
    updateRankCloneCount(clone, targetUser)
    spawnCloneEmojis(clone)
    clone.classList.remove('rank-clone-pulse')
    void clone.offsetWidth
    clone.classList.add('rank-clone-pulse')
  })

  const delta = newRect.top - before.rect.top
  if (Math.abs(delta) > 1) {
    window.scrollBy({ top: delta, behavior: 'smooth' })
  }

  await new Promise(resolve => setTimeout(resolve, 650))
  clone.remove()
  rankCloneMap.delete(targetUser)
  const liveCard = findCardElement(targetUser) || card
  liveCard.style.visibility = ''
  rankAnimating.delete(targetUser)
}

async function flushLikes(targetUser: string) {
  if (!selfTag.value || inFlightLikes[targetUser]) return

  const count = pendingLikes[targetUser] || 0
  if (count <= 0) return

  const idleTimer = likeIdleTimers.get(targetUser)
  if (idleTimer) {
    clearTimeout(idleTimer)
    likeIdleTimers.delete(targetUser)
  }

  likeCountdownActive[targetUser] = false
  pendingLikes[targetUser] = 0
  inFlightLikes[targetUser] = count
  let canAutoRetry = true
  let limitReached = false
  let errorToastShown = false
  let submitCount = count

  try {
    // 提交前拉取一次最新 likelist，按后端记录的今日次数计算实际可提交数量
    await fetchLikes(targetUser)
    const remaining = Math.max(0, 20 - getTodayLikeCount(targetUser))
    submitCount = Math.min(count, remaining)
    if (submitCount <= 0) {
      showLikeToast('每日最多给他20个赞哦')
      inFlightLikes[targetUser] = 0
      return
    }
    inFlightLikes[targetUser] = submitCount
    const snapshot = captureCardSnapshot(targetUser)

    const encoded = encodeURIComponent(targetUser)
    const res = await fetch(`/api/${encoded}/like`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ count: submitCount })
    })
    const data = await res.json()
    if (!res.ok) {
      limitReached = res.status === 429
      const message = limitReached
        ? '每日最多给他20个赞哦'
        : data.error || '点赞失败，请稍后重试'
      showLikeToast(message)
      errorToastShown = true
      canAutoRetry = false
      throw new Error(message)
    }

    if (data.limited) {
      showLikeToast('每日最多给他20个赞哦')
      errorToastShown = true
    }

    await fetchLikes(targetUser)
    await nextTick()
    inFlightLikes[targetUser] = 0
    updateRankCloneCount(rankCloneMap.get(targetUser), targetUser)
    likeSuccess[targetUser] = true
    setTimeout(() => { likeSuccess[targetUser] = false }, 500)
    if (snapshot) {
      setTimeout(() => {
        if ((pendingLikes[targetUser] || 0) > 0 || inFlightLikes[targetUser]) return
        void animateRankRise(targetUser, snapshot)
      }, 1000)
    }
  } catch (err) {
    if (!limitReached) {
      pendingLikes[targetUser] = (pendingLikes[targetUser] || 0) + submitCount
    }
    if (!errorToastShown) {
      showLikeToast('网络异常，点赞提交失败，请稍后重试')
    }
    canAutoRetry = false
    console.error('点赞失败:', err)
  } finally {
    inFlightLikes[targetUser] = 0
    if (canAutoRetry && (pendingLikes[targetUser] || 0) > 0 && !likeIdleTimers.has(targetUser)) {
      void flushLikes(targetUser)
    }
    updateRankCloneCount(rankCloneMap.get(targetUser), targetUser)
  }
}

// ---------- 评价数据（新接口） ----------
async function fetchEvaluations(username: string): Promise<EvalItem[]> {
  if (evalCache.has(username)) return evalCache.get(username)!
  const encoded = encodeURIComponent(username)
  const url = `/api/${encoded}/evaluations`
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
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

async function saveEvaluation(targetUser: string, content: string) {
  const encoded = encodeURIComponent(targetUser)
  const url = `/api/${encoded}/evaluation`
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ evaluation: content })
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.error || '保存评价失败')
  }
  // 清除缓存，下次获取时会重新拉取
  evalCache.delete(targetUser)
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

function handleLikeClick(targetUser: string) {
  enqueueLike(targetUser)
}

// 修改评价处理：直接调用 saveEvaluation，然后刷新当前评价列表（通过清除缓存并重新获取）
async function handleEvalSubmit(targetUser: string, newText: string) {
  const self = selfTag.value
  if (!self) return
  try {
    await saveEvaluation(targetUser, newText)
    // 清除当前用户对该目标用户的评价缓存，以便重新加载
    evalCache.delete(targetUser)
    await fetchEvaluations(targetUser)
    // 重新排序成员列表以触发界面更新（如果有需要）
    members.value = [...members.value]
  } catch (err: any) {
    console.error('评价提交失败:', err)
    toastMessage.value = err.message || '评价提交失败'
    setTimeout(() => { toastMessage.value = '' }, 3000)
  }
}

import pLimit from 'p-limit';

const MAX_CONCURRENT = 10; // 并发数

async function loadMembers() {
  const usernames = await fetchUserList();
  members.value = [];
  visibleMemberCount.value = PAGE_SIZE;

  const limit = pLimit(MAX_CONCURRENT);
  const tasks = usernames.map(username =>
    limit(async () => {
      const userData = await fetchUserData(username);
      if (!userData.username) return; // 无效用户跳过
      await fetchLikes(username);
      members.value.push(userData);
      await nextTick();
    })
  );
  await Promise.all(tasks);
  if (selfTag.value) await fetchLikes(selfTag.value);
  await fetchActivity();
}

// ---------- 排序 ----------
const latestLikedMeAt = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {}
  const self = selfTag.value
  if (!self) return result
  for (const item of activityState.value.likes) {
    const timestamp = Date.parse(item.updatedAt)
    if (item.actor && item.actor !== self && Number.isFinite(timestamp)) {
      result[item.actor] = Math.max(result[item.actor] || 0, timestamp)
    }
  }
  return result
})

const latestEvaluationAt = computed<Record<string, number>>(() => {
  const result: Record<string, number> = {}
  const self = selfTag.value
  if (!self) return result
  for (const item of activityState.value.evaluations) {
    const timestamp = Date.parse(item.updatedAt)
    if (item.target && item.target !== self && Number.isFinite(timestamp)) {
      result[item.target] = Math.max(result[item.target] || 0, timestamp)
    }
  }
  return result
})

const unreadByCard = computed<Record<string, ActivityUnread>>(() => {
  const result: Record<string, ActivityUnread> = {}
  const self = selfTag.value
  for (const item of activityState.value.unread) {
    if (item.card && item.card !== self) result[item.card] = item
  }
  return result
})

const unreadUsernames = computed(() => new Set(Object.keys(unreadByCard.value)))

const latestActivityAt = computed<Record<string, number>>(() => {
  const result: Record<string, number> = { ...latestLikedMeAt.value }
  for (const [actor, timestamp] of Object.entries(latestEvaluationAt.value)) {
    result[actor] = Math.max(result[actor] || 0, timestamp)
  }
  for (const item of activityState.value.unread) {
    if (!item.card || item.card === selfTag.value) continue
    const timestamp = Date.parse(item.latestEventAt)
    if (Number.isFinite(timestamp)) {
      result[item.card] = Math.max(result[item.card] || 0, timestamp)
    }
  }
  return result
})

function getLikeTimeLabel(timestampMs: number): string {
  if (!timestampMs) return ''
  const now = nowTick.value
  const age = now - timestampMs
  if (age <= HOUR_MS) return '刚刚'

  const startOfDay = (value: number) => {
    const date = new Date(value)
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  }
  const dayDiff = Math.round((startOfDay(now) - startOfDay(timestampMs)) / DAY_MS)

  if (dayDiff <= 0) return '今天'
  if (dayDiff === 1) return '昨天'
  if (dayDiff === 2) return '前天'
  if (age <= 7 * DAY_MS) return '本周'
  return ''
}

function getLikedMeLabel(username: string): string {
  const timestamp = latestLikedMeAt.value[username]
  return timestamp ? getLikeTimeLabel(timestamp) : ''
}

const sortedMembers = computed(() => {
  const self = selfTag.value
  if (!self) return members.value
  const recentCutoff = nowTick.value - 7 * DAY_MS
  return [...members.value].sort((a, b) => {
    if (a.username === self && b.username !== self) return -1
    if (a.username !== self && b.username === self) return 1
    if (a.username !== self && b.username !== self) {
      const unreadA = unreadUsernames.value.has(a.username)
      const unreadB = unreadUsernames.value.has(b.username)
      if (unreadA !== unreadB) return unreadA ? -1 : 1
      if (unreadA && unreadB) {
        const unreadTimeA = Date.parse(unreadByCard.value[a.username]?.latestEventAt || '') || 0
        const unreadTimeB = Date.parse(unreadByCard.value[b.username]?.latestEventAt || '') || 0
        if (unreadTimeA !== unreadTimeB) return unreadTimeB - unreadTimeA
      }

      const activityA = latestActivityAt.value[a.username] || 0
      const activityB = latestActivityAt.value[b.username] || 0
      const recentA = activityA >= recentCutoff
      const recentB = activityB >= recentCutoff
      if (recentA !== recentB) return recentA ? -1 : 1
      if (recentA && recentB && activityA !== activityB) return activityB - activityA

      const likesA = likeCache[a.username] || []
      const likesB = likeCache[b.username] || []
      const countA = likesA.find(item => item.ID === self)?.Like || 0
      const countB = likesB.find(item => item.ID === self)?.Like || 0
      if (countA !== countB) return countB - countA
      return a.username.localeCompare(b.username, 'zh-CN')
    }
    return 0
  })
})

function generateUniqueBattletag(): string {
  const base = '新成员';
  const timestamp = Date.now();
  return `${base}${timestamp}`.slice(0, 60);
}

async function createNewMember() {
  if (!isAdmin.value) return;

  const newBattletag = generateUniqueBattletag();
  const defaultPassword = '1234';

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        battletag: newBattletag,
        password: defaultPassword
      })
    });

    const data = await res.json();
    if (!res.ok) {
      if (res.status === 409) {
        // 战网ID冲突，重试一次（追加随机后缀）
        const retryTag = `${newBattletag}_${Math.random().toString(36).substring(2, 6)}`;
        const retryRes = await fetch('/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            battletag: retryTag,
            password: defaultPassword
          })
        });
        const retryData = await retryRes.json();
        if (!retryRes.ok) throw new Error(retryData.error || '创建失败');
        await onMemberCreated(retryTag);
        return;
      }
      throw new Error(data.error || '创建失败');
    }

    await onMemberCreated(newBattletag);
  } catch (err: any) {
    console.error(err);
    toastMessage.value = err.message || '创建失败';
    setTimeout(() => { toastMessage.value = ''; }, 3000);
  }
}

async function onMemberCreated(newBattletag: string) {
  // 刷新成员列表
  await loadMembers();
  // 设置搜索关键字为新建的成员ID，使其单独显示
  searchKeyword.value = newBattletag;
  toastMessage.value = `成员 ${newBattletag} 创建成功，默认密码 1234`;
  setTimeout(() => { toastMessage.value = ''; }, 5000);
}

// 刷新指定用户的数据（从后端获取最新信息）
async function refreshUserData(username: string) {
  const encoded = encodeURIComponent(username);
  const url = `/api/${encoded}/rank_hero?t=${Date.now()}`;
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const parseRank = (raw: any): { rank: string; level: number } | null => {
      if (!raw) return null;
      if (typeof raw === 'object') return raw;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return null; }
      }
      return null;
    };
    const newUserData: UserData = {
      username: data.battletag,
      hero: data.heroes,
      rank_open_6v6: parseRank(data.rank_open_6v6),
      rank_tank_5v5: parseRank(data.rank_tank_5v5),
      rank_dps_5v5: parseRank(data.rank_dps_5v5),
      rank_support_5v5: parseRank(data.rank_support_5v5),
      error: false
    };
    // 更新 members 数组中对应的用户
    const index = members.value.findIndex(m => m.username === username);
    if (index !== -1) {
      members.value[index] = newUserData;
      // 同时刷新点赞缓存（确保赞数最新）
      await fetchLikes(username);
    }
  } catch (err) {
    console.error(`刷新用户 ${username} 数据失败:`, err);
  }
}

function handleGlobalClick(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (target.closest('.image-viewer')) {
    return
  }
  if (!target.closest('.member-card')) {
    currentExpandId.value = ''
  }
}

function handleExpandCareer(username: string) {
  const id = `career-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}

function handleExpandSummary(username: string) {
  const id = `summary-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}

function handleExpandMatch(username: string) {
  const id = `match-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}

function handleExpandStrength(username: string) {
  if (currentExpandId.value === `strength-${username}`) {
    currentExpandId.value = ''; // 收起
  } else {
    currentExpandId.value = `strength-${username}`; // 展开
  }
}

function handleExpandTreemap(username: string) {
  const id = `treemap-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}

function handleExpandAdmin(username: string) {
  const id = `admin-${username}`
  currentExpandId.value = currentExpandId.value === id ? '' : id
}
// 过滤后的成员列表（基于 sortedMembers 并按战网ID匹配）
const filteredMembers = computed(() => {
  if (!searchKeyword.value.trim()) {
    return sortedMembers.value
  }
  const keyword = searchKeyword.value.trim().toLowerCase()
  return sortedMembers.value.filter(member =>
    member.username.toLowerCase().includes(keyword)
  )
})

const visibleMembers = computed(() => filteredMembers.value.slice(0, visibleMemberCount.value))
const hasMoreMembers = computed(() => visibleMemberCount.value < filteredMembers.value.length)
const firstUnreadUsername = computed(() => {
  for (const member of visibleMembers.value) {
    if (unreadUsernames.value.has(member.username)) return member.username
  }
  return ''
})
const lastUnreadUsername = computed(() => {
  let last = ''
  for (const member of visibleMembers.value) {
    if (unreadUsernames.value.has(member.username)) last = member.username
  }
  return last
})

function updateUnreadGuide() {
  const grid = membersGridRef.value
  if (!grid) {
    unreadGuideStyle.value = {}
    return
  }
  const unread = unreadUsernames.value
  const cards = Array.from(grid.querySelectorAll<HTMLElement>('.member-card'))
    .filter(card => unread.has(card.dataset.username || ''))
  if (cards.length === 0) {
    unreadGuideStyle.value = {}
    return
  }

  const gridRect = grid.getBoundingClientRect()
  const first = cards[0].getBoundingClientRect()
  const last = cards[cards.length - 1].getBoundingClientRect()
  unreadGuideStyle.value = {
    top: `${first.top - gridRect.top}px`,
    height: `${last.bottom - first.top}px`,
    left: `${first.right - gridRect.left + 3}px`
  }
}

function clearReadActivity() {
  activityState.value = {
    ...activityState.value,
    unread: []
  }
  pendingReadClear.value = false
  unreadGuideStyle.value = {}
}

async function markActivityRead() {
  if (readingActivity.value || pendingReadClear.value || unreadUsernames.value.size === 0) return
  readingActivity.value = true
  try {
    const res = await fetch('/api/activity/read', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    })
    if (!res.ok) throw new Error('提交已读记录失败')
    const data = await res.json()
    activityState.value = {
      ...activityState.value,
      cursor: {
        like: Number(data.cursor?.like ?? activityState.value.cursor.like),
        evaluation: Number(data.cursor?.evaluation ?? activityState.value.cursor.evaluation)
      }
    }
    pendingReadClear.value = true
  } catch (error) {
    console.error('[activity] 提交已读失败:', error)
    showLikeToast('已读记录提交失败，请稍后重试')
  } finally {
    readingActivity.value = false
  }
}

function checkUnreadScrollEnd() {
  if (readingActivity.value || pendingReadClear.value || unreadUsernames.value.size === 0) return
  const lastUsername = lastUnreadUsername.value
  if (!lastUsername) return
  const card = findCardElement(lastUsername)
  if (!card) return
  if (card.getBoundingClientRect().bottom <= window.innerHeight + 8) {
    void markActivityRead()
  }
}

function handleWindowScroll() {
  const currentY = window.scrollY
  if (pendingReadClear.value && currentY < lastWindowScrollY - 30) {
    clearReadActivity()
  }
  lastWindowScrollY = currentY
  checkUnreadScrollEnd()
}

function handleWindowResize() {
  updateUnreadGuide()
}

function loadMoreMembers() {
  if (!hasMoreMembers.value) return
  visibleMemberCount.value = Math.min(
    visibleMemberCount.value + PAGE_SIZE,
    filteredMembers.value.length
  )
  void nextTick(updateUnreadGuide)
}

function setupMemberObserver() {
  if (!('IntersectionObserver' in window) || !loadMoreSentinel.value) return
  memberObserver = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting)) loadMoreMembers()
  }, { rootMargin: '200px 0px' })
  memberObserver.observe(loadMoreSentinel.value)
}

watch(searchKeyword, () => {
  visibleMemberCount.value = PAGE_SIZE
  void nextTick(updateUnreadGuide)
})

// 处理搜索输入（可选，防抖优化）
let searchTimer: ReturnType<typeof setTimeout> | null = null
function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  // 可添加防抖，避免频繁渲染（可选）
}

function clearSearch() {
  searchKeyword.value = ''
}

onMounted(async () => {
  await loadMembers()
  await nextTick()
  setupMemberObserver()
  lastWindowScrollY = window.scrollY
  document.addEventListener('click', handleGlobalClick)
  window.addEventListener('scroll', handleWindowScroll, { passive: true })
  window.addEventListener('resize', handleWindowResize)
  updateUnreadGuide()
  checkUnreadScrollEnd()
  clockTimer = setInterval(() => {
    nowTick.value = Date.now()
  }, 60_000)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
  window.removeEventListener('scroll', handleWindowScroll)
  window.removeEventListener('resize', handleWindowResize)
  memberObserver?.disconnect()
  if (clockTimer) clearInterval(clockTimer)
  for (const timer of likeIdleTimers.values()) clearTimeout(timer)
  likeIdleTimers.clear()
  for (const clone of rankCloneMap.values()) clone.remove()
  rankCloneMap.clear()
})
</script>

<style>

* {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
}

body {
    font-family: 'Microsoft YaHei', Arial, sans-serif;
    background: var(--bg-primary);
    color: var(--text-primary);
    transition: background 0.3s, color 0.3s;
}

.content-area {
    position: relative;
    z-index: 3;
    padding: 50px 20px;
    width: 100%;
    max-width: 1800px;
    margin: 0 auto;
    background: var(--bg-secondary);
    
}

.section {
    margin-bottom: 40px;
    padding: 30px;
    background: var(--section-bg);
    border-radius: var(--glass-radius);
    border: 1px solid var(--glass-border);
    box-shadow: var(--glass-shadow);
    backdrop-filter: blur(var(--glass-blur));
    -webkit-backdrop-filter: blur(var(--glass-blur));
}


.top-tip-text {
    top: 0;
    font-size: clamp(5px, 4vw + 1rem, 64px);
    text-align: center;
    padding: 10px 5px 10px;
    margin: 0;
    color: var(--text-primary);
    font-weight: bold;
    letter-spacing: 1.5px;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    border-bottom: none;
}



.poster-wrapper {
  width: 100%;
  /* 保持宽高比，防止塌陷 */
  aspect-ratio: 2 / 1;
  margin: 0 auto;
  position: relative;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 0 30px var(--shadow-color);
  margin-top: 0;
  margin-bottom: 10px;
  background: var(--bg-secondary);
  /* 使用主题背景色作为占位 */
  padding: 0 10px;
  z-index: 1;
}

.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, auto));
  gap: 20px 10px;
  margin-top: 20px;
  justify-content: center;
  position: relative;
  /* 添加此行：使列在容器中居中 */
}

.member-card-wrap {
  display: flex;
  justify-content: center;
  width: 100%;
  min-width: 0;
}

.unread-guide {
  display: none;
  position: absolute;
  width: 1px;
  z-index: 6;
  border-radius: 1px;
  background: #4dabf7;
  pointer-events: none;
}

@media (max-width: 760px) {
  .members-grid {
    grid-template-columns: 1fr;
    justify-content: stretch;
  }

  .unread-guide {
    display: block;
  }

  .member-card-wrap.unread-wrap {
    justify-content: flex-start;
    margin-left: -25px;
  }
}

.load-more-sentinel {
  width: 100%;
  height: 1px;
}

.load-more-sentinel.hidden {
  display: none;
}

/* 搜索栏样式 */
.search-bar {
  position: relative;
  margin: 20px auto;
  padding: 0 16px;
}

.search-input {
  width: 100%;
  padding: 10px 36px 10px 16px;
  border-radius: 30px;
  border: 1px solid var(--input-border);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 14px;
  outline: none;
  transition: all 0.2s;
}

.search-input:focus {
  border-color: var(--input-focus);
  box-shadow: 0 0 0 2px rgba(24, 119, 242, 0.2);
}

.search-clear {
  position: absolute;
  right: 28px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  color: var(--text-primary);
  cursor: pointer;
  font-size: 16px;
  opacity: 0.6;
}

.search-clear:hover {
  opacity: 1;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.add-member-btn {
  background: var(--accent);
  border: none;
  border-radius: 20px;
  width: 32px;
  height: 32px;
  font-size: 20px;
  font-weight: bold;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s;
}

.add-member-btn:hover {
  transform: scale(1.05);
  opacity: 0.9;
}
</style>
