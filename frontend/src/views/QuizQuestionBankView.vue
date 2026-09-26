<template>
  <div class="qb-page news-page">
    <Toast :message="toastMessage" :duration="3000" />

    <div class="content-area">
      <!-- 标题卡 -->
      <div class="qb-header">
        <button class="qb-home" title="返回刷题战" @click="goBack">🏠</button>
        <div class="qb-header-main">
          <h1 class="qb-title">题库编辑</h1>
          <p class="qb-subtitle">守望先锋刷题战 · 题目 / 资源 / 提交历史</p>
        </div>
        <div class="qb-header-actions">
          <button class="qb-btn" @click="startCreate">新建题目</button>
        </div>
      </div>

      <div class="qb-body">
        <!-- 左栏：题目列表 -->
        <section class="qb-list">
          <div class="qb-search">
            <input
              v-model="keyword"
              class="qb-input"
              placeholder="搜索题干 / 副标题"
              @keyup.enter="loadQuestions"
            >
            <button class="qb-btn small" @click="loadQuestions">搜索</button>
          </div>

          <div v-if="tagOptions.length" class="qb-tag-filter">
            <button
              v-for="tag in tagOptions"
              :key="tag.name"
              class="qb-chip"
              :class="{ active: filterTag === tag.name }"
              @click="toggleFilterTag(tag.name)"
            >
              {{ tag.name }}<span class="qb-chip-count">{{ tag.count }}</span>
            </button>
          </div>

          <p v-if="loading" class="qb-hint">题目加载中…</p>
          <p v-else-if="!questions.length" class="qb-hint">
            题库还是空的，点右上角「新建题目」先加一道吧
          </p>

          <button
            v-for="item in questions"
            :key="item.id"
            class="qb-item"
            :class="{ active: item.id === editingId }"
            @click="editQuestion(item.id)"
          >
            <span class="qb-item-title">{{ item.title }}</span>
            <span v-if="item.subtitle" class="qb-item-sub">{{ item.subtitle }}</span>
            <span class="qb-item-meta">
              难度 {{ toDisplayDifficulty(item.difficulty) }}/10 · 正确率 {{ (item.accuracy * 100).toFixed(1) }}% ·
              争议 {{ item.disputeCount }} · {{ item.answerSeconds || 10 }}s · v{{ item.version }}
              <template v-if="item.status === 'draft'"> · 草稿</template>
            </span>
            <span class="qb-item-editor">
              最后修改：{{ item.updatedByName || '未知' }} · {{ formatTime(item.updatedAt) }}
            </span>
            <span v-if="item.tags.length" class="qb-item-tags">
              <span v-for="tag in item.tags" :key="tag" class="qb-mini-tag">{{ tag }}</span>
            </span>
          </button>
        </section>
      </div>
    </div>

    <!-- 编辑弹窗：点击列表里的题目才弹出 -->
    <div v-if="editorOpen" class="qb-editor-mask" @click="closeEditor">
      <section class="qb-editor-dialog" @click.stop>
          <div class="qb-editor-head">
            <h2 class="qb-section-title">{{ editingId ? `编辑题目 #${editingId}` : '新建题目' }}</h2>
            <div class="qb-editor-head-actions">
              <button v-if="editingId" class="qb-btn small plain" @click="startCreate">清空表单</button>
              <button class="qb-btn small plain" @click="closeEditor">✕ 关闭</button>
            </div>
          </div>

          <label class="qb-field">
            <span class="qb-label">题干</span>
            <input v-model="form.title" class="qb-input" maxlength="255" placeholder="例如：这张地图是？">
          </label>

          <label class="qb-field">
            <span class="qb-label">副标题</span>
            <input v-model="form.subtitle" class="qb-input" maxlength="255" placeholder="可留空">
          </label>

          <!-- 题目资源：仅能插入一项（一张图片或一个视频） -->
          <div class="qb-field">
            <span class="qb-label">题目资源（仅一项：一张图片 / 一个视频）</span>
            <div class="qb-media-slot">
              <template v-if="resourceItem">
                <img
                  v-if="resourceItem.kind === 'images'"
                  class="qb-media-thumb"
                  :src="resourceItem.url"
                  :alt="resourceItem.url"
                  @click="previewImage(resourceItem.url)"
                >
                <video
                  v-else-if="resourceItem.kind === 'videos'"
                  class="qb-media-video"
                  :src="resourceItem.url"
                  controls
                  preload="metadata"
                ></video>
                <audio
                  v-else
                  class="qb-media-audio"
                  :src="resourceItem.url"
                  controls
                  preload="metadata"
                ></audio>
                <div class="qb-media-actions">
                  <button class="qb-btn small" @click="openFileLibrary('resource')">替换</button>
                  <button class="qb-btn small plain" @click="clearResource">删除</button>
                  <span class="qb-resource-url" :title="resourceItem.url">{{ shortUrl(resourceItem.url) }}</span>
                </div>
              </template>
              <button
                v-else
                class="qb-media-add"
                title="从文件库添加题目资源"
                @click="openFileLibrary('resource')"
              >＋</button>
            </div>
          </div>

          <div class="qb-field">
            <span class="qb-label">选项（点击左侧字母设正确答案）</span>
            <div v-for="(option, index) in form.options" :key="option.key" class="qb-option-row">
              <button
                class="qb-answer-pick"
                :class="{ active: form.answer === option.key }"
                :title="`设为正确答案 ${option.key}`"
                @click="form.answer = option.key"
              >{{ option.key }}</button>
              <input
                v-model="option.text"
                class="qb-input"
                :placeholder="`选项 ${option.key}`"
                maxlength="500"
              >
              <button
                class="qb-btn small plain"
                :disabled="form.options.length <= 2"
                @click="removeOption(index)"
              >删除</button>
            </div>
            <button
              class="qb-btn small"
              :disabled="form.options.length >= 8"
              @click="addOption"
            >+ 添加选项</button>
          </div>

          <label class="qb-field">
            <span class="qb-label">答案解析</span>
            <textarea
              v-model="form.explanationText"
              class="qb-textarea"
              rows="4"
              placeholder="解析文字（配图 / 音频用下方的素材栏添加，不会出现在文本里）"
            ></textarea>

            <!-- 解析配图：仅一张；有则显示缩略图 + 删除，没有则显示加号 -->
            <div class="qb-media-slot">
              <template v-if="explanationImage">
                <img
                  class="qb-media-thumb"
                  :src="explanationImage"
                  :alt="explanationImage"
                  @click="previewImage(explanationImage)"
                >
                <div class="qb-media-actions">
                  <button class="qb-btn small" @click="openFileLibrary('explanation')">替换</button>
                  <button class="qb-btn small plain" @click="removeExplanationImage">删除</button>
                  <span class="qb-resource-url" :title="explanationImage">{{ shortUrl(explanationImage) }}</span>
                </div>
              </template>
              <button
                v-else
                class="qb-media-add"
                title="从文件库添加解析配图"
                @click="openFileLibrary('explanation')"
              >＋</button>
            </div>

            <!-- 解析音频：仅一段，与配图可各放一份 -->
            <div class="qb-media-slot">
              <template v-if="explanationAudio">
                <audio class="qb-media-audio" :src="explanationAudio" controls preload="metadata"></audio>
                <div class="qb-media-actions">
                  <button class="qb-btn small" @click="openFileLibrary('explanation')">替换</button>
                  <button class="qb-btn small plain" @click="removeExplanationAudio">删除</button>
                  <span class="qb-resource-url" :title="explanationAudio">{{ shortUrl(explanationAudio) }}</span>
                </div>
              </template>
              <button
                v-else
                class="qb-media-add"
                title="从文件库添加解析音频（mp3 / wav）"
                @click="openFileLibrary('explanation')"
              >♪</button>
            </div>
          </label>

          <div class="qb-field">
            <span class="qb-label">标签（回车添加，如 守望先锋 / 群友 / 文学）</span>
            <div class="qb-tag-input-row">
              <input
                v-model="tagDraft"
                class="qb-input"
                placeholder="输入标签后回车"
                maxlength="20"
                @keyup.enter="addTag"
              >
              <button class="qb-btn small" @click="addTag">添加</button>
            </div>
            <div class="qb-tag-list">
              <span v-for="tag in form.tags" :key="tag" class="qb-chip active">
                {{ tag }}
                <button class="qb-chip-close" @click="removeTag(tag)">✕</button>
              </span>
              <button
                v-for="tag in suggestedTags"
                :key="`suggest-${tag.name}`"
                class="qb-chip"
                @click="quickAddTag(tag.name)"
              >+ {{ tag.name }}</button>
            </div>
          </div>

          <label class="qb-field">
            <span class="qb-label">难度 {{ form.difficulty }} / 10（数字越大越难）</span>
            <input v-model.number="form.difficulty" class="qb-range" type="range" min="0" max="10" step="1">
          </label>

          <label class="qb-field">
            <span class="qb-label">答题时长（秒，5~60，默认 10）</span>
            <input
              v-model.number="form.answerSeconds"
              class="qb-input small"
              type="number"
              min="5"
              max="60"
              step="1"
            >
          </label>

          <label class="qb-field row">
            <span class="qb-label">状态</span>
            <select v-model="form.status" class="qb-input small">
              <option value="published">入库（可被抽题）</option>
              <option value="draft">草稿</option>
            </select>
          </label>

          <!-- 提交历史 -->
          <div class="qb-field">
            <div class="qb-history-head">
              <span class="qb-label">提交历史{{ editingId ? `（共 ${revisions.length} 条）` : '' }}</span>
              <button v-if="editingId" class="qb-btn small" @click="loadRevisions">刷新</button>
            </div>
            <p v-if="!editingId" class="qb-hint small">新建题目在提交后才会生成历史记录</p>
            <p v-else-if="!revisions.length" class="qb-hint small">暂无历史</p>
            <div v-else class="qb-history-list">
              <button
                v-for="revision in revisions"
                :key="revision.id"
                class="qb-history-item"
                @click="openRevision(revision)"
              >
                <span class="qb-history-version">v{{ revision.version }}</span>
                <span class="qb-history-summary">{{ revision.summary || (revision.action === 'create' ? '创建题目' : '提交修改') }}</span>
                <span class="qb-history-meta">
                  {{ revision.createdByName || '未知' }} · {{ formatTime(revision.createdAt) }}
                </span>
              </button>
            </div>
          </div>

          <!-- 争议 / 统计 -->
          <div v-if="editingId && current" class="qb-stats">
            <span>作答 {{ current.answerCount }} 次 · 答对 {{ current.correctCount }} 次 · 正确率 {{ (current.accuracy * 100).toFixed(1) }}%</span>
            <span>争议计数 {{ current.disputeCount }}</span>
            <button class="qb-btn small" @click="markDispute">标记该题有争议</button>
            <button v-if="isAdmin" class="qb-btn small" @click="resetDispute">争议清零（管理员）</button>
          </div>

          <div class="qb-editor-footer">
            <button class="qb-btn" @click="closeEditor">取消</button>
            <button class="qb-btn primary" :disabled="saving" @click="submitQuestion">
              {{ saving ? '提交中…' : editingId ? '提交修改' : '提交新题' }}
            </button>
          </div>
      </section>
    </div>

    <!-- 文件库：选中的文件作为题目资源 / 解析配图 -->
    <FileLibrary
      v-if="showFileLibrary"
      mode="select"
      @close="showFileLibrary = false"
      @select="onFilePicked"
    />

    <!-- 图片预览 -->
    <ImageViewer
      :visible="showImageViewer"
      :src="previewImageSrc"
      @update:visible="showImageViewer = $event"
      @close="showImageViewer = false"
    />

    <!-- 历史快照 -->
    <div v-if="revisionPreview" class="qb-mask" @click="revisionPreview = null">
      <div class="qb-dialog" @click.stop>
        <h3 class="qb-dialog-title">v{{ revisionPreview.version }} · {{ revisionPreview.summary || '提交' }}</h3>
        <p class="qb-dialog-meta">
          {{ revisionPreview.createdByName || '未知' }} · {{ formatTime(revisionPreview.createdAt) }}
        </p>
        <div class="qb-dialog-body">
          <p><b>题干：</b>{{ revisionSnapshot.title }}</p>
          <p v-if="revisionSnapshot.subtitle"><b>副标题：</b>{{ revisionSnapshot.subtitle }}</p>
          <p><b>选项：</b>{{ revisionOptionText }}</p>
          <p><b>答案：</b>{{ revisionSnapshot.answer }}</p>
          <p v-if="revisionExplanationText"><b>解析：</b>{{ revisionExplanationText }}</p>
          <audio
            v-if="revisionExplanationAudio"
            class="qb-media-audio"
            :src="revisionExplanationAudio"
            controls
            preload="metadata"
          ></audio>
          <p><b>标签：</b>{{ (revisionSnapshot.tags ?? []).join('、') || '无' }}</p>
          <p><b>难度：</b>{{ revisionSnapshot.difficulty === undefined ? '-' : `${toDisplayDifficulty(Number(revisionSnapshot.difficulty))}/10` }}</p>
          <p v-if="revisionImages.length" class="qb-dialog-images">
            <img
              v-for="url in revisionImages"
              :key="url"
              :src="url"
              class="qb-dialog-image"
              @click="previewImage(url)"
            >
          </p>
        </div>
        <button class="qb-btn" @click="revisionPreview = null">关闭</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import Toast from '@/components/Toast.vue'
