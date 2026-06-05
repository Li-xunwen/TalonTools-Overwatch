<template>
  <div class="member-card" :data-is-self="user.username === selfTag">
    <!-- 内部容器：包裹主要内容 -->
    <div class="card-content">
      <!-- 头部：头像 + 名字 -->
      <div class="member-header">
        <img :src="getAvatarUrl(user.username)" class="member-avatar" @error="handleAvatarError" alt="Avatar" />
        <div class="member-text">
          <div v-if="user.username === selfTag" class="member-greeting">{{ randomGreeting }}</div>
          <div class="member-id">{{ user.username }}</div>
        </div>
      </div>

      <!-- 段位区域 -->
      <div class="ranks-container" v-if="hasAnyRank">
        <div class="rank-item" v-for="rank in rankList" :key="rank.type">
          <div class="rank-icon-wrapper">
            <img :src="`/res/imge/rank/${rank.rank}.png`" :alt="rank.rank" class="rank-icon" />
            <span class="rank-level-badge" :class="{ 'challenger-level': rank.rank.toLowerCase() === 'challenger' }">
              {{ rank.rank.toLowerCase() === 'challenger' ? 'TOP ' + rank.level : rank.level }}
            </span>
          </div>
          <div class="rank-label">{{ rank.label }}</div>
        </div>
      </div>

      <!-- 擅长英雄 -->
      <div class="member-heroes">
        <div v-for="hero in topHeroes" :key="hero" class="member-hero-icon" v-memo="[hero]">
          <img :src="`/res/imge/hero/${encodeURIComponent(hero)}.png`" :alt="hero" loading="lazy" />
        </div>
      </div>

      <!-- 评价按钮 -->
      <div class="evaluation-button" @click.stop="onEvalClick">💬</div>

      <div class="action-buttons">
        <div class="action-btn" @click.stop="onCareerClick">
          <div class="btn-icon">🏆</div>
          <div class="btn-label">生涯</div>
        </div>
        <div class="action-btn" @click.stop="onSummaryClick">
          <div class="btn-icon">📅</div>
          <div class="btn-label">今日总结</div>
        </div>
        <div class="action-btn" @click.stop="onMatchClick">
          <div class="btn-icon">🎮</div>
          <div class="btn-label">最近对局</div>
        </div>
        <div class="action-btn" @click.stop="onStrengthClick">
          <div class="btn-icon">⚔️</div>
          <div class="btn-label">对局强度</div>
        </div>
        <!-- 管理按钮（仅管理员可见） -->
        <div class="action-btn" @click.stop="onSummaryClick">
          <div v-if="isAdmin" class="action-btn" @click.stop="onAdminClick">
            <div class="btn-icon">🔧</div>
            <div class="btn-label">用户管理</div>
          </div>
        </div>

      </div>

    </div>



    <!-- 点赞区域（右上角） -->
    <div class="like-button-container" @click.stop="onLikeClick">
      <span class="like-count">{{ displayLikeCount }}</span>
      <span class="heart">❤️</span>
    </div>

    <!-- 点赞列表浮层 -->
    <Transition name="fade">
      <div v-if="expandLike" class="like-list" @click.stop>
        <div v-if="likeList.length === 0" class="empty-tip">暂无点赞</div>
        <div v-for="item in likeList.slice(0, 50)" :key="item.ID" class="like-item">
          <span class="like-item-id">{{ item.ID }}</span>
          <span class="like-item-like">
            <template v-if="item.isSpecial">
              {{ item.baseLike }}+{{ item.todayCount }} ❤️ {{ item.timeLabel }}
            </template>
            <template v-else>
              {{ item.Like }} ❤️
            </template>
          </span>
        </div>
      </div>
    </Transition>

    <!-- 评价列表浮层 -->
    <Transition name="fade">
      <div v-if="expandEval" class="evaluation-list" @click.stop>
        <div v-for="item in evalList" :key="item.ID" class="evaluation-item">
          <div class="evaluation-item-content">
            <span class="evaluation-item-id">{{ item.ID }}:</span>
            <span class="evaluation-item-evaluation" :id="`eval-${user.username}-${item.ID}`">
              {{ item.evaluation }}
            </span>
          </div>
          <div class="evaluation-actions">
            <button v-if="item.ID === selfTag" class="evaluation-edit-btn" @click="startEdit(item)">修改</button>
            <span v-else class="evaluation-read-only"></span>
          </div>
        </div>
        <div v-if="!hasSelfEval" class="evaluation-input-container">
          <textarea v-model="newEvalText" placeholder="请输入评价（最多32字）" maxlength="32" rows="2"></textarea>
          <button class="evaluation-update-btn" @click="submitNewEval">提交</button>
        </div>
      </div>
    </Transition>


    <!-- 生涯浮层 -->
    <Transition name="fade">
      <div v-if="expandCareer" class="career-list" @click.stop>
        <div v-if="careerLoading" class="career-loading">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>
        <img v-else-if="careerImageUrl" :src="careerImageUrl" class="career-image"
          @click="openImageViewer(careerImageUrl)" />
        <div v-else-if="careerError" class="career-error">
          {{ careerError }}
        </div>
      </div>
    </Transition>

    <!-- 今日总结浮层 -->
    <Transition name="fade">
      <div v-if="expandSummary" class="summary-list" @click.stop>
        <div v-if="summaryLoading" class="summary-loading">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>
        <img v-else-if="summaryImageUrl" :src="summaryImageUrl" class="summary-image"
          @click="openImageViewer(summaryImageUrl)" />
        <div v-else-if="summaryError" class="career-error">
          {{ summaryError }}
        </div>
      </div>
    </Transition>

    <!--今日对局浮层-->
    <Transition name="fade">
      <div v-if="expandMatch" class="match-list" @click.stop>
        <div v-if="matchLoading" class="match-loading">
          <div class="loading-spinner"></div>
          <span>加载中...</span>
        </div>
        <img v-else-if="matchImageUrl" :src="matchImageUrl" class="match-image"
          @click="openImageViewer(matchImageUrl)" />
      </div>
    </Transition>

    <!-- 对局强度浮层 -->
     <Transition name="fade"> 
      <div v-if="localExpandStrength" class="strength-list" @click.stop>
        <div class="strength-options">
          <div class="strength-option-item" @click.stop="handleQuickMatchStrength">
            <div class="btn-icon">⚔️</div>
            <div class="btn-label">快速比赛强度</div>
          </div>
          <div class="strength-option-item" @click.stop="handleCompetitiveStrength">
            <div class="btn-icon">🏆</div>
            <div class="btn-label">竞技比赛强度</div>
          </div>
        </div>
      </div>
     </Transition>

    <!-- 管理浮层 -->
    <Transition name="fade">
      <div v-if="expandAdmin" class="admin-panel" @click.stop>
        <div class="admin-panel-title">用户管理</div>
        <div class="admin-section">
          <div class="admin-label">修改密码</div>
          <input type="password" v-model="adminNewPassword" placeholder="新密码（至少4位）" class="admin-input" />
          <input type="password" v-model="adminConfirmPassword" placeholder="确认新密码" class="admin-input" />
          <button class="admin-submit" @click="submitPasswordChange">提交</button>
        </div>
        <div class="admin-section">
          <div class="admin-label">修改战网ID</div>
          <input type="text" v-model="adminNewBattletag" placeholder="新战网ID" class="admin-input" />
          <button class="admin-submit" @click="submitBattletagChange">提交</button>
        </div>
        <div class="admin-section">
          <div class="admin-label">邀请分享</div>
          <div class="share-text" @click="copyInviteText">{{ inviteText }}</div>
          <div class="copy-hint">点击复制</div>
        </div>
      </div>
    </Transition>
  </div>
  <ImageViewer v-model:visible="showImageViewer" :src="currentCareerImageUrl" />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'
