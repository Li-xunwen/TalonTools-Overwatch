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
        <input
          type="text"
          v-model="searchKeyword"
          placeholder="搜索战网ID..."
          class="search-input"
          @input="handleSearch"
        />
      <button v-if="searchKeyword" class="search-clear" @click="clearSearch">✕</button>
</div>
      <div class="section">
        <div class="section-header">
          <h2 class="section-title">成员名单</h2>
          <button v-if="isAdmin" class="add-member-btn" @click="createNewMember">+</button>
        </div>
        <div class="members-grid">
          <MemberCard
            v-for="member in filteredMembers"
            :key="member.username"
            :user="member"
            :self-tag="selfTag"
            :self-role="selfRole"
            :current-expand-id="currentExpandId"
            :like-cache="likeCache"
            :eval-cache="evalCache"
            :fetch-evaluations="fetchEvaluations"
            @expand-like="handleExpandLike"
            @expand-eval="handleExpandEval"
            @like-click="handleLikeClick"
            @eval-submit="handleEvalSubmit"
            @expand-career="handleExpandCareer"
            @expand-summary="handleExpandSummary"
            @expand-match="handleExpandMatch"
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

    <!-- 使用底部导航栏组件 -->
    <BottomNav />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, reactive, nextTick } from 'vue'
import MemberCard from './MemberCard.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import PosterHeroes from '@/components/PosterHeroes.vue'
import Toast from '@/components/Toast.vue'
import BottomNav from '@/components/BottomNav.vue'   
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
const likeCache = reactive<Record<string, LikeItem[]>>({})
const evalCache = new Map<string, EvalItem[]>()
const toastMessage = ref('')
const currentExpandId = ref<string>('')
const likePending = new Map<string, boolean>()
const selfRole = ref<string | null>(null)
const searchKeyword = ref('')
const isAdmin = computed(() => selfRole.value === 'ADMIN' || selfRole.value === 'MODERATOR')
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

// 每次点击立即发送一次点赞请求
async function submitLike(targetUser: string) {
  const self = selfTag.value
  if (!self) return
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

    await fetchLikes(targetUser)
  } catch (err) {
    console.error('点赞失败:', err)
  } finally {
    likePending.delete(targetUser)
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

async function handleLikeClick(targetUser: string) {
  await submitLike(targetUser)
  await nextTick()
  setTimeout(() => scrollToCard(targetUser), 60)
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
    /* 保持宽高比，防止塌陷 */
    aspect-ratio: 2 / 1; 
    margin: 0 auto;
    position: relative;
    border-radius: 15px;
    overflow: hidden;
    box-shadow: 0 0 30px var(--shadow-color);
    margin-top: 0;
    margin-bottom: 10px;
    background: var(--bg-secondary); /* 使用主题背景色作为占位 */
    padding: 0 10px;
    z-index: 1;
}
.members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, auto));
  gap: 20px 10px;
  margin-top: 20px;
  justify-content: center;  /* 添加此行：使列在容器中居中 */
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
  box-shadow: 0 0 0 2px rgba(24,119,242,0.2);
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