import FileLibrary from '@/components/FileLibrary.vue'
import ImageViewer from '@/components/ImageViewer.vue'
import { authFetch } from '@/utils/request'

interface QuizOption {
  key: string
  text: string
}

interface QuizResources {
  images: string[]
  videos: string[]
  audios: string[]
}

interface QuizQuestion {
  id: number
  title: string
  subtitle: string
  options: QuizOption[]
  answer: string
  explanation: string
  resources: QuizResources
  tags: string[]
  difficulty: number
  answerSeconds: number
  disputeCount: number
  answerCount: number
  correctCount: number
  accuracy: number
  status: 'published' | 'draft'
  version: number
  updatedByName?: string
  updatedAt: number
}

interface QuizRevision {
  id: number
  questionId: number
  version: number
  action: 'create' | 'update'
  snapshot: Record<string, any>
  summary: string
  createdByName: string
  createdAt: number
}

interface FileItem {
  id: number
  name: string
  type: string
  url: string
  ext?: string
  mime?: string
}

const router = useRouter()
const toastMessage = ref('')

const loading = ref(false)
const saving = ref(false)
const questions = ref<QuizQuestion[]>([])
const tagOptions = ref<{ name: string; count: number }[]>([])
const keyword = ref('')
const filterTag = ref('')

