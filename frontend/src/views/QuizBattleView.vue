<template>
  <div class="undercover-page news-page">
    <ThemeToggle />
    <Toast :message="toastMessage" :duration="3000" />

    <div class="content-area">
      <!-- 游戏标题卡片 -->
      <div class="undercover-header">
        <div class="header-top">
          <button class="home-btn" title="返回游戏页" @click="goGame">🏠</button>
          <h1 class="undercover-title">守望先锋刷题战</h1>
          <span class="header-spacer"></span>
        </div>
        <div class="header-icon">📝</div>
        <p class="undercover-subtitle">组队抢答，比谁的守望知识更硬</p>
        <button class="edit-bank-btn" @click="goQuestionBank">编辑题库</button>
        <button class="create-room-btn" @click="createRoom">创建房间+</button>
      </div>

      <!-- 房间列表 -->
      <div class="section room-section">
        <h2 class="section-title">房间列表</h2>

        <div v-if="roomsLoading" class="list-tip">房间加载中...</div>
        <div v-else-if="!rooms.length" class="list-tip">
          暂无房间，点击右上角「创建房间+」开一局
        </div>
        <div v-else class="room-list">
          <div
            v-for="room in rooms"
            :key="room.id"
            class="room-card"
            @click="onRoomClick(room)"
          >
            <div class="room-card-top">
              <span class="room-no">{{ room.roomNo }}</span>
              <span class="room-status" :class="room.status.toLowerCase()">
                {{ statusText(room.status) }}
              </span>
            </div>
            <div class="room-name">{{ room.name }}</div>
            <div class="room-card-bottom">
              <span class="room-owner">{{ room.ownerBattletag }}</span>
              <span class="room-count">{{ room.playerCount }}/{{ room.maxPlayers }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 当前在线玩家 -->
      <div class="section online-section">
        <div class="online-header">
          <span class="online-count">在线: {{ onlineCount }}</span>
          <span class="online-refresh" title="刷新" @click="refreshOnline">⟳</span>
        </div>

        <div v-if="!onlinePlayers.length" class="list-tip">当前没有玩家在线</div>
        <div v-else class="online-list">
          <div v-for="player in onlinePlayers" :key="player.userId" class="player-card">
            <div class="player-avatar-wrapper">
              <img
                class="player-avatar"
                :src="player.avatar"
                :alt="player.battletag"
                @error="onAvatarError"
              >
              <span v-if="player.background" class="player-bg-tag">后台断线</span>
            </div>
            <div class="player-name">{{ player.battletag }}</div>
          </div>
        </div>
      </div>
    </div>

    <FooterBar />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, onDeactivated, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import ThemeToggle from '@/components/ThemeToggle.vue'
import Toast from '@/components/Toast.vue'
import FooterBar from '@/components/FooterBar.vue'
import { authFetch } from '@/utils/request'

interface Room {
  id: number
  roomNo: string
  name: string
  ownerBattletag: string
  playerCount: number
  maxPlayers: number
  status: string
}

interface OnlinePlayer {
  userId: number
  battletag: string
  background: boolean
  avatar: string
}

const router = useRouter()

/* =========================
   Toast
========================= */
const toastMessage = ref('')

function showToast(message: string) {
  toastMessage.value = message
  setTimeout(() => {
    toastMessage.value = ''
  }, 3000)
}

/* =========================
   页面状态
========================= */
const rooms = ref<Room[]>([])
const roomsLoading = ref(true)

const onlineCount = ref(0)
const onlinePlayers = ref<OnlinePlayer[]>([])

/* =========================
   心跳（2 秒一次）
========================= */
const HEARTBEAT_MS = 2000
let heartbeatTimer: number | null = null

// 后台判定：页面隐藏、窗口失焦，或定时器被浏览器节流，都视为后台
let isBackground = false
let lastTickAt = Date.now()

async function sendHeartbeat(background: boolean) {
  try {
    const res = await authFetch('/api/undercover/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ background })
    })
    if (!res.ok) return

    const data = await res.json()
    onlineCount.value = data.online ?? 0
    onlinePlayers.value = data.players ?? []
  } catch (err) {
    // 心跳失败不打断页面，等待下一次心跳自动恢复
    console.error('心跳发送失败', err)
  }
}

function startHeartbeat() {
  stopHeartbeat()
  isBackground = judgeBackground()
  lastTickAt = Date.now()
  sendHeartbeat(isBackground)
  heartbeatTimer = window.setInterval(tickHeartbeat, HEARTBEAT_MS)
}

function stopHeartbeat() {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer)
    heartbeatTimer = null
  }
}

// 是否处于后台：页面隐藏，或窗口失去焦点（只切窗口不切标签页时 visibilityState 仍是 visible）
function judgeBackground(): boolean {
  return document.visibilityState === 'hidden' || !document.hasFocus()
}

