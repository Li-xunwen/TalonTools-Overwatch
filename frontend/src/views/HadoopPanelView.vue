<template>
  <div class="hadoop-page news-page">
    <ThemeToggle />
    <Toast :message="toastMessage" :duration="3000" />

    <div class="content-area">
      <header class="panel-header">
        <div class="panel-title">
          <span class="panel-icon">🐘</span>
          <div>
            <h1>黑爪会议室 · 数据面板</h1>
            <p class="panel-sub">日志经 HDFS 存储、YARN 计算后生成的各类视图</p>
          </div>
        </div>
        <div class="panel-actions">
          <button class="ghost-btn" @click="goBack">返回</button>
          <button class="ghost-btn" :disabled="loading.status" @click="loadStatus">刷新状态</button>
        </div>
      </header>

      <!-- 集群状态 -->
      <section class="status-row">
        <div class="status-card" :class="statusClass(status?.hdfs?.online)">
          <span class="status-name">HDFS</span>
          <span class="status-value">{{ status?.hdfs?.online ? '在线' : '离线' }}</span>
          <span class="status-extra">{{ status?.hdfs?.error || `根目录 ${(status?.hdfs?.rootDirs ?? []).join('、') || '-'}` }}</span>
        </div>
        <div class="status-card" :class="statusClass(status?.yarn?.online)">
          <span class="status-name">YARN</span>
          <span class="status-value">{{ status?.yarn?.online ? '在线' : '离线' }}</span>
          <span class="status-extra">
            集群 {{ status?.yarn?.id || '-' }} · v{{ status?.yarn?.version || '-' }}
          </span>
        </div>
        <div class="status-card neutral">
          <span class="status-name">数据来源</span>
          <span class="status-value">{{ sourceLabel }}</span>
          <span class="status-extra">{{ analytics?.hdfsPath || status?.logRoot || '-' }}</span>
        </div>
      </section>

      <!-- 操作区 -->
      <section class="ops-card">
        <div class="ops-row">
          <label class="ops-label">数据源</label>
          <div class="seg">
            <button :class="{ active: source === 'hdfs' }" @click="switchSource('hdfs')">HDFS（Hadoop）</button>
            <button :class="{ active: source === 'local' }" @click="switchSource('local')">本地（未上云）</button>
          </div>
          <label class="ops-label">日期</label>
          <input v-model="date" class="ops-input" type="date">
        </div>
        <div class="ops-row">
          <button class="primary-btn" :disabled="loading.collect" @click="collectLogs">
            {{ loading.collect ? '采集中…' : '① 采集日志' }}
          </button>
          <button class="primary-btn" :disabled="loading.upload" @click="uploadLogs">
            {{ loading.upload ? '上传中…' : '② 采集并上传到 HDFS' }}
          </button>
          <button class="primary-btn" :disabled="loading.job" @click="runWordCount">
            {{ loading.job ? '作业运行中…' : '③ 跑词云作业（中文分词）' }}
          </button>
          <button class="ghost-btn" :disabled="loading.analytics" @click="loadAnalytics">
            {{ loading.analytics ? '加载中…' : '刷新视图' }}
          </button>
        </div>
        <p class="ops-hint">
          链路：采集（API 访问 + 用户行为 + 评论/评价）→ WebHDFS 上传 → 面板读取 / Hadoop 作业 → 视图
          <span v-if="jobInfo" class="job-tag">
            最近作业 {{ jobInfo.jobId }}（map {{ jobInfo.counters?.mapTasks }} / reduce {{ jobInfo.counters?.reduceTasks }}）
          </span>
        </p>
      </section>

      <p v-if="errorMessage" class="error-tip">{{ errorMessage }}</p>

      <!-- 概览 -->
      <section v-if="analytics" class="metric-row">
        <div class="metric">
          <span class="metric-value">{{ analytics.totalRecords }}</span>
          <span class="metric-label">日志总条数</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ analytics.kinds.api }}</span>
          <span class="metric-label">接口调用</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ analytics.kinds.event }}</span>
          <span class="metric-label">用户行为</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ analytics.kinds.comment }}</span>
          <span class="metric-label">评论</span>
        </div>
        <div class="metric">
          <span class="metric-value">{{ activeUserCount }}</span>
          <span class="metric-label">活跃用户</span>
        </div>
      </section>

      <div class="grid-2">
        <!-- 接口使用率 -->
        <section class="card">
          <h2 class="card-title">查询接口使用率</h2>
          <p class="card-sub">按归一化后的接口路径统计（数字 ID 已折叠为 :id）</p>
          <div v-if="analytics?.apiUsage?.length" class="bar-list">
            <div v-for="item in analytics.apiUsage" :key="`${item.method}-${item.path}`" class="bar-item">
              <div class="bar-head">
                <span class="bar-name"><em class="method">{{ item.method }}</em>{{ item.path }}</span>
                <span class="bar-value">{{ item.count }} 次 · {{ item.percent }}%</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill" :style="{ width: `${Math.min(item.percent, 100)}%` }"></div>
              </div>
            </div>
          </div>
          <p v-else class="empty-tip">暂无接口调用记录（先点「采集并上传到 HDFS」，或选择本地数据源）</p>
        </section>

        <!-- 常用用户 -->
        <section class="card">
          <h2 class="card-title">常用用户</h2>
          <p class="card-sub">按日志条数排序，鼠标悬停可见接口 / 行为 / 评论构成</p>
          <ol v-if="analytics?.activeUsers?.length" class="rank-list">
            <li v-for="(user, index) in analytics.activeUsers" :key="user.user" class="rank-item">
              <span class="rank-index" :class="{ top: index < 3 }">{{ index + 1 }}</span>
              <span class="rank-name" :title="`接口 ${user.apiCount} / 行为 ${user.eventCount} / 评论 ${user.commentCount}`">
                {{ user.user }}
              </span>
              <span class="rank-bar">
                <span class="rank-bar-fill" :style="{ width: `${Math.min(user.percent * 3, 100)}%` }"></span>
              </span>
              <span class="rank-count">{{ user.count }}</span>
            </li>
          </ol>
          <p v-else class="empty-tip">暂无用户数据</p>
        </section>
      </div>

      <div class="grid-2">
        <!-- 词云 -->
        <section class="card">
          <h2 class="card-title">评论词云</h2>
          <p class="card-sub">
            语料：评论 + 用户评价｜来源：{{ wordCloudSource }}（中文按二字词切分，英文按单词）
          </p>
          <div v-if="wordCloud.length" ref="cloudRef" class="word-cloud" :style="{ height: `${CLOUD_HEIGHT}px` }">
            <span
              v-for="item in placedWords"
              :key="item.word"
              class="cloud-word"
              :style="{ left: `${item.x}px`, top: `${item.y}px`, fontSize: `${item.size}px`, color: item.color }"
              :title="`${item.word}：${item.count} 次`"
            >{{ item.word }}</span>
          </div>
          <p v-else class="empty-tip">暂无可用于词云的文本（需要评论数据）</p>
          <p v-if="wordCloud.length && wordCloud.length > placedWords.length" class="empty-tip">
            共 {{ wordCloud.length }} 个词，聚拢排列放下 {{ placedWords.length }} 个（其余省略，缩放窗口会重新排列）
          </p>
        </section>

        <!-- 事件分布 + 活跃时段 -->
        <section class="card">
          <h2 class="card-title">用户行为分布</h2>
          <p class="card-sub">来自 user_events 表（登录 / 点赞 / 评论 / 上传等）</p>
          <div v-if="analytics?.eventTypes?.length" class="bar-list compact">
            <div v-for="item in analytics.eventTypes.slice(0, 8)" :key="item.type" class="bar-item">
              <div class="bar-head">
                <span class="bar-name">{{ item.type }}</span>
                <span class="bar-value">{{ item.count }}</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill alt" :style="{ width: `${eventPercent(item.count)}%` }"></div>
              </div>
            </div>
          </div>
          <p v-else class="empty-tip">暂无行为数据</p>

          <div class="hour-head">
            <h3 class="card-title sub">活跃时段（北京时间）</h3>
            <div class="seg small">
              <button :class="{ active: hourMode === 'all' }" @click="hourMode = 'all'">全部活动</button>
              <button :class="{ active: hourMode === 'login' }" @click="hourMode = 'login'">仅登录</button>
            </div>
          </div>
          <p class="card-sub">
            {{ hourMode === 'login' ? '只看 user_events 里 event_type=login 的登录时刻' : '接口访问 + 用户行为 + 评论/评价，按记录时间的小时聚合' }}
          </p>
          <div class="hour-chart">
            <div v-for="bucket in hourBuckets" :key="bucket.hour" class="hour-col">
              <div class="hour-bar" :style="{ height: `${hourHeight(bucket.count)}%` }" :title="`${bucket.hour} 点：${bucket.count} 条`"></div>
              <span class="hour-label">{{ bucket.hour }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- 社区数据视图：点赞榜 / 英雄热度 / 按天趋势 -->
      <div class="grid-3">
        <section class="card">
          <h2 class="card-title">点赞榜（被赞最多）</h2>
          <p class="card-sub">来自 likes 表（{{ analytics?.kinds?.like ?? 0 }} 条点赞关系）</p>
          <ol v-if="analytics?.likeRanking?.length" class="rank-list">
            <li v-for="(item, index) in analytics.likeRanking.slice(0, 10)" :key="item.user" class="rank-item">
              <span class="rank-index" :class="{ top: index < 3 }">{{ index + 1 }}</span>
              <span class="rank-name" :title="`来自 ${item.fromUsers} 位用户`">{{ item.user }}</span>
              <span class="rank-bar">
                <span class="rank-bar-fill like" :style="{ width: `${likePercent(item.likes)}%` }"></span>
              </span>
              <span class="rank-count">{{ item.likes }}</span>
            </li>
          </ol>
          <p v-else class="empty-tip">暂无点赞数据</p>
        </section>

        <section class="card">
          <h2 class="card-title">英雄热度</h2>
          <p class="card-sub">来自 user_favorite_heroes（{{ analytics?.kinds?.favorite ?? 0 }} 条常用英雄）</p>
          <div v-if="analytics?.heroRanking?.length" class="bar-list compact">
            <div v-for="item in analytics.heroRanking.slice(0, 10)" :key="item.hero" class="bar-item">
              <div class="bar-head">
                <span class="bar-name">{{ item.hero }}</span>
                <span class="bar-value">{{ item.count }} 人</span>
              </div>
              <div class="bar-track">
                <div class="bar-fill hero" :style="{ width: `${heroPercent(item.count)}%` }"></div>
              </div>
            </div>
          </div>
          <p v-else class="empty-tip">暂无常用英雄数据</p>
        </section>

        <section class="card">
          <h2 class="card-title">登录 / 注册趋势</h2>
          <p class="card-sub">最近 14 天（北京时间），登录与新增用户按天统计</p>
          <div v-if="analytics?.daily?.length" class="trend">
            <div v-for="day in analytics.daily" :key="day.date" class="trend-col">
              <div class="trend-bars">
                <div class="trend-bar login" :style="{ height: `${trendHeight(day.login)}%` }" :title="`${day.date} 登录 ${day.login} 次`"></div>
                <div class="trend-bar register" :style="{ height: `${trendHeight(day.register)}%` }" :title="`${day.date} 新增 ${day.register} 人`"></div>
              </div>
              <span class="trend-label">{{ day.date.slice(5) }}</span>
            </div>
          </div>
          <p v-else class="empty-tip">暂无趋势数据</p>
          <div class="legend">
            <span><i class="dot login"></i>登录</span>
            <span><i class="dot register"></i>新增用户</span>
          </div>
        </section>
      </div>

      <!-- YARN 作业 -->
      <section class="card">
        <h2 class="card-title">YARN 作业记录</h2>
        <p class="card-sub">来自 ResourceManager REST（{{ status?.yarnBase }}）</p>
        <div v-if="apps.length" class="table-wrap">
          <table class="job-table">
            <thead>
              <tr>
                <th>作业 ID</th>
                <th>名称</th>
                <th>状态</th>
                <th>结果</th>
                <th>用户</th>
                <th>耗时</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="app in apps" :key="app.id">
                <td class="mono">{{ app.id }}</td>
                <td>{{ app.name }}</td>
                <td>{{ app.state }}</td>
                <td :class="app.finalStatus === 'SUCCEEDED' ? 'ok' : 'warn'">{{ app.finalStatus || '-' }}</td>
                <td>{{ app.user }}</td>
                <td>{{ app.durationMs ? (app.durationMs / 1000).toFixed(1) + 's' : '-' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-tip">暂无作业记录</p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Toast from '@/components/Toast.vue'
import { authFetch } from '@/utils/request'

/* =========================
   类型
========================= */

interface HadoopStatus {
  checkedAt: string
  webhdfsBase: string
  yarnBase: string
  logRoot: string
  hdfs: { online: boolean; rootDirs?: string[]; error?: string }
  yarn: { online: boolean; id?: string; state?: string; version?: string; error?: string }
}

interface ApiUsageItem {
  path: string
  method: string
  count: number
  percent: number
}

interface ActiveUserItem {
  user: string
  count: number
  percent: number
  apiCount: number
  eventCount: number
  commentCount: number
  lastSeen: string
}

interface WordCloudItem {
  word: string
  count: number
}

interface Analytics {
  source: string
  generatedAt: string
  totalRecords: number
  kinds: { api: number; event: number; comment: number; like: number; favorite: number }
  range: { from: string; to: string }
  apiUsage: ApiUsageItem[]
  activeUsers: ActiveUserItem[]
  wordCloud: WordCloudItem[]
  eventTypes: { type: string; count: number }[]
  hourly: { hour: number; count: number }[]
  loginHourly: { hour: number; count: number }[]
  likeRanking: { user: string; likes: number; fromUsers: number }[]
  heroRanking: { hero: string; count: number }[]
  daily: { date: string; total: number; login: number; register: number }[]
  hdfsPath?: string
}

interface YarnAppRow {
  id: string
  name: string
  state: string
  finalStatus: string
  user: string
  durationMs: number | null
}

/* =========================
   状态
========================= */

const router = useRouter()
const toastMessage = ref('')
const errorMessage = ref('')

const status = ref<HadoopStatus | null>(null)
const analytics = ref<Analytics | null>(null)
const apps = ref<YarnAppRow[]>([])
const wordCloudFromMr = ref<WordCloudItem[]>([])
const jobInfo = ref<{ jobId: string; counters?: { mapTasks?: number; reduceTasks?: number } } | null>(null)
// 词云作业（Hadoop Streaming + 中文分词）的输出路径
const WORDCLOUD_OUTPUT = '/blacktalon/logs/wordcloud-out'

const source = ref<'hdfs' | 'local'>('hdfs')
const date = ref(new Date().toISOString().slice(0, 10))
const hourMode = ref<'all' | 'login'>('all')
const loading = ref({ status: false, analytics: false, collect: false, upload: false, job: false })

const sourceLabel = computed(() => (source.value === 'hdfs' ? 'HDFS（Hadoop）' : '本地'))
const activeUserCount = computed(() => analytics.value?.activeUsers?.length ?? 0)
const wordCloud = computed(() => {
  // 词云优先用 MapReduce 的输出（体现 Hadoop 计算），没有则用面板聚合结果
  if (wordCloudFromMr.value.length) return wordCloudFromMr.value.slice(0, 40)
  return (analytics.value?.wordCloud ?? []).slice(0, 40)
})
const wordCloudSource = computed(() =>
  wordCloudFromMr.value.length
    ? 'Hadoop Streaming 词云作业（输出在 HDFS）'
    : '面板聚合（HDFS 日志）'
)

/* =========================
   工具
========================= */

function showToast(message: string) {
  toastMessage.value = ''
  window.setTimeout(() => {
    toastMessage.value = message
  }, 0)
}

function statusClass(online?: boolean): string {
  if (online === undefined) return 'neutral'
  return online ? 'ok' : 'bad'
}

function eventPercent(count: number): number {
  const max = Math.max(...(analytics.value?.eventTypes ?? []).map((item) => item.count), 1)
  return Math.round((count / max) * 100)
}

function hourHeight(count: number): number {
  const max = Math.max(...hourBuckets.value.map((item) => item.count), 1)
  return Math.round((count / max) * 100)
}

// 活跃时段：全部活动 / 仅登录
const hourBuckets = computed(() =>
  hourMode.value === 'login'
    ? analytics.value?.loginHourly ?? []
    : analytics.value?.hourly ?? []
)

function likePercent(likes: number): number {
  const max = Math.max(...(analytics.value?.likeRanking ?? []).map((x) => x.likes), 1)
  return Math.round((likes / max) * 100)
}

function heroPercent(count: number): number {
  const max = Math.max(...(analytics.value?.heroRanking ?? []).map((x) => x.count), 1)
  return Math.round((count / max) * 100)
}

function trendHeight(count: number): number {
  const max = Math.max(...(analytics.value?.daily ?? []).map((x) => Math.max(x.login, x.register)), 1)
  return Math.round((count / max) * 100)
}

/* =========================
   词云：聚拢排列（中心向外螺旋 + 矩形碰撞检测）
   —— 不再按行平铺，词越大越靠近中心，整体呈团状
========================= */

interface PlacedWord {
  word: string
  count: number
  size: number
  x: number
  y: number
  w: number
  h: number
  color: string
}

const CLOUD_HEIGHT = 320
const CLOUD_PALETTE = ['#7ec8ff', '#7ee0b8', '#ffd479', '#ff9fb2', '#c8a6ff', '#8fe3ff']

const cloudRef = ref<HTMLElement | null>(null)
const placedWords = ref<PlacedWord[]>([])
let measureCanvas: CanvasRenderingContext2D | null | undefined
let cloudObserver: ResizeObserver | null = null

function measureContext(): CanvasRenderingContext2D | null {
  if (measureCanvas === undefined) {
    measureCanvas = document.createElement('canvas').getContext('2d')
  }
  return measureCanvas
}

/** 计算每个词的落点：从中心开始螺旋外扩，找到第一个不与已放置词重叠的位置 */
function layoutWordCloud() {
  const box = cloudRef.value
  const words = wordCloud.value
  if (!box || !words.length) {
    placedWords.value = []
    return
  }

  const width = box.clientWidth || 360
  const height = CLOUD_HEIGHT
  const ctx = measureContext()
  const family = getComputedStyle(box).fontFamily || 'sans-serif'

  const counts = words.map((item) => item.count)
  const max = Math.max(...counts, 1)
  const min = Math.min(...counts)
  const cx = width / 2
  const cy = height / 2

  const placed: PlacedWord[] = []

  for (let index = 0; index < Math.min(words.length, 80); index++) {
    const item = words[index]
    const ratio = max === min ? 1 : (item.count - min) / (max - min)
    // 高频词更大，但差距收敛，避免少数词压满整个画布
    const size = 12 + Math.pow(ratio, 0.75) * 22
    const color = CLOUD_PALETTE[index % CLOUD_PALETTE.length]

    let w: number
    let h: number
    if (ctx) {
      ctx.font = `700 ${size}px ${family}`
      w = ctx.measureText(item.word).width
    } else {
      w = item.word.length * size * 0.62
    }
    h = size * 1.1
    w = Math.ceil(w) + 6
    h = Math.ceil(h) + 4

    let placedOk = false
    for (let step = 0; step < 5000 && !placedOk; step++) {
      const angle = step * 0.28
      const radius = 3.1 * Math.sqrt(step)
      // 纵向压缩成椭圆，更像一团而不是一个圆环
      const x = cx + radius * Math.cos(angle) - w / 2
      const y = cy + radius * Math.sin(angle) * 0.58 - h / 2

      if (x < 0 || y < 0 || x + w > width || y + h > height) continue
      const overlap = placed.some(
        (p) => !(x + w <= p.x || p.x + p.w <= x || y + h <= p.y || p.y + p.h <= y)
      )
      if (overlap) continue

      placed.push({ word: item.word, count: item.count, size, x, y, w, h, color })
      placedOk = true
    }
  }

  placedWords.value = placed
}

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(url, init)
  const text = await res.text()
  let body: any = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  if (!res.ok) throw new Error(body?.error ?? `请求失败（HTTP ${res.status}）`)
  return body as T
}

/* =========================
   加载
========================= */

async function loadStatus() {
  loading.value.status = true
  try {
    status.value = await getJson<HadoopStatus>('/api/hadoop/status')
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    loading.value.status = false
  }
}

async function loadAnalytics() {
  loading.value.analytics = true
  errorMessage.value = ''
  try {
    analytics.value = await getJson<Analytics>(
      `/api/hadoop/analytics?source=${source.value}&date=${date.value}`
    )
  } catch (error) {
    errorMessage.value = (error as Error).message
  } finally {
    loading.value.analytics = false
  }
}

async function loadApps() {
  try {
    const data = await getJson<{ apps: YarnAppRow[] }>('/api/hadoop/jobs/apps?limit=10')
    apps.value = data.apps ?? []
  } catch {
    apps.value = []
  }
}

async function loadMrResult() {
  try {
    const data = await getJson<{ words: WordCloudItem[] }>(
      `/api/hadoop/jobs/wordcloud/result?path=${encodeURIComponent(WORDCLOUD_OUTPUT)}`
    )
    wordCloudFromMr.value = data.words ?? []
  } catch {
    wordCloudFromMr.value = []
  }
}

async function collectLogs() {
  loading.value.collect = true
  try {
    const data = await getJson<{ total: number; kinds: Record<string, number> }>('/api/hadoop/logs/collect', {
      method: 'POST',
      body: '{}'
    })
    showToast(`已采集 ${data.total} 条（接口 ${data.kinds.api} / 行为 ${data.kinds.event} / 评论 ${data.kinds.comment}）`)
  } catch (error) {
    showToast((error as Error).message)
  } finally {
    loading.value.collect = false
  }
}

async function uploadLogs() {
  loading.value.upload = true
  try {
    const data = await getJson<{ lines: number; bytes: number; hdfsPath: string }>('/api/hadoop/logs/upload', {
      method: 'POST',
      body: JSON.stringify({ date: date.value })
    })
    showToast(`已上传 ${data.lines} 行（${(data.bytes / 1024).toFixed(1)} KB）→ ${data.hdfsPath}`)
    source.value = 'hdfs'
    await loadAnalytics()
  } catch (error) {
    showToast((error as Error).message)
  } finally {
    loading.value.upload = false
  }
}

async function runWordCount() {
  loading.value.job = true
  try {
    const data = await getJson<{ jobId: string; counters: { mapTasks: number; reduceTasks: number } }>(
      '/api/hadoop/jobs/wordcloud',
      { method: 'POST', body: JSON.stringify({ date: date.value, output: WORDCLOUD_OUTPUT }) }
    )
    jobInfo.value = data
    showToast(`词云作业 ${data.jobId} 完成（map ${data.counters?.mapTasks} / reduce ${data.counters?.reduceTasks}）`)
    await Promise.all([loadApps(), loadMrResult()])
  } catch (error) {
    showToast((error as Error).message)
  } finally {
    loading.value.job = false
  }
}

function switchSource(next: 'hdfs' | 'local') {
  source.value = next
  void loadAnalytics()
}

function goBack() {
  router.push('/profile')
}

// 词云数据变化或容器尺寸变化时重排
watch(wordCloud, () => {
  void nextTick(layoutWordCloud)
})

onMounted(async () => {
  await Promise.all([loadStatus(), loadAnalytics(), loadApps(), loadMrResult()])
  await nextTick()
  layoutWordCloud()

  if (cloudRef.value && typeof ResizeObserver !== 'undefined') {
    cloudObserver = new ResizeObserver(() => layoutWordCloud())
    cloudObserver.observe(cloudRef.value)
  }
})

onUnmounted(() => {
  cloudObserver?.disconnect()
  cloudObserver = null
})
</script>

<style scoped>
.hadoop-page {
  min-height: 100vh;
  padding-bottom: 40px;
}

.content-area {
  max-width: 1200px;
  margin: 0 auto;
  padding: 24px 16px 0;
}

/* 头部 */
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.panel-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.panel-icon {
  font-size: 32px;
}

.panel-title h1 {
  margin: 0;
  font-size: 1.35rem;
  color: var(--text-primary);
}

.panel-sub {
  margin: 4px 0 0;
  font-size: 0.82rem;
  opacity: 0.65;
  color: var(--text-primary);
}

.panel-actions {
  display: flex;
  gap: 8px;
}

/* 状态卡 */
.status-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}

.status-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  border-radius: 16px;
  background: var(--section-bg, var(--bg-secondary));
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.status-card.ok {
  border-left: 4px solid #2ecc71;
}

.status-card.bad {
  border-left: 4px solid #ff4d4f;
}

.status-card.neutral {
  border-left: 4px solid #7ec8ff;
}

.status-name {
  font-size: 0.78rem;
  opacity: 0.7;
  color: var(--text-primary);
}

.status-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary);
}