const editingId = ref<number | null>(null)
const current = ref<QuizQuestion | null>(null)
const revisions = ref<QuizRevision[]>([])
const revisionPreview = ref<QuizRevision | null>(null)
// 编辑框是弹窗：只有点击列表里的题目（或「新建题目」）才弹出
const editorOpen = ref(false)
// 答案解析里已插入的那张图（仅允许一张，再选会替换）
const explanationImage = ref('')
// 答案解析里已插入的那段音频（仅允许一段，与配图互不冲突，可各放一份）
const explanationAudio = ref('')

// 当前登录用户的角色（从 JWT 里读，用于「争议清零」这类管理员操作）
const isAdmin = computed(() => {
  try {
    const token = localStorage.getItem('authToken') ?? ''
    const payload = token.split('.')[1]
    if (!payload) return false
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4)
    const json = JSON.parse(atob(padded))
    return json?.role === 'ADMIN' || json?.role === 'MODERATOR'
  } catch {
    return false
  }
})

const showFileLibrary = ref(false)
// 文件库这次选择要放到哪里：解析配图 / 题目资源
const fileTarget = ref<'explanation' | 'resource'>('resource')

const showImageViewer = ref(false)
const previewImageSrc = ref('')

const tagDraft = ref('')

function emptyForm() {
  return {
    title: '',
    subtitle: '',
    options: [
      { key: 'A', text: '' },
      { key: 'B', text: '' },
      { key: 'C', text: '' },
      { key: 'D', text: '' }
    ] as QuizOption[],
    answer: 'A',
    // 解析文本里不掺图片 markdown：图片单独放在 explanationImage 里，只在下方的图片栏显示
    explanationText: '',
    resources: { images: [], videos: [], audios: [] } as QuizResources,
    tags: [] as string[],
    // 难度在界面上统一按 0~10 显示与修改，提交时再换算成 0~255
    difficulty: 5,
    // 该题答题时长（秒），默认 10
    answerSeconds: 10,
    status: 'published' as 'published' | 'draft'
  }
}