import ImageViewer from '@/components/ImageViewer.vue'

const props = defineProps<{
  user: {
    username: string
    hero?: string[]
    rank_open_6v6?: { rank: string; level: number } | null
    rank_tank_5v5?: { rank: string; level: number } | null
    rank_dps_5v5?: { rank: string; level: number } | null
    rank_support_5v5?: { rank: string; level: number } | null
  }
  selfTag: string | null
  currentExpandId: string
  likeCache: Record<string, any[]>   // 响应式对象
  evalCache: Map<string, any[]>
  fetchEvaluations: (username: string) => Promise<any[]>
  selfRole: string | null   // 新增
}>()

const emit = defineEmits<{
  (e: 'expand-like', username: string): void
  (e: 'expand-eval', username: string): void
  (e: 'like-click', username: string): void
  (e: 'eval-submit', username: string, text: string): void
  (e: 'expand-career', username: string): void
  (e: 'expand-summary', username: string): void
  (e: 'expand-match', username: string): void
  (e: 'expand-strength', username: string): void
  (e: 'expand-admin', username: string): void
  (e: 'close-float'): void   // 关闭当前浮层（用于自动关闭）
}>()

const getAvatarUrl = (username: string) => {
  if (!username) return ''
  return `/api/users/${encodeURIComponent(username)}/avatar`
}