.status-extra {
  font-size: 0.75rem;
  opacity: 0.6;
  color: var(--text-primary);
  word-break: break-all;
}

/* 操作区 */
.ops-card {
  padding: 14px 16px;
  border-radius: 18px;
  background: var(--section-bg, var(--bg-secondary));
  box-shadow: inset 0 0 0 1px var(--glass-border);
  margin-bottom: 14px;
}

.ops-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.ops-label {
  font-size: 0.8rem;
  opacity: 0.7;
  color: var(--text-primary);
}

.ops-input {
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid var(--glass-border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-family: inherit;
}

.seg {
  display: flex;
  border-radius: 999px;
  overflow: hidden;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.seg button {
  padding: 6px 14px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.82rem;
  cursor: pointer;
}

.seg button.active {
  background: var(--accent);
  color: #fff;
  font-weight: 700;
}

.primary-btn,
.ghost-btn {
  padding: 8px 14px;
  border: none;
  border-radius: 12px;
  font-family: inherit;
  font-size: 0.85rem;
  cursor: pointer;
  transition: 0.15s ease;
}

.primary-btn {
  background: var(--accent);
  color: #fff;
  font-weight: 700;
}

.ghost-btn {
  background: transparent;
  color: var(--text-primary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.primary-btn:disabled,
.ghost-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.primary-btn:hover:not(:disabled),
.ghost-btn:hover:not(:disabled) {
  filter: brightness(1.08);
}

.ops-hint {
  margin: 6px 0 0;
  font-size: 0.76rem;
  opacity: 0.62;
  color: var(--text-primary);
}

.job-tag {
  margin-left: 8px;
  color: #2ecc71;
  font-weight: 700;
}

.error-tip {
  margin: 0 0 12px;
  padding: 10px 14px;
  border-radius: 12px;
  background: rgba(255, 77, 79, 0.12);
  color: #ff8b8d;
  font-size: 0.85rem;
}

/* 指标 */
.metric-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
  margin-bottom: 14px;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 12px 8px;
  border-radius: 16px;
  background: var(--section-bg, var(--bg-secondary));
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.metric-value {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--text-primary);
}

.metric-label {
  font-size: 0.75rem;
  opacity: 0.65;
  color: var(--text-primary);
}

/* 卡片与两列布局 */
.grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(420px, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

.grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 14px;
  margin-bottom: 14px;
}

/* 活跃时段小切换 */
.hour-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 16px;
}

.hour-head .card-title.sub {
  margin-top: 0;
}

.seg.small button {
  padding: 4px 10px;
  font-size: 0.76rem;
}

/* 登录/注册趋势 */
.trend {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 120px;
}

.trend-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  min-width: 0;
}

.trend-bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 100%;
  width: 100%;
  justify-content: center;
}