const form = reactive(emptyForm())

function showToast(message: string) {
  toastMessage.value = message
  setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

function goBack() {
  router.push('/QuizBattle')
}

function formatTime(ts: number): string {
  const date = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/* 难度在界面上统一按 0~10 显示与修改（数据库里仍是 0~255，这里做换算） */
function toDisplayDifficulty(raw: number): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(10, Math.round((value / 255) * 10)))
}

function toRawDifficulty(display: number): number {
  const value = Number(display)
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(255, Math.round((value / 10) * 255)))
}

/* 解析文本与配图 / 解析音频分开：文本里不出现这些标记 */
const IMAGE_MARKDOWN_RE = /!\[[^\]]*\]\(([^)]+)\)/g
// 解析音频用 [音频](url) 标记，与图片 markdown 区分开（没有前导感叹号）
const AUDIO_MARKDOWN_RE = /\[音频\]\(([^)]+)\)/g

function splitExplanation(raw: string): { text: string; image: string; audio: string } {
  const source = raw ?? ''
  const matched = /!\[[^\]]*\]\(([^)]+)\)/.exec(source)
  const audioMatched = AUDIO_MARKDOWN_RE.exec(source)
  const text = source
    .replace(IMAGE_MARKDOWN_RE, '')
    .replace(AUDIO_MARKDOWN_RE, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return { text, image: matched ? matched[1] : '', audio: audioMatched ? audioMatched[1] : '' }
}