const randomGreeting = ref('')
const newEvalText = ref('')
const editingEval = ref<{ item: any; original: string } | null>(null)

// 擅长英雄（最多5个）
const topHeroes = computed(() => (props.user.hero || []).slice(0, 5))

// 生涯相关状态
const expandCareer = computed(() => props.currentExpandId === `career-${props.user.username}`)
const careerLoading = ref(false)
const careerImageUrl = ref('')
const careerError = ref<string | null>(null)

// 今日总结相关状态
const expandSummary = computed(() => props.currentExpandId === `summary-${props.user.username}`)
const summaryLoading = ref(false)
const summaryImageUrl = ref('')
const summaryError = ref<string | null>(null)

//今日对局相关状态
const expandMatch = computed(() => props.currentExpandId === `match-${props.user.username}`)
const matchLoading = ref(false)
const matchImageUrl = ref('')
const matchError = ref<string | null>(null)

//对局强度相关状态
const localExpandStrength = ref(false)
const expandStrength = computed(() => props.currentExpandId === `strength-${props.user.username}`)

// 管理按钮相关
const isAdmin = computed(() => props.selfRole === 'ADMIN' || props.selfRole === 'MODERATOR')
const expandAdmin = ref(false)
const adminNewPassword = ref('')
const adminConfirmPassword = ref('')
const adminNewBattletag = ref('')

const inviteText = computed(() => {
  const pwd = adminNewPassword.value.trim() || '123'
  return `${props.user.username} 你的黑爪账号已经创建，访问http://47.116.35.79/来和小伙伴一起开黑吧，进来记得修改常用英雄。默认密码是${pwd}`
})

// 段位列表
const rankList = computed(() => {
  const ranks: { type: string; label: string; rank: string; level: number }[] = []
  const rankMap = [
    { field: 'rank_open_6v6', label: '6v6' },
    { field: 'rank_tank_5v5', label: '坦克' },
    { field: 'rank_dps_5v5', label: '输出' },
    { field: 'rank_support_5v5', label: '支援' }
  ]
  for (const r of rankMap) {
    const data = props.user[r.field as keyof typeof props.user] as { rank: string; level: number } | null | undefined
    if (data && data.rank && data.level >= 1) {
      ranks.push({ type: r.field, label: r.label, rank: data.rank, level: data.level })
    }
  }
  return ranks
})
const hasAnyRank = computed(() => rankList.value.length > 0)

// 点赞显示数字
const displayLikeCount = computed(() => {
  const likes = props.likeCache[props.user.username] || [];
  return likes.reduce((sum, item) => sum + (item.Like || 0), 0);
});

// 点赞列表（供浮层使用）

const evalList = ref<any[]>([])
const hasSelfEval = computed(() => evalList.value.some(item => item.ID === props.selfTag))

const expandLike = computed(() => props.currentExpandId === `like-${props.user.username}`)
const expandEval = computed(() => props.currentExpandId === `eval-${props.user.username}`)


const showImageViewer = ref(false)
const currentCareerImageUrl = ref('')


// 自动关闭定时器
let autoCloseTimer: ReturnType<typeof setTimeout> | null = null

watch(expandLike, (newVal) => {
  if (newVal) {
    if (autoCloseTimer) clearTimeout(autoCloseTimer)
    autoCloseTimer = setTimeout(() => {
      emit('close-float')
      autoCloseTimer = null
    }, 10000)
  } else {
    if (autoCloseTimer) {
      clearTimeout(autoCloseTimer)
      autoCloseTimer = null
    }
  }
})