.trend-bar {
  width: 6px;
  min-height: 2px;
  border-radius: 3px 3px 0 0;
}

.trend-bar.login {
  background: linear-gradient(180deg, #7ec8ff, #4a9ede);
}

.trend-bar.register {
  background: linear-gradient(180deg, #7ee0b8, #2ecc71);
}

.trend-label {
  margin-top: 4px;
  font-size: 0.56rem;
  opacity: 0.5;
  color: var(--text-primary);
  transform: rotate(-45deg);
  white-space: nowrap;
}

.legend {
  display: flex;
  gap: 14px;
  margin-top: 10px;
  font-size: 0.72rem;
  opacity: 0.7;
  color: var(--text-primary);
}

.legend .dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 4px;
}

.legend .dot.login {
  background: #7ec8ff;
}

.legend .dot.register {
  background: #2ecc71;
}

.card {
  padding: 16px;
  border-radius: 18px;
  background: var(--section-bg, var(--bg-secondary));
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.card-title {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.card-title.sub {
  margin-top: 16px;
  font-size: 0.9rem;
}

.card-sub {
  margin: 4px 0 12px;
  font-size: 0.76rem;
  opacity: 0.6;
  color: var(--text-primary);
}

/* 条形列表 */
.bar-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar-list.compact {
  gap: 8px;
}

.bar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-primary);
}

.bar-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.method {
  display: inline-block;
  margin-right: 6px;
  padding: 0 5px;
  border-radius: 6px;
  font-size: 0.7rem;
  font-style: normal;
  background: rgba(126, 200, 255, 0.18);
  color: #7ec8ff;
}

.bar-value {
  flex: 0 0 auto;
  opacity: 0.75;
  font-size: 0.75rem;
}

.bar-track {
  height: 8px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.18);
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #7ec8ff, #2ecc71);
  transition: width 0.3s ease;
}