function composeExplanation(text: string, image: string, audio: string): string {
  const clean = (text ?? '').trim()
  const parts: string[] = []
  if (clean) parts.push(clean)
  if (image) parts.push(`![解析配图](${image})`)
  if (audio) parts.push(`[音频](${audio})`)
  return parts.join('\n')
}

function shortUrl(url: string): string {
  const name = decodeURIComponent(url.split('/').pop() ?? url)
  return name.length > 28 ? `${name.slice(0, 26)}…` : name
}

const suggestedTags = computed(() =>
  tagOptions.value.filter((tag) => !form.tags.includes(tag.name)).slice(0, 12)
)

const revisionSnapshot = computed<Record<string, any>>(() => revisionPreview.value?.snapshot ?? {})
const revisionOptionText = computed(() =>
  ((revisionSnapshot.value.options ?? []) as QuizOption[])
    .map((option) => `${option.key}. ${option.text}`)
    .join(' / ')
)
const revisionImages = computed(() => {
  const resources = revisionSnapshot.value.resources as QuizResources | undefined
  return resources?.images ?? []
})

// 历史快照里的解析：把图片 markdown 与 [音频](url) 标记摘出去，分别渲染
const revisionExplanation = computed(() => splitExplanation(revisionSnapshot.value.explanation ?? ''))
const revisionExplanationText = computed(() => revisionExplanation.value.text)
const revisionExplanationAudio = computed(() => revisionExplanation.value.audio)

// 当前题目资源（三选一，取唯一一项）
const resourceItem = computed<{ kind: keyof QuizResources; url: string } | null>(() => {
  for (const kind of ['images', 'videos', 'audios'] as (keyof QuizResources)[]) {
    const url = form.resources[kind][0]
    if (url) return { kind, url }
  }
  return null
})

/* =========================
   数据加载
========================= */
async function loadQuestions() {
  loading.value = true
  try {
    const params = new URLSearchParams()
    if (keyword.value.trim()) params.set('q', keyword.value.trim())
    if (filterTag.value) params.set('tag', filterTag.value)

    const res = await authFetch(`/api/quiz/questions?${params.toString()}`)
    if (!res.ok) throw new Error('加载失败')
    const data = await res.json()
    questions.value = data.questions ?? []
  } catch (error) {
    console.error(error)
    showToast('题目加载失败')
  } finally {
    loading.value = false
  }
}

async function loadTags() {
  try {
    const res = await authFetch('/api/quiz/tags')
    if (!res.ok) return
    const data = await res.json()
    tagOptions.value = data.tags ?? []
  } catch (error) {
    console.error(error)
  }
}

async function loadRevisions() {
  if (!editingId.value) {
    revisions.value = []
    return
  }
  try {
    const res = await authFetch(`/api/quiz/questions/${editingId.value}/revisions`)
    if (!res.ok) throw new Error('历史加载失败')
    const data = await res.json()
    revisions.value = data.revisions ?? []
  } catch (error) {
    console.error(error)
  }
}

onMounted(() => {
  void loadQuestions()
  void loadTags()
})

/* =========================
   题目列表交互
========================= */
function toggleFilterTag(name: string) {
  filterTag.value = filterTag.value === name ? '' : name
  void loadQuestions()
}

function fillForm(question: QuizQuestion) {
  form.title = question.title
  form.subtitle = question.subtitle
  form.options = question.options.length
    ? question.options.map((option, index) => ({
        key: String.fromCharCode(65 + index),
        text: option.text
      }))
    : emptyForm().options
  form.answer = question.answer || form.options[0].key
  const explanation = splitExplanation(question.explanation)
  form.explanationText = explanation.text
  explanationImage.value = explanation.image
  explanationAudio.value = explanation.audio
  form.resources = {
    // 兼容历史数据：只取每类的第一项（现在界面上仅支持一项资源）
    images: question.resources?.images?.slice(0, 1) ?? [],
    videos: question.resources?.videos?.slice(0, 1) ?? [],
    audios: question.resources?.audios?.slice(0, 1) ?? []
  }
  form.tags = [...question.tags]
  form.difficulty = toDisplayDifficulty(question.difficulty)
  // 没有该字段（历史数据）时按 10s
  form.answerSeconds = question.answerSeconds && question.answerSeconds > 0 ? question.answerSeconds : 10
  form.status = question.status
}

async function editQuestion(id: number) {
  try {
    const res = await authFetch(`/api/quiz/questions/${id}`)
    if (!res.ok) throw new Error('读取题目失败')
    const data = await res.json()
    current.value = data.question
    if (data.question) fillForm(data.question)
    revisions.value = data.revisions ?? []
    editingId.value = id
    editorOpen.value = true
  } catch (error) {
    console.error(error)
    showToast('读取题目失败')
  }
}