// 每次上报都带上当前的前后台状态；定时器被节流（实际间隔远超 2 秒）时同样按后台处理
function tickHeartbeat() {
  const now = Date.now()
  const throttled = now - lastTickAt > HEARTBEAT_MS * 2
  lastTickAt = now

  isBackground = judgeBackground() || throttled
  sendHeartbeat(isBackground)
}

// 可见性 / 焦点变化时立即补报一次，让服务端马上拿到正确的后台标记
function handleStateChange() {
  lastTickAt = Date.now()
  isBackground = judgeBackground()
  sendHeartbeat(isBackground)

  // 回到前台时顺带刷新房间列表
  if (!isBackground) loadRooms()
}

function refreshOnline() {
  sendHeartbeat(isBackground)
}

/* =========================
   房间
========================= */
async function loadRooms() {
  try {
    const res = await authFetch('/api/undercover/rooms?mode=quiz')
    if (!res.ok) throw new Error('获取房间列表失败')

    const data = await res.json()
    rooms.value = data.rooms ?? []
  } catch (err) {
    console.error(err)
    showToast('获取房间列表失败')
  } finally {
    roomsLoading.value = false
  }
}

/* =========================
   房间列表：与在线心跳同节奏，每 2 秒刷新一次
========================= */
const ROOM_LIST_REFRESH_MS = 2000
let roomsTimer: number | null = null
let roomsRefreshing = false

async function refreshRooms() {
  if (roomsRefreshing) return
  roomsRefreshing = true

  try {
    const res = await authFetch('/api/undercover/rooms?mode=quiz')
    if (!res.ok) return

    const data = await res.json()
    rooms.value = data.rooms ?? []
  } catch (err) {
    // 后台刷新失败不打扰用户，等下一次自动恢复
    console.error('刷新房间列表失败', err)
  } finally {
    roomsRefreshing = false
  }
}

function startRoomsRefresh() {
  stopRoomsRefresh()
  void refreshRooms()
  roomsTimer = window.setInterval(() => void refreshRooms(), ROOM_LIST_REFRESH_MS)
}

function stopRoomsRefresh() {
  if (roomsTimer !== null) {
    clearInterval(roomsTimer)
    roomsTimer = null
  }
}

async function createRoom() {
  try {
    const res = await authFetch('/api/undercover/rooms', {
      method: 'POST',
      body: JSON.stringify({ mode: 'quiz' })
    })
    if (!res.ok) throw new Error('创建房间失败')

    const data = await res.json()
    const roomNo = String(data.room?.roomNo ?? '')

    // 已经是某个房间的房主：直接跳回已有房间并提示
    if (data.existed) {
      showToast(`你已在房间 ${roomNo} 中，正在进入`)
    } else {
      showToast(`房间创建成功：${roomNo}`)
    }

    await loadRooms()

    // 稍作停留让提示可见，然后房主进入房间
    setTimeout(() => {
      router.push(`/QuizBattle/room/${roomNo}`)
    }, 900)
  } catch (err) {
    console.error(err)
    showToast('创建房间失败')
  }
}

// 房间详情与加入功能暂未实现
// 所有人都可以点击房间卡片进入房间（默认进观战席）
function onRoomClick(room: Room) {
  router.push(`/QuizBattle/room/${room.roomNo}`)
}

function statusText(status: string) {
  if (status === 'PLAYING') return '游戏中'
  if (status === 'FINISHED') return '已结束'
  return '等待中'
}

/* =========================
   其他
========================= */
function goGame() {
  router.push('/Game')
}

// 题库编辑页
function goQuestionBank() {
  router.push('/QuizBattle/questions')
}

function onAvatarError(e: Event) {
  const img = e.target as HTMLImageElement
  img.src = '/res/imge/default-avatar.png'
  img.onerror = null
}

/* =========================
   生命周期
========================= */
// 进入本页（含路由缓存后再回来）：开始心跳
let pageActive = false

function activatePage() {
  if (pageActive) return
  pageActive = true

  loadRooms()
  document.addEventListener('visibilitychange', handleStateChange)
  window.addEventListener('focus', handleStateChange)
  window.addEventListener('blur', handleStateChange)
  startHeartbeat()
  startRoomsRefresh()
}

// 离开本页：立刻停止心跳并下线，保证心跳只在「谁是守望先锋卧底」页发送
function deactivatePage() {
  if (!pageActive) return
  pageActive = false

  document.removeEventListener('visibilitychange', handleStateChange)
  window.removeEventListener('focus', handleStateChange)
  window.removeEventListener('blur', handleStateChange)
  stopHeartbeat()
  stopRoomsRefresh()

  // keepalive 保证切页/关页时请求也能发出
  authFetch('/api/undercover/leave', { method: 'POST', keepalive: true }).catch(() => {})
}

// 路由被 keep-alive 缓存，切走时只会 deactivated 不会 unmounted，因此两套钩子都要挂
onMounted(activatePage)
onActivated(activatePage)
onDeactivated(deactivatePage)
onUnmounted(deactivatePage)
</script>