// 处理点赞列表（置顶今日活跃点赞，其余按总赞数降序）
const processedLikeList = computed(() => {
  const raw = props.likeCache[props.user.username] || [];
  if (!raw.length) return [];

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const specials: any[] = [];
  const normals: any[] = [];

  for (const item of raw) {
    const updatedAt = new Date(item.updated_at);
    const todayCount = updatedAt.getSeconds();        // 秒数 = 当天已点赞次数
    const totalCount = item.Like;                     // 累计总点赞数

    // 判断是否属于“今天”且今天有点赞记录
    const isToday = updatedAt >= todayStart;
    let isSpecial = false;
    let timeLabel = '';

    if (isToday && todayCount > 0) {
      const diffHours = (now.getTime() - updatedAt.getTime()) / (1000 * 3600);
      if (diffHours < 2) {
        isSpecial = true;
        timeLabel = '刚刚';
      } else {
        isSpecial = true;
        timeLabel = '今天';
      }
    }

    const newItem = {
      ...item,
      todayCount,
      totalCount,
      isSpecial,
      timeLabel,           // 新增字段
      baseLike: totalCount - todayCount,   // 历史总赞数
    };

    if (isSpecial) {
      specials.push(newItem);
    } else {
      normals.push(newItem);
    }
  }

  // 特殊组按更新时间降序（最近更新的排前面）
  specials.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
  // 普通组按 Like 降序（维持原逻辑）
  normals.sort((a, b) => b.Like - a.Like);

  return [...specials, ...normals];
});
const likeList = processedLikeList


function handleAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  // 如果加载失败，可以设置一个默认占位图，或者保持当前状态（后端已配置返回 default-avatar.png）
  // 这里我们尝试加载一个本地的默认图片作为兜底，防止后端默认图也失效
  img.src = '/res/imge/default-avatar.png'
  // 如果本地也没有默认图，可以隐藏或设置样式
  img.onerror = null // 防止无限循环
}

// 点赞按钮：只打开浮层（如果已打开则保持不变），并发送点赞请求
function onLikeClick() {
  emit('like-click', props.user.username)
  if (!expandLike.value) {
    emit('expand-like', props.user.username)
  }
}

// 评价按钮：切换浮层
function onEvalClick() {
  emit('expand-eval', props.user.username)
  props.fetchEvaluations(props.user.username).then(data => {
    evalList.value = data
  })
}

function startEdit(item: any) {
  editingEval.value = {
    item,
    original: item.evaluation
  }

  const span = document.getElementById(
    `eval-${props.user.username}-${item.ID}`
  )

  if (!span) return

  span.innerHTML = `
    <textarea
      class="evaluation-edit-input"
      maxlength="32"
      rows="2"
    >${escapeHtml(item.evaluation)}</textarea>
  `

  const actions =
    span.parentElement?.parentElement?.querySelector(
      '.evaluation-actions'
    )

  if (!actions) return

  actions.innerHTML = `
    <button class="evaluation-update-btn">
      提交
    </button>
    <button class="evaluation-cancel-btn">
      取消
    </button>
  `

  const restoreEditButton = () => {
    actions.innerHTML = `
      <button class="evaluation-edit-btn">
        修改
      </button>
    `

    const editBtn =
      actions.querySelector('.evaluation-edit-btn')

    editBtn?.addEventListener('click', () => {
      const currentItem = evalList.value.find(
        e => e.ID === props.selfTag
      )

      if (currentItem) {
        startEdit(currentItem)
      }
    })
  }

  const updateBtn =
    actions.querySelector('.evaluation-update-btn')

  const cancelBtn =
    actions.querySelector('.evaluation-cancel-btn')

  updateBtn?.addEventListener('click', async () => {
    const textarea =
      span.querySelector(
        'textarea'
      ) as HTMLTextAreaElement

    const newVal = textarea.value.trim()

    if (newVal.length > 32) {
      alert('评价不能超过32个字符')
      return
    }

    try {
      emit(
        'eval-submit',
        props.user.username,
        newVal
      )

      // 等待父组件完成提交
      await new Promise(resolve =>
        setTimeout(resolve, 500)
      )

      // 重新拉取评价
      const latest =
        await props.fetchEvaluations(
          props.user.username
        )

      evalList.value = latest

      // 找到自己的最新评价
      const current = latest.find(
        e => e.ID === props.selfTag
      )

      span.textContent =
        current?.evaluation ?? newVal

      restoreEditButton()

      editingEval.value = null
    } catch (err) {
      console.error(err)
      alert('提交失败')
    }
  })

  cancelBtn?.addEventListener('click', () => {
    span.textContent =
      editingEval.value?.original ?? ''

    restoreEditButton()

    editingEval.value = null
  })
}

