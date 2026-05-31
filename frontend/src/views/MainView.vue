<template>
  <div class="join-play">
    <!-- 使用主题切换组件 -->
    <ThemeToggle />

    <!-- 内容区域 -->
    <div class="content-area">
      <div class="top-tip-text">这个未来值得为之奋战</div>

      <!-- 头图海报区域 -->
      <div class="poster-wrapper">
        <PosterHeroes />
      </div>

      <!-- 成员列表 -->
      <div class="section">
        <h2 class="section-title">成员名单</h2>
        <div class="members-grid">
          <MemberCard v-for="member in sortedMembers" :key="member.username" :user="member" :self-tag="selfTag"
            :current-expand-id="currentExpandId" :like-cache="likeCache" :eval-cache="evalCache"
            :temp-like-map="tempLikeMap" :get-total-likes="getTotalLikes" :fetch-evaluations="fetchEvaluations"
            @expand-like="handleExpandLike" @expand-eval="handleExpandEval" @like-click="handleLikeClick"
            @eval-submit="handleEvalSubmit" />
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

    <!-- 底部导航栏 (建议替换为 router-link) -->
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
import { ref, computed, onMounted, onUnmounted } from 'vue'
import MemberCard from './MemberCard.vue'
import ThemeToggle from '@/components/ThemeToggle.vue' // 确保导入
import PosterHeroes from '@/components/PosterHeroes.vue'

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
// 移除了 currentTheme 相关逻辑，由 useTheme 统一管理
const token = localStorage.getItem('authToken');
const selfTag = ref<string | null>(null)
const members = ref<UserData[]>([])
const likeCache = new Map<string, LikeItem[]>()
const evalCache = new Map<string, EvalItem[]>()

// 临时点赞增量及防抖定时器
const tempLikeMap = new Map<string, number>()
const likeDebounceMap = new Map<string, ReturnType<typeof setTimeout>>()

// 当前展开的浮层 ID
const currentExpandId = ref<string>('')

// ---------- 辅助函数 ----------
async function fetchUserList(): Promise<string[]> {
  // 调用后端接口，相对路径（开发环境可配置代理，或使用绝对路径如 http://localhost:3000）
  const res = await fetch('/api/users/battletaglist')
  if (!res.ok) throw new Error('获取用户列表失败')
  // 后端直接返回 battletag 字符串数组，例如 ["Node#51456", "Alyce#51781", ...]
  const battletagList: string[] = await res.json()
  return battletagList
}

async function fetchUserData(username: string): Promise<UserData> {
  const encoded = encodeURIComponent(username);
  const url = `/api/${encoded}/rank_hero`
  try {
    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // 后端返回字段：battletag, rank_open_6v6, rank_tank_5v5, rank_dps_5v5, rank_support_5v5, ...
    return {
      username: data.battletag,
      hero: data.heroes,   // 英雄数据暂缺，可从 COS 补充或留空
      rank_open_6v6: data.rank_open_6v6,
      rank_tank_5v5: data.rank_tank_5v5,
      rank_dps_5v5: data.rank_dps_5v5,
      rank_support_5v5: data.rank_support_5v5
    };
  } catch {
    return { username, hero: [], error: true };
  }
}

// ---------- 点赞数据 ----------
async function fetchLikes(username: string): Promise<LikeItem[]> {
  if (likeCache.has(username)) return likeCache.get(username)!;
  const encoded = encodeURIComponent(username);
  const url = `/api/${encoded}/likes`;  // 后端接口

  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (Array.isArray(data)) {
      // 后端返回格式为 [{ID: "xxx", Like: number}, ...]，与 LikeItem 兼容
      likeCache.set(username, data);
      return data;
    }
    return [];
  } catch {
    return [];
  }
}

function getTotalLikes(username: string): number {
  const likes = likeCache.get(username) || []
  return likes.reduce((sum, item) => sum + (item.Like || 0), 0)
}

async function submitLikes(targetUser: string) {
  const self = selfTag.value
  if (!self) return
  const pending = tempLikeMap.get(targetUser) || 0
  if (pending <= 0) return

  const currentLikes = [...(likeCache.get(targetUser) || [])]
  const existing = currentLikes.find(item => item.ID === self)
  if (existing) {
    existing.Like += pending
  } else {
    currentLikes.push({ ID: self, Like: pending })
  }
  currentLikes.sort((a, b) => b.Like - a.Like)

  const encoded = encodeURIComponent(targetUser)
  const url = `https://talon-public-1258609989.cos.ap-chongqing.myqcloud.com/like/${encoded}.json`
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(currentLikes)
    })
    if (res.ok) {
      likeCache.set(targetUser, currentLikes)
      tempLikeMap.delete(targetUser)
    } else {
      console.error('点赞提交失败')
    }
  } catch (err) {
    console.error(err)
  } finally {
    likeDebounceMap.delete(targetUser)
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

async function handleLikeClick(targetUser: string) {
  const self = selfTag.value
  if (!self) return
  const cur = tempLikeMap.get(targetUser) || 0
  tempLikeMap.set(targetUser, cur + 1)
  if (likeDebounceMap.has(targetUser)) clearTimeout(likeDebounceMap.get(targetUser))
  likeDebounceMap.set(targetUser, setTimeout(() => submitLikes(targetUser), 1200))
  members.value = [...members.value] // 触发重新排序
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
  const userPromises = usernames.map(username => fetchUserData(username))
  const rawUsers = await Promise.all(userPromises)
  // 过滤掉无效用户（没有 username 的情况）
  const validUsers = rawUsers.filter(u => u.username)
  await Promise.all(validUsers.map(u => fetchLikes(u.username)))
  members.value = validUsers
}

// ---------- 排序 ----------
const sortedMembers = computed(() => {
  const self = selfTag.value
  if (!self) return members.value
  return [...members.value].sort((a, b) => {
    if (a.username === self && b.username !== self) return -1
    if (a.username !== self && b.username === self) return 1
    if (a.username !== self && b.username !== self) {
      const likesA = likeCache.get(a.username) || []
      const likesB = likeCache.get(b.username) || []
      const countA = likesA.find(item => item.ID === self)?.Like || 0
      const countB = likesB.find(item => item.ID === self)?.Like || 0
      const tempA = tempLikeMap.get(a.username) || 0
      const tempB = tempLikeMap.get(b.username) || 0
      return (countB + tempB) - (countA + tempA)
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

// ---------- 生命周期 ----------
onMounted(async () => {
  await loadMembers()
  
  document.addEventListener('click', handleGlobalClick)
})

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick)
})
</script>

<style>
/* 导入全局样式 */
@import '../style/main.css';
/* === 头图海报容器 === */
.poster-wrapper {
    width: 100%;
    /* 保持宽高比，防止塌陷 */
    aspect-ratio: 2 / 1; 
}

.members-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 25px;
    margin-top: 20px;
}
</style>