.bar-fill.alt {
  background: linear-gradient(90deg, #ffd479, #ff9fb2);
}

.bar-fill.hero {
  background: linear-gradient(90deg, #c8a6ff, #7ec8ff);
}

.rank-bar-fill.like {
  background: linear-gradient(90deg, #ff9fb2, #ffd479);
}

/* 用户榜 */
.rank-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.84rem;
  color: var(--text-primary);
}

.rank-index {
  flex: 0 0 22px;
  text-align: center;
  font-size: 0.75rem;
  opacity: 0.7;
}

.rank-index.top {
  color: #ffd479;
  font-weight: 700;
  opacity: 1;
}

.rank-name {
  flex: 0 0 34%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.rank-bar {
  flex: 1;
  height: 8px;
  border-radius: 999px;
  background: rgba(128, 128, 128, 0.18);
  overflow: hidden;
}

.rank-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #c8a6ff, #7ec8ff);
}

.rank-count {
  flex: 0 0 46px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  opacity: 0.8;
}

/* 词云 */
.word-cloud {
  position: relative;
  width: 100%;
  overflow: hidden;
  border-radius: 14px;
  background: radial-gradient(circle at 50% 50%, rgba(126, 200, 255, 0.07), transparent 68%);
}

.cloud-word {
  position: absolute;
  white-space: nowrap;
  font-weight: 700;
  line-height: 1.2;
  cursor: default;
  opacity: 0.92;
  transition: transform 0.15s ease, filter 0.15s ease, opacity 0.15s ease;
}

.cloud-word:hover {
  transform: scale(1.14);
  filter: brightness(1.25);
  opacity: 1;
}

/* 活跃时段 */
.hour-chart {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 90px;
}

.hour-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
}

.hour-bar {
  width: 100%;
  min-height: 2px;
  border-radius: 4px 4px 0 0;
  background: linear-gradient(180deg, #7ec8ff, #2ecc71);
}

.hour-label {
  margin-top: 3px;
  font-size: 0.6rem;
  opacity: 0.55;
  color: var(--text-primary);
}

/* 作业表 */
.table-wrap {
  overflow-x: auto;
}

.job-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
  color: var(--text-primary);
}

.job-table th,
.job-table td {
  padding: 8px 10px;
  text-align: left;
  border-bottom: 1px solid var(--glass-border);
  white-space: nowrap;
}

.job-table th {
  font-weight: 600;
  opacity: 0.7;
}

.job-table .mono {
  font-family: ui-monospace, Consolas, monospace;
  font-size: 0.78rem;
}

.job-table .ok {
  color: #2ecc71;
  font-weight: 700;
}

.job-table .warn {
  color: #ffd479;
}

.empty-tip {
  margin: 8px 0 0;
  font-size: 0.82rem;
  opacity: 0.55;
  color: var(--text-primary);
}

@media (max-width: 640px) {
  .grid-2 {
    grid-template-columns: 1fr;
  }

  .rank-name {
    flex-basis: 40%;
  }
}
</style>