function submitNewEval() {
  const text = newEvalText.value.trim()
  if (text.length > 32) {
    alert('评价不能超过32个字符')
    return
  }
  if (text === '' && !confirm('评价内容为空，确定要提交吗？')) return
  emit('eval-submit', props.user.username, text)
  newEvalText.value = ''
}

function escapeHtml(str: string) {
  return str.replace(/[&<>]/g, function (m) {
    if (m === '&') return '&amp;'
    if (m === '<') return '&lt;'
    if (m === '>') return '&gt;'
    return m
  })
}

// 请求生涯图片
async function fetchCareerImage() {
  if (careerImageUrl.value && careerImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(careerImageUrl.value)
    careerImageUrl.value = ''
  }
  careerLoading.value = true
  careerError.value = null
  const token = localStorage.getItem('authToken')
  const body = {
    include_previous_season: true,
    mode: 'quick',
    bnet_id: props.user.username
  }
  try {
    const res = await fetch('/api/v2/dashen-profile/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      // 尝试获取错误详情
      let errMsg = `请求失败: ${res.status}`
      try {
        const errData = await res.json()
        errMsg = errData.message || errData.error || '服务错误'
      } catch (e) {
        // 如果返回的不是JSON，使用状态码文本
        errMsg = res.statusText || errMsg
      }
      throw new Error(errMsg)
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    careerImageUrl.value = url
  } catch (err: any) {
    console.error(err)
    careerError.value = err.message || '加载失败'
  } finally {
    careerLoading.value = false
  }
}

// 点击生涯按钮
function onCareerClick() {
  emit('expand-career', props.user.username)
  if (!expandCareer.value) {
    fetchCareerImage()  // 只有展开时才请求（避免重复请求）
  }
}

// 请求今日总结图片
async function fetchSummaryImage() {
  if (summaryImageUrl.value && summaryImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(summaryImageUrl.value)
    summaryImageUrl.value = ''
  }
  summaryLoading.value = true
  summaryError.value = null
  const token = localStorage.getItem('authToken')
  const body = {
    bnet_id: props.user.username
  }
  try {
    const res = await fetch('/api/v2/dashen-summary/today/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    })

    const contentType = res.headers.get('content-type') || ''
    // 如果返回的是 JSON，说明是业务错误（如无数据）
    if (contentType.includes('application/json')) {
      const errData = await res.json()
      const errMsg = errData.message || errData.error || '服务错误'
      throw new Error(errMsg)
    }

    if (!res.ok) {
      throw new Error(`请求失败: ${res.status} ${res.statusText}`)
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    summaryImageUrl.value = url
  } catch (err: any) {
    console.error(err)
    summaryError.value = err.message || '加载失败'
  } finally {
    summaryLoading.value = false
  }
}

// 点击今日总结按钮
function onSummaryClick() {
  emit('expand-summary', props.user.username)
  if (!expandSummary.value) {
    fetchSummaryImage()
  }
}

// 请求今日对局图片
async function fetchMatchImage() {
  if (matchImageUrl.value && matchImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(matchImageUrl.value)
    matchImageUrl.value = ''
  }
  matchLoading.value = true
  matchError.value = null
  const token = localStorage.getItem('authToken')
  const body = {
    limit: 20,
    include_fight: true,
    include_previous_season: true,
    bnet_id: props.user.username
  }
  try {
    const res = await fetch('/api/v2/dashen-match/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      // 尝试获取错误详情
      let errMsg = `请求失败: ${res.status}`
      try {
        const errData = await res.json()
        errMsg = errData.message || errData.error || '服务错误'
      } catch (e) {
        // 如果返回的不是JSON，使用状态码文本
        errMsg = res.statusText || errMsg
      }
      throw new Error(errMsg)
    }

    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    matchImageUrl.value = url
  } catch (err: any) {
    console.error(err)
    matchError.value = err.message || '加载失败'
  } finally {
    matchLoading.value = false
  }
}
// 点击今日对局按钮
function onMatchClick() {
  emit('expand-match', props.user.username)
  if (!expandMatch.value) {
    fetchMatchImage()
  }
}

// 点击对局强度按钮
function onStrengthClick() {
  if (expandStrength.value) {
    localExpandStrength.value = false
    emit('close-float') 
  } else {
    localExpandStrength.value = true
    emit('expand-strength', props.user.username)
  }
}

// 新增：处理快速比赛强度点击
function handleQuickMatchStrength() {
  // 这里可以添加具体逻辑，例如请求快速比赛数据或打开新窗口
  console.log('查看快速比赛强度:', props.user.username)
  // 示例: window.open(`/api/strength/quick/${props.user.username}`)
}

// 新增：处理竞技比赛强度点击
function handleCompetitiveStrength() {
  // 这里可以添加具体逻辑，例如请求竞技比赛数据或打开新窗口
  console.log('查看竞技比赛强度:', props.user.username)
  // 示例: window.open(`/api/strength/competitive/${props.user.username}`)
}
function onAdminClick() {
  // 关闭其他浮层
  if (expandAdmin.value) {
    expandAdmin.value = false
  } else {
    emit('close-float')   // 关闭其他浮层（可选）
    expandAdmin.value = true
  }
}

// 修改密码（管理员调用）
async function submitPasswordChange() {
  const pwd = adminNewPassword.value.trim()
  if (!pwd || pwd.length < 4) {
    alert('新密码长度不能少于4位')
    return
  }
  if (pwd !== adminConfirmPassword.value.trim()) {
    alert('两次密码不一致')
    return
  }
  const token = localStorage.getItem('authToken')
  const encoded = encodeURIComponent(props.user.username)
  try {
    const res = await fetch(`/api/users/${encoded}/change-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ newPassword: pwd })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '修改失败')
    alert('密码修改成功')
    //expandAdmin.value = false
    adminNewPassword.value = adminConfirmPassword.value = ''
  } catch (err: any) {
    alert(err.message)
  }
}

// 复制文本到剪贴板
async function copyInviteText() {
  try {
    await navigator.clipboard.writeText(inviteText.value)
    alert('已复制邀请文本')
  } catch (err) {
    console.error('复制失败:', err)
    alert('复制失败，请手动复制')
  }
}

// 修改战网ID（管理员调用）
async function submitBattletagChange() {
  const newTag = adminNewBattletag.value.trim()
  if (!newTag) {
    alert('请输入新战网ID')
    return
  }
  const token = localStorage.getItem('authToken')
  const encoded = encodeURIComponent(props.user.username)
  try {
    const res = await fetch(`/api/users/${encoded}/battletag`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ newBattletag: newTag })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || '修改失败')
    alert('战网ID修改成功，页面将刷新')
    location.reload()  // 强制刷新以更新列表
  } catch (err: any) {
    alert(err.message)
  }
}


function openImageViewer(url: string) {
  currentCareerImageUrl.value = url
  showImageViewer.value = true
}

onMounted(() => {
  const greetings = ['别来无恙~', '好久不见！', '欢迎你，特工', '近来可好？', '黑爪需要你', '又见面了！']
  randomGreeting.value = greetings[Math.floor(Math.random() * greetings.length)]
})

onUnmounted(() => {
  if (careerImageUrl.value && careerImageUrl.value.startsWith('blob:')) {
    URL.revokeObjectURL(careerImageUrl.value)
  }
  if (autoCloseTimer) clearTimeout(autoCloseTimer)
})
</script>

<style scoped>
/* 卡片基础样式 */
.member-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 10px;
  width: 260px;
  box-shadow: 0 6px 16px var(--shadow-color);
  transition: transform 0.3s, box-shadow 0.3s;
  position: relative;
  overflow: visible;
}

.member-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 10px 25px var(--shadow-color);
}

/* 内部容器：用于包裹主要内容，并作为评论按钮的定位参考 */
.card-content {
  position: relative;
  padding-bottom: 30px;
}

/* 头部：头像 + 名字 */
.member-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 16px;
}

.member-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  object-fit: cover;
  background: var(--accent);
  border: 2px solid var(--text-primary);
  flex-shrink: 0;
}

.member-id {
  font-size: 16px;
  font-weight: bold;
  color: var(--text-primary);
  word-break: break-all;
}

.member-greeting {
  font-size: 14px;
  color: var(--text-primary);
  opacity: 0.7;
  margin-bottom: 4px;
  font-weight: 500;
  line-height: 1.3;
}

.member-text {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 4px;
}

/* 段位容器 */
.ranks-container {
  display: flex;
  flex-wrap: wrap;
  gap: 0px;
  justify-content: center;
  margin-bottom: 16px;
}

.rank-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 50px;
}

.rank-icon-wrapper {
  position: relative;
  width: 32px;
  height: 32px;
}

.rank-icon {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.rank-level-badge {
  position: absolute;
  bottom: 2px;
  right: 2px;
  background: transparent;
  border-radius: 0;
  color: #222;
  font-size: 8px;
  font-weight: bold;
  padding: 0;
  line-height: 1;
}

.dark-theme .rank-level-badge {
  color: #fff;
}


.rank-level-badge.challenger-level {
  color: #fff800;
  font-size: 7px;
  font-weight: 900;
  text-shadow: 0 0 3px rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.5);
  right: 0px;
  bottom: -3px;
}


.dark-theme .rank-level-badge.challenger-level {
  color: #ffea00;
  text-shadow: 0 0 6px rgba(255, 234, 0, 0.3);
}

.rank-label {
  font-size: 8px;
  color: var(--text-primary);
  margin-top: 4px;
  text-align: center;
  opacity: 0.8;
}

/* 擅长英雄 */
.member-heroes {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  height: 48px;
  gap: 10px;
  margin-bottom: 8px;
}

.member-hero-icon {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: var(--bg-secondary);
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.member-hero-icon img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* 评价按钮 */
.evaluation-button {
  position: absolute;
  bottom: 0px;
  right: 0px;
  cursor: pointer;
  font-size: 20px;
  z-index: 10;
}

/* 点赞区域 */
.like-button-container {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  z-index: 10;
  cursor: pointer;
}

.like-count {
  color: var(--text-primary);
  font-size: 14px;
  font-weight: bold;
}

.heart {
  color: #ff4d6d;
  font-size: 14px;
}

/* 浮层样式 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.evaluation-item {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
  gap: 0px;
}

.evaluation-item-content {
  margin-bottom: 0px;  
  width: 100%;
}

.like-item,
.evaluation-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
}

.evaluation-input-container {
  padding: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.evaluation-input-container textarea {
  width: 100%;
  background: #222;
  color: white;
  border: 1px solid #555;
  border-radius: 4px;
  padding: 4px;
}

.like-list,
.evaluation-list {
  top: 100%;
  left: 0;
  right: 0;
  border-radius: 0 0 8px 8px;
  padding: 8px 0;
  z-index: 20;
  max-height: 200px;
  overflow-y: auto;
}

/* ========== 评价操作按钮（修改 / 提交 / 取消）优化 ========== */
:deep(.evaluation-actions) {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 4px;
  margin-bottom: 2px;
}

/* 基础按钮样式 */
:deep(.evaluation-edit-btn),
:deep(.evaluation-update-btn),
:deep(.evaluation-cancel-btn) {
  border: none;
  border-radius: 30px;
  padding: 5px 10px;
  font-size: 10px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  backdrop-filter: blur(2px);
}

/* 修改 / 提交按钮（强调色） */
:deep(.evaluation-edit-btn),
:deep(.evaluation-update-btn) {
  background: var(--accent);
  color: white;
  box-shadow: 0 1px 2px rgba(0,0,0,0.1);
}
:deep(.evaluation-edit-btn):hover,
:deep(.evaluation-update-btn):hover {
  background: var(--accent-hover, #3a7bd5);
  transform: translateY(-1px);
  box-shadow: 0 2px 6px rgba(0,0,0,0.15);
}

/* 取消按钮（弱化） */
:deep(.evaluation-cancel-btn) {
  background: rgba(128, 128, 128, 0.15);
  color: var(--text-secondary, #666);
}
:deep(.evaluation-cancel-btn):hover {
  background: rgba(128, 128, 128, 0.3);
  color: var(--text-primary);
}

/* 深色模式适配 */
.dark-theme :deep(.evaluation-cancel-btn) {
  background: rgba(255, 255, 255, 0.1);
  color: #aaa;
}
.dark-theme :deep(.evaluation-cancel-btn):hover {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
}

/* 按钮点击反馈（可选） */
:deep(.evaluation-edit-btn):active,
:deep(.evaluation-update-btn):active,
:deep(.evaluation-cancel-btn):active {
  transform: translateY(0);
}

:deep(.evaluation-item-evaluation) {
  word-break: break-word;
  white-space: normal;
  color: var(--text-primary);
  line-height: 1.4;
}

:deep(.evaluation-edit-input) {
  width: 100%;
  background: var(--input-bg);
  color: var(--text-primary);
  border: 1px solid var(--border-color, #888); /* 确保边框颜色有对比度 */
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  resize: vertical;
  outline: none;
}

.career-list {
  top: 100%;
  left: 0;
  right: 0;
  border-radius: 0 0 8px 8px;
  padding: 8px 0;
  z-index: 20;
  max-height: 200px;
  overflow-y: auto;
}

.career-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: white;
}

.loading-spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(255, 255, 255, 0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

/* 底部按钮组容器 */
.action-buttons {
  position: absolute;
  bottom: 0px;
  left: 0px;
  display: flex;
  gap: 8px;
  z-index: 10;
}

/* 单个按钮样式 */
.action-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.2s;
}

.action-btn:hover {
  opacity: 1;
}

/* 按钮图标（保留原有大小和圆角可选） */
.btn-icon {
  font-size: 18px;
  background: rgba(0, 0, 0, 0.4);
  width: 25px;
  height: 25px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  margin-bottom: 4px;
}

/* 按钮文字 */
.btn-label {
  font-size: 8px;
  color: var(--text-primary);
  opacity: 0.7;
  text-align: center;
  white-space: nowrap;
}

/* 今日总结浮层样式 */
.summary-list {
  top: 100%;
  left: 0;
  right: 0;
  border-radius: 0 0 8px 8px;
  padding: 8px 0;
  z-index: 20;
  overflow-y: auto;
}

.summary-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: white;
}

.summary-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.summary-error {
  color: #ff6666;
  text-align: center;
}

/* 今日对局浮层样式 */
.match-list {
  top: 100%;
  left: 0;
  right: 0;
  border-radius: 0 0 8px 8px;
  padding: 8px 0;
  z-index: 20;
  overflow-y: auto;
}

.match-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: white;
}

.match-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.match-error {
  color: #ff6666;
  text-align: center;
}


/* 对局强度浮层样式 */
.strength-list {
  top: 100%;
  left: 0;
  right: 0;
  border-radius: 0 0 8px 8px;
  padding: 8px 0;
  z-index: 20;
  overflow-y: auto;
}

.strength-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.strength-option-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
}

.strength-option-item:hover {
  background: rgba(255, 255, 255, 0.1);
}

.strength-option-item .btn-icon {
  font-size: 16px;
  background: transparent;
  width: auto;
  height: auto;
  margin-bottom: 0;
}

.strength-option-item .btn-label {
  font-size: 12px;
  color: var(--text-primary);
  opacity: 1;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.career-image {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
}

.career-error {
  color: #ff6666;
}


/* 管理面板浮层 */
.admin-panel {
  top: 100%;
  left: 0;
  right: 0;
  border-radius: 0 0 8px 8px;
  padding: 8px 0;
  z-index: 20;
  overflow-y: auto;
}

.admin-panel-title {
  font-weight: bold;
  margin-bottom: 8px;
  text-align: center;
  color: var(--accent);
}

.admin-section {
  margin-bottom: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 8px;
}

.admin-label {
  font-size: 12px;
  opacity: 0.8;
  margin-bottom: 4px;
}

.admin-input {
  width: 100%;
  padding: 6px;
  margin-bottom: 6px;
  border-radius: 4px;
  border: 1px solid #555;
  background: var(--input-bg);
  color: var(--text-primary);
}

.admin-submit {
  background: var(--accent);
  border: none;
  border-radius: 4px;
  padding: 4px 8px;
  color: white;
  cursor: pointer;
  font-size: 12px;
}

.share-text {
  background: var(--input-bg);
  border: 1px solid var(--input-border);
  border-radius: 8px;
  padding: 8px;
  font-size: 12px;
  cursor: pointer;
  word-break: break-all;
  transition: background 0.2s;
}

.share-text:hover {
  background: var(--accent);
  color: white;
}

.copy-hint {
  font-size: 10px;
  text-align: right;
  margin-top: 4px;
  opacity: 0.6;
}


</style>