function startCreate() {
  Object.assign(form, emptyForm())
  editingId.value = null
  current.value = null
  revisions.value = []
  explanationImage.value = ''
  explanationAudio.value = ''
  editorOpen.value = true
}

function closeEditor() {
  editorOpen.value = false
}

/* =========================
   选项 / 标签
========================= */
function addOption() {
  if (form.options.length >= 8) return
  form.options.push({ key: String.fromCharCode(65 + form.options.length), text: '' })
}

function removeOption(index: number) {
  if (form.options.length <= 2) return
  form.options.splice(index, 1)
  form.options.forEach((option, i) => {
    option.key = String.fromCharCode(65 + i)
  })
  if (!form.options.some((option) => option.key === form.answer)) form.answer = form.options[0].key
}

function addTag() {
  const tag = tagDraft.value.trim()
  if (!tag) return
  if (form.tags.includes(tag)) {
    tagDraft.value = ''
    return
  }
  if (form.tags.length >= 12) {
    showToast('标签最多 12 个')
    return
  }
  form.tags.push(tag)
  tagDraft.value = ''
}

function quickAddTag(tag: string) {
  if (form.tags.includes(tag)) return
  form.tags.push(tag)
}

function removeTag(tag: string) {
  form.tags = form.tags.filter((item) => item !== tag)
}

/* =========================
   文件库 / 图片预览
========================= */
function openFileLibrary(target: 'explanation' | 'resource') {
  fileTarget.value = target
  showFileLibrary.value = true
}

function onFilePicked(payload: FileItem | FileItem[]) {
  const files = Array.isArray(payload) ? payload : [payload]
  showFileLibrary.value = false

  for (const file of files) {
    if (!file?.url) continue
    // 文件库返回的是 md5 命名的稳定链接，直接作为题目资源索引保存
    if (fileTarget.value === 'explanation') {
      // 解析素材：图片进配图栏、音频进音频栏，两者各留一份
      const looksAudio = file.type === 'audio'
        || String(file.mime ?? '').startsWith('audio/')
        || /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|wma|amr)$/i.test(file.ext ?? '')
      if (looksAudio) {
        setExplanationAudio(file.url)
      } else {
        setExplanationImage(file.url, file.name)
      }
      continue
    }

    // 题目资源总共只保留一项：图片 → images，视频 → videos，其它（音频等）→ audios
    setSingleResource(file.url, file.type)
  }
}

function resourceBucketOf(fileType: string): keyof QuizResources {
  if (fileType === 'image') return 'images'
  if (fileType === 'video') return 'videos'
  return 'audios'
}

// 题目资源只保留一项：先清空三类，再放进对应类型
function setSingleResource(url: string, fileType: string) {
  form.resources = { images: [], videos: [], audios: [] }
  form.resources[resourceBucketOf(fileType)] = [url]
}

function clearResource() {
  form.resources = { images: [], videos: [], audios: [] }
}

// 解析配图只保留一张：只改图片栏状态，不往解析文本里塞 markdown
function setExplanationImage(url: string, _name: string) {
  explanationImage.value = url
}

function removeExplanationImage() {
  explanationImage.value = ''
}

// 解析音频同样只保留一段：再选会替换
function setExplanationAudio(url: string) {
  explanationAudio.value = url
}

function removeExplanationAudio() {
  explanationAudio.value = ''
}

function previewImage(url: string) {
  previewImageSrc.value = url
  showImageViewer.value = true
}

/* =========================
   提交 / 历史 / 争议
========================= */
async function submitQuestion() {
  if (!form.title.trim()) {
    showToast('题干不能为空')
    return
  }
  const options = form.options.filter((option) => option.text.trim())
  if (options.length < 2) {
    showToast('至少填写两个选项')
    return
  }
  if (!options.some((option) => option.key === form.answer)) {
    showToast('请选择正确答案')
    return
  }

  saving.value = true
  try {
    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim(),
      options: options.map((option) => ({ key: option.key, text: option.text.trim() })),
      answer: form.answer,
      explanation: composeExplanation(form.explanationText, explanationImage.value, explanationAudio.value),
      resources: form.resources,
      tags: form.tags,
      difficulty: toRawDifficulty(form.difficulty),
      answerSeconds: Math.max(5, Math.min(60, Number(form.answerSeconds) || 10)),
      status: form.status
    }

    const url = editingId.value ? `/api/quiz/questions/${editingId.value}` : '/api/quiz/questions'
    const res = await authFetch(url, {
      method: editingId.value ? 'PUT' : 'POST',
      body: JSON.stringify(body)
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? '提交失败')

    showToast(editingId.value ? `已提交修改（v${data.question?.version ?? ''}）` : '题目已提交')
    if (data.question) {
      current.value = data.question
      editingId.value = data.question.id
      fillForm(data.question)
    }

    await Promise.all([loadQuestions(), loadTags(), loadRevisions()])
    // 提交成功后自动关闭弹窗
    closeEditor()
  } catch (error: any) {
    console.error(error)
    showToast(error?.message ?? '提交失败')
  } finally {
    saving.value = false
  }
}