<style scoped>
.undercover-page {
  min-height: 100vh;
  padding-bottom: 24px;
}

.undercover-page .content-area {
  max-width: 1200px;
  padding-top: 20px;
}

/* 本页不显示底部导航栏，取消 FooterBar 为其预留的 70px 留白 */
.undercover-page :deep(.footer-bar) {
  padding-bottom: 0;
}

/* =========================
   游戏标题卡片
========================= */
.undercover-header {
  position: relative;
  text-align: center;
  background: var(--card-bg);
  border-radius: 32px;
  padding: 20px 20px 72px;
  margin: 20px 0;
  box-shadow: var(--shadow);
}

.header-top {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-icon {
  margin-top: 12px;
  font-size: 52px;
  line-height: 1;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.12));
}

.undercover-title {
  flex: 1;
  font-size: 1.9rem;
  margin: 0;
  color: var(--text-primary);
}

.undercover-subtitle {
  margin: 8px 0 0;
  font-size: 0.95rem;
  opacity: 0.75;
  color: var(--text-primary);
}

.home-btn {
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--section-bg);
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: 0.2s ease;
  -webkit-tap-highlight-color: transparent;
}

.home-btn:hover {
  transform: scale(1.06);
  background: var(--accent);
}

.home-btn:active {
  transform: scale(0.96);
}

.header-spacer {
  flex: 0 0 48px;
}

.create-room-btn {
  position: absolute;
  right: 20px;
  bottom: 18px;
  border: none;
  border-radius: 48px;
  padding: 10px 22px;
  font-size: 0.95rem;
  font-weight: 700;
  font-family: inherit;
  color: white;
  background: linear-gradient(135deg, #2c3e66, #1f2c4b);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.12);
  cursor: pointer;
  transition: 0.2s ease;
}

.create-room-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.08);
}

/* 编辑题库：位于「创建房间+」左侧 */
.edit-bank-btn {
  position: absolute;
  right: 148px;
  bottom: 18px;
  border: none;
  border-radius: 48px;
  padding: 10px 20px;
  font-size: 0.95rem;
  font-weight: 700;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--section-bg);
  box-shadow: inset 0 0 0 1px var(--glass-border), 0 6px 12px rgba(0, 0, 0, 0.08);
  cursor: pointer;
  transition: 0.2s ease;
}

.edit-bank-btn:hover {
  transform: translateY(-2px);
  filter: brightness(1.05);
}

.edit-bank-btn:active {
  transform: translateY(-1px);
}

/* =========================
   通用区块
========================= */
.section-title {
  font-size: 1.5rem;
  margin: 0 0 16px;
  color: var(--text-primary);
}

.list-tip {
  text-align: center;
  font-size: 0.95rem;
  opacity: 0.7;
  color: var(--text-primary);
  padding: 24px 12px;
}

/* =========================
   房间列表
========================= */
.room-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.room-card {
  background: var(--bg-secondary);
  border-radius: 20px;
  padding: 16px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.2s ease;
}

.room-card:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 22px var(--shadow-color);
}

.room-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.room-no {
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-primary);
}

.room-status {
  font-size: 0.75rem;
  padding: 2px 10px;
  border-radius: 20px;
  background: var(--accent);
  color: white;
}

.room-status.waiting {
  background: #2ecc71;
}

.room-status.playing {
  background: #f39c12;
}

.room-name {
  margin-top: 10px;
  font-size: 1rem;
  color: var(--text-primary);
  word-break: break-all;
}

.room-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 14px;
  font-size: 0.85rem;
  opacity: 0.8;
  color: var(--text-primary);
}

.room-owner {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.room-count {
  flex-shrink: 0;
}

/* =========================
   在线玩家
========================= */
.online-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.online-count {
  font-size: 1.2rem;
  font-weight: 700;
  color: var(--text-primary);
}

.online-refresh {
  cursor: pointer;
  font-size: 1.2rem;
  opacity: 0.6;
  transition: 0.2s;
}

.online-refresh:hover {
  opacity: 1;
  transform: rotate(60deg);
}

.online-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 16px;
}

.player-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px 8px;
  border-radius: 18px;
  background: var(--bg-secondary);
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.player-avatar-wrapper {
  position: relative;
  width: 52px;
  height: 52px;
}

.player-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: var(--surface, var(--bg-primary));
  border: 2px solid var(--glass-border);
}

/* 后台断线标签（头像右下角） */
.player-bg-tag {
  position: absolute;
  right: -14px;
  bottom: -4px;
  padding: 1px 6px;
  border-radius: 8px;
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  line-height: 1.5;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.2);
}

.player-name {
  font-size: 0.85rem;
  text-align: center;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.3;
}

/* =========================
   手机适配
========================= */
@media (max-width: 768px) {
  .undercover-title {
    font-size: 1.5rem;
  }

  .header-icon {
    font-size: 44px;
  }

  .room-list {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .online-list {
    grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
    gap: 12px;
  }
}
</style>
