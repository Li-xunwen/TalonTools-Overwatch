<template>
  <div class="member-card" :data-is-self="user.username === selfTag">
    <!-- 内部容器：包裹主要内容 -->
    <div class="card-content">
      <!-- 头部：头像 + 名字 -->
      <div class="member-header">
        <img
          :src="`/res/imge/${user.username.replace(/#/g, '-')}.jpg`"
          class="member-avatar"
          @error="handleAvatarError"
        />
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
            <span class="rank-level-badge">{{ rank.level }}</span>
          </div>
          <div class="rank-label">{{ rank.label }}</div>
        </div>
      </div>

      <!-- 擅长英雄 -->
      <div class="member-heroes">
        <div v-for="hero in topHeroes" :key="hero" class="member-hero-icon">
          <img :src="`/res/imge/hero/${encodeURIComponent(hero)}.png`" :alt="hero" loading="lazy" />
        </div>
      </div>

      <!-- 评价按钮 -->
      <div class="evaluation-button" @click.stop="onEvalClick">💬</div>
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
        <div v-for="item in likeList.slice(0, 10)" :key="item.ID" class="like-item">
          <span class="like-item-id">{{ item.ID }}</span>
          <span class="like-item-like">❤️{{ item.Like }}</span>
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
          <button class="evaluation-submit-btn" @click="submitNewEval">提交</button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, onUnmounted } from 'vue'

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
}>()

const emit = defineEmits<{
  (e: 'expand-like', username: string): void
  (e: 'expand-eval', username: string): void
  (e: 'like-click', username: string): void
  (e: 'eval-submit', username: string, text: string): void
  (e: 'close-float'): void   // 关闭当前浮层（用于自动关闭）
}>()

const randomGreeting = ref('')
const newEvalText = ref('')
const editingEval = ref<{ item: any; original: string } | null>(null)

// 擅长英雄（最多5个）
const topHeroes = computed(() => (props.user.hero || []).slice(0, 5))

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
    if (data && data.rank && data.level >= 1 && data.level <= 5) {
      ranks.push({ type: r.field, label: r.label, rank: data.rank, level: data.level })
    }
  }
  return ranks
})
const hasAnyRank = computed(() => rankList.value.length > 0)

// 点赞显示数字
const displayLikeCount = computed(() => {
  const likes = props.likeCache[props.user.username] || []
  // 如果是自己的卡片，显示自己收到的总赞数
  if (props.user.username === props.selfTag) {
    return likes.reduce((sum, item) => sum + (item.Like || 0), 0)
  }
  // 他人的卡片，显示当前用户给该他人的点赞次数
  const selfLike = likes.find(item => item.ID === props.selfTag)?.Like || 0
  return selfLike
})

// 点赞列表（供浮层使用）
const likeList = computed(() => props.likeCache[props.user.username] || [])
const evalList = ref<any[]>([])
const hasSelfEval = computed(() => evalList.value.some(item => item.ID === props.selfTag))

const expandLike = computed(() => props.currentExpandId === `like-${props.user.username}`)
const expandEval = computed(() => props.currentExpandId === `eval-${props.user.username}`)

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

onUnmounted(() => {
  if (autoCloseTimer) clearTimeout(autoCloseTimer)
})

function handleAvatarError(e: Event) {
  (e.target as HTMLImageElement).style.opacity = '0.4'
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
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;'
    if (m === '<') return '&lt;'
    if (m === '>') return '&gt;'
    return m
  })
}

onMounted(() => {
  const greetings = ['别来无恙~', '好久不见！', '欢迎你，特工', '近来可好？', '黑爪需要你', '又见面了！']
  randomGreeting.value = greetings[Math.floor(Math.random() * greetings.length)]
})
</script>

<style scoped>
/* 卡片基础样式 */
.member-card {
  background: var(--card-bg);
  border-radius: 16px;
  padding: 10px;
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
  color: #ffffff;
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
.like-item,
.evaluation-item {
  display: flex;
  justify-content: space-between;
  padding: 4px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
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
</style>