function openRevision(revision: QuizRevision) {
  revisionPreview.value = revision
}

async function markDispute() {
  if (!editingId.value) return
  try {
    const res = await authFetch(`/api/quiz/questions/${editingId.value}/dispute`, {
      method: 'POST',
      body: JSON.stringify({})
    })
    if (!res.ok) throw new Error('标记失败')
    const data = await res.json()
    if (current.value) current.value.disputeCount = data.disputeCount
    showToast(`已记录争议（当前 ${data.disputeCount}）`)
    await loadQuestions()
  } catch (error) {
    console.error(error)
    showToast('标记失败')
  }
}

// 管理员：把争议计数清零
async function resetDispute() {
  if (!editingId.value || !isAdmin.value) return
  try {
    const res = await authFetch(`/api/quiz/questions/${editingId.value}/dispute`, { method: 'DELETE' })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.error ?? '清零失败')

    if (current.value) current.value.disputeCount = 0
    showToast('争议计数已清零')
    await loadQuestions()
  } catch (error: any) {
    console.error(error)
    showToast(error?.message ?? '清零失败')
  }
}
</script>

<style scoped>
.qb-page {
  min-height: 100vh;
  padding-bottom: 24px;
}

.qb-page .content-area {
  max-width: 1200px;
  padding-top: 0;
}

/* 标题卡 */
.qb-header {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  border-radius: 24px;
  background: var(--card-bg);
  box-shadow: var(--shadow);
  margin-bottom: 16px;
}

.qb-home {
  flex: 0 0 auto;
  width: 42px;
  height: 42px;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  font-size: 20px;
  cursor: pointer;
  transition: 0.15s ease;
}

.qb-home:hover {
  transform: translateY(-2px);
}

.qb-header-main {
  flex: 1;
  min-width: 0;
}

.qb-title {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text-primary);
}

.qb-subtitle {
  margin: 4px 0 0;
  font-size: 0.85rem;
  opacity: 0.7;
  color: var(--text-primary);
}

.qb-header-actions {
  display: flex;
  gap: 10px;
}

/* 通用控件 */
.qb-btn {
  flex: 0 0 auto;
  padding: 9px 16px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.15s ease;
}

.qb-btn:hover {
  filter: brightness(1.05);
}

.qb-btn.primary {
  background: linear-gradient(135deg, #2c3e66, #1f2c4b);
  color: #fff;
}

.qb-btn.small {
  padding: 6px 10px;
  font-size: 0.78rem;
  border-radius: 10px;
}

.qb-btn.plain {
  background: transparent;
  box-shadow: none;
  opacity: 0.75;
}

.qb-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.qb-input,
.qb-textarea {
  width: 100%;
  box-sizing: border-box;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--glass-border);
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.88rem;
  font-family: inherit;
}

.qb-input.small {
  width: auto;
  padding: 6px 10px;
  font-size: 0.8rem;
}

.qb-textarea {
  resize: vertical;
  line-height: 1.5;
}

.qb-range {
  width: 100%;
  accent-color: #2ecc71;
  cursor: pointer;
}

/* 主体：左列表 + 右编辑 */
.qb-body {
  /* 编辑框改成弹窗后，主体只剩题目列表 */
  display: block;
}

.qb-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 20px;
  background: var(--section-bg);
  box-shadow: inset 0 0 0 1px var(--glass-border);
  max-height: calc(100vh - 160px);
  overflow-y: auto;
}

.qb-search {
  display: flex;
  gap: 8px;
}

.qb-tag-filter {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qb-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: none;
  border-radius: 999px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.75rem;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.qb-chip.active {
  background: #2c3e66;
  color: #fff;
}

.qb-chip-count {
  opacity: 0.7;
  font-size: 0.7rem;
}

.qb-chip-close {
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0 0 0 2px;
}

.qb-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  padding: 10px 12px;
  border: none;
  border-radius: 14px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.15s ease;
}

.qb-item:hover {
  transform: translateY(-1px);
}

.qb-item.active {
  box-shadow: inset 0 0 0 2px #2ecc71;
}

.qb-item-title {
  font-size: 0.9rem;
  font-weight: 700;
}

