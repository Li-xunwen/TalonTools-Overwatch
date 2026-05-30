<template>
  <div class="member-card" :data-is-self="user.username === selfTag">
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

    <div class="member-heroes">
      <div v-for="hero in topHeroes" :key="hero" class="member-hero-icon">
        <img :src="`/res/imge/hero/${encodeURIComponent(hero)}.png`" :alt="hero" loading="lazy" />
      </div>
    </div>

    <!-- 段位 + 点赞区域 -->
    <div class="like-button-container" @click.stop="onLikeClick">
      <div v-if="rankInfo" class="member-rank">
        <img :src="`/res/imge/rank/${rankInfo.rank}.png`" :alt="rankInfo.rank" />
        <span class="rank-level">{{ rankInfo.level }}</span>
      </div>
      <span class="like-count">{{ displayLikeCount }}</span>
      <span class="heart">❤️</span>
    </div>

    <!-- 点赞列表浮层 -->
    <Transition name="fade">
      <div v-if="expandLike" class="like-list" @click.stop>
        <div v-if="likeList.length === 0" class="empty-tip">暂无点赞</div>
        <div v-for="item in likeList.slice(0, 10)" :key="item.ID" class="like-item">
          <span class="like-item-id">{{ item.ID }}</span>
          <span class="like-item-like">❤️{{ item.Like + (item.ID === selfTag ? (tempLikeMap.get(user.username) || 0) : 0) }}</span>
        </div>
      </div>
    </Transition>

    <!-- 评价按钮 -->
    <div class="evaluation-button" @click.stop="onEvalClick">💬</div>

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
import { ref, computed, onMounted } from 'vue'

const props = defineProps<{
  user: { username: string; hero?: string[]; Rank?: { rank: string; level: number } }
  selfTag: string | null
  currentExpandId: string
  // 以下数据从父组件通过 props 传递（避免使用 inject）
  likeCache: Map<string, any[]>
  evalCache: Map<string, any[]>
  tempLikeMap: Map<string, number>
  getTotalLikes: (username: string) => number
  fetchEvaluations: (username: string) => Promise<any[]>
}>()

const emit = defineEmits<{
  (e: 'expand-like', username: string): void
  (e: 'expand-eval', username: string): void
  (e: 'like-click', username: string): void
  (e: 'eval-submit', username: string, text: string): void
}>()

const randomGreeting = ref('')
const newEvalText = ref('')
const editingEval = ref<{ item: any; original: string } | null>(null)

const topHeroes = computed(() => (props.user.hero || []).slice(0, 5))

const rankInfo = computed(() => {
  const r = props.user.Rank
  if (r && r.rank && r.level >= 1 && r.level <= 5) return r
  return null
})

const displayLikeCount = computed(() => {
  const base = props.getTotalLikes(props.user.username)
  const temp = props.tempLikeMap.get(props.user.username) || 0
  return base + temp
})

const likeList = computed(() => props.likeCache.get(props.user.username) || [])
const evalList = ref<any[]>([])
const hasSelfEval = computed(() => evalList.value.some(item => item.ID === props.selfTag))

const expandLike = computed(() => props.currentExpandId === `like-${props.user.username}`)
const expandEval = computed(() => props.currentExpandId === `eval-${props.user.username}`)

function handleAvatarError(e: Event) {
  (e.target as HTMLImageElement).style.opacity = '0.4'
}

function onLikeClick() {
  emit('like-click', props.user.username)
  emit('expand-like', props.user.username)
}

function onEvalClick() {
  emit('expand-eval', props.user.username)
  props.fetchEvaluations(props.user.username).then(data => {
    evalList.value = data
  })
}

function startEdit(item: any) {
  editingEval.value = { item, original: item.evaluation }
  const span = document.getElementById(`eval-${props.user.username}-${item.ID}`)
  if (span) {
    span.innerHTML = `<textarea class="evaluation-edit-input" maxlength="32" rows="2">${escapeHtml(item.evaluation)}</textarea>`
    const actions = span.parentElement?.parentElement?.querySelector('.evaluation-actions')
    if (actions) {
      actions.innerHTML = `
        <button class="evaluation-update-btn" data-id="${item.ID}">提交</button>
        <button class="evaluation-cancel-btn" data-id="${item.ID}">取消</button>
      `
      const updateBtn = actions.querySelector('.evaluation-update-btn')
      const cancelBtn = actions.querySelector('.evaluation-cancel-btn')
      updateBtn?.addEventListener('click', () => {
        const newVal = (span.querySelector('textarea') as HTMLTextAreaElement).value.trim()
        if (newVal.length > 32) alert('评价不能超过32个字符')
        else emit('eval-submit', props.user.username, newVal)
      })
      cancelBtn?.addEventListener('click', () => {
        span.textContent = editingEval.value!.original
        actions.innerHTML = `<button class="evaluation-edit-btn">修改</button>`
        editingEval.value = null
      })
    }
  }
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
/* 过渡动画（Vue 专用） */
.fade-enter-active,
.fade-leave-active {
    transition: opacity 0.2s;
}
.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}

/* 点赞列表 / 评价列表的容器内布局（全局只定义了外层框，内部细节由组件控制） */
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

.member-rank {
    position: absolute;
    top: 0;
    right: 0;
    width: 32px;
    height: 32px;
    z-index: 10;
}

.member-rank img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.member-rank .rank-level {
    position: absolute;
    bottom: 0;
    right: 0;
    font-size: 10px;
    font-weight: bold;
    color: #fff;
    text-shadow: 0 0 2px #000;
    background: transparent;
    border-radius: 0;
    padding: 0;
    line-height: 1;
}
/* 按钮已经由全局 .evaluation-submit-btn 等控制，无需重复 */
</style>