.qb-item-sub,
.qb-item-meta {
  font-size: 0.74rem;
  opacity: 0.72;
}

.qb-item-editor {
  font-size: 0.72rem;
  opacity: 0.62;
}

.qb-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.qb-mini-tag {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(46, 204, 113, 0.18);
  font-size: 0.68rem;
}

.qb-hint {
  text-align: center;
  font-size: 0.82rem;
  opacity: 0.65;
  color: var(--text-primary);
  padding: 8px 0;
}

.qb-hint.small {
  font-size: 0.75rem;
  padding: 4px 0;
}

/* 编辑弹窗 */
.qb-editor-mask {
  position: fixed;
  inset: 0;
  z-index: 3300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.qb-editor-dialog {
  width: min(820px, 94vw);
  /* 弹窗上下各留 30px 空隙 */
  margin: 30px 0;
  max-height: calc(100vh - 60px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  border-radius: 20px;
  background: var(--bg-primary);
  box-shadow: 0 20px 52px rgba(0, 0, 0, 0.4), inset 0 0 0 1px var(--glass-border);
}

.qb-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.qb-editor-head-actions {
  display: flex;
  gap: 8px;
}

.qb-editor-footer {
  position: sticky;
  bottom: -18px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin: 4px -18px -18px;
  padding: 12px 18px;
  background: var(--bg-primary);
  border-top: 1px solid var(--glass-border);
}

.qb-section-title {
  margin: 0;
  font-size: 1rem;
  color: var(--text-primary);
}

.qb-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.qb-field.row {
  flex-direction: row;
  align-items: center;
  gap: 12px;
}

.qb-label {
  font-size: 0.8rem;
  opacity: 0.8;
  color: var(--text-primary);
}

.qb-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qb-answer-pick {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border: none;
  border-radius: 50%;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.qb-answer-pick.active {
  background: #2ecc71;
  color: #06281a;
}

/* 资源 / 解析配图：只有一个位置，有内容显示缩略图 + 删除，没有显示加号 */
.qb-media-slot {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px;
  border-radius: 14px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.qb-media-thumb {
  width: 88px;
  height: 66px;
  border-radius: 10px;
  object-fit: cover;
  background: var(--bg-primary);
  cursor: zoom-in;
}

.qb-media-video {
  width: 200px;
  max-height: 130px;
  border-radius: 10px;
  background: #000;
}

.qb-media-audio {
  width: 220px;
  max-width: 100%;
}

.qb-media-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.qb-media-add {
  width: 88px;
  height: 66px;
  border: 1px dashed var(--input-border, rgba(0, 0, 0, 0.2));
  border-radius: 10px;
  background: transparent;
  color: var(--text-primary);
  font-size: 26px;
  line-height: 1;
  font-family: inherit;
  opacity: 0.75;
  cursor: pointer;
  transition: 0.15s ease;
}

.qb-media-add:hover {
  opacity: 1;
  transform: translateY(-1px);
  background: var(--bg-primary);
}

.qb-resource-url {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  opacity: 0.8;
}

.qb-tag-input-row {
  display: flex;
  gap: 8px;
}

.qb-tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.qb-history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.qb-history-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 220px;
  overflow-y: auto;
}

.qb-history-item {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.78rem;
  text-align: left;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.qb-history-version {
  font-weight: 700;
}

.qb-history-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qb-history-meta {
  opacity: 0.7;
  font-size: 0.72rem;
}

.qb-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  font-size: 0.78rem;
  color: var(--text-primary);
  opacity: 0.85;
}

/* 历史快照弹窗 */
.qb-mask {
  position: fixed;
  inset: 0;
  z-index: 3400;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
}

.qb-dialog {
  width: min(560px, 92vw);
  max-height: 82vh;
  overflow-y: auto;
  padding: 18px;
  border-radius: 20px;
  background: var(--bg-primary);
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border);
}

.qb-dialog-title {
  margin: 0 0 4px;
  font-size: 1rem;
  color: var(--text-primary);
}

.qb-dialog-meta {
  margin: 0 0 12px;
  font-size: 0.76rem;
  opacity: 0.7;
  color: var(--text-primary);
}

.qb-dialog-body {
  font-size: 0.85rem;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
}

.qb-dialog-body p {
  margin: 0 0 6px;
}

.qb-dialog-images {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.qb-dialog-image {
  width: 120px;
  height: 90px;
  border-radius: 10px;
  object-fit: cover;
  cursor: zoom-in;
}

@media (max-width: 900px) {
  .qb-list {
    max-height: none;
  }

  .qb-editor-mask {
    padding: 12px;
  }

  .qb-editor-dialog {
    max-height: 94vh;
  }
}
</style>
