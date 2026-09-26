<template>
  <div class="voice-dock" :class="{ 'is-expanded': expanded }">
    <!-- 收起态：单圆，颜色 = 当前频道，外圈 = 采集音量 -->
    <button
      v-show="!expanded"
      class="voice-orb"
      :class="orbClass"
      :title="orbTitle"
      @click.stop="onOrbClick"
    >
      <span class="orb-ring" :style="ringStyle"></span>
      <svg v-if="micChannel === 'muted'" class="orb-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
        <path class="slash" d="M4 4 20 20" />
      </svg>
      <svg v-else class="orb-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
      <span v-if="status !== 'connected'" class="orb-badge">{{ status === 'error' ? '!' : '…' }}</span>
    </button>

    <!-- 展开态：三挡麦克风 + 两枚圆弧扬声器 -->
    <div v-if="expanded" class="voice-panel" @click.stop>
      <div class="mic-row">
        <button
          class="mic-gear public"
          :class="{ on: micChannel === 'public' }"
          title="公共频道麦"
          @click="pickChannel('public')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <button
          class="mic-gear blue"
          :class="{ on: micChannel === 'blue' }"
          title="队伍频道麦"
          @click="pickChannel('blue')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
        </button>
        <button
          class="mic-gear muted"
          :class="{ on: micChannel === 'muted' }"
          title="闭麦"
          @click="pickChannel('muted')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            <path class="slash" d="M4 4 20 20" />
          </svg>
        </button>
      </div>
      <div class="speaker-row">
        <button
          class="speaker-arc public"
          :class="{ off: !listen.public }"
          :title="listen.public ? '正在监听公共频道，点击静音' : '已静音公共频道，点击恢复'"
          @click="onToggleListen('public')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 14a8 8 0 0 1 16 0" />
            <path class="mini-slash" d="M5 19 19 5" />
          </svg>
        </button>
        <button
          class="speaker-arc blue"
          :class="{ off: !listen.blue }"
          :title="listen.blue ? '正在监听队伍频道，点击静音' : '已静音队伍频道，点击恢复'"
          @click="onToggleListen('blue')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 14a8 8 0 0 1 16 0" />
            <path class="mini-slash" d="M5 19 19 5" />
          </svg>
        </button>
      </div>

      <!-- 自检行：连接 / 麦克风 / 实时音量，出问题时一眼能看出卡在哪一步 -->
      <div class="voice-diag" :class="status">
        <span>连接：{{ statusText }}</span>
        <span>麦克风：{{ publishedText }}</span>
        <span>音量：{{ dbText }}</span>
      </div>
      <p v-if="status === 'error'" class="voice-error">{{ errorText }}</p>
    </div>

    <!-- 发言栏：无背景、点击穿透 -->
    <ul v-if="speakers.length" class="speaker-list">
      <li v-for="s in visibleSpeakers" :key="s.identity" :class="s.channel">
        <span class="speaker-name">{{ s.displayName }}</span>
        <svg class="speaker-icon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9v6h4l5 4V5L8 9H4Z" />
          <path d="M16 8.5a5 5 0 0 1 0 7" />
        </svg>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useVoiceChannel, type VoiceListenChannel, type VoiceMicChannel } from '@/composables/useVoiceChannel'

const props = defineProps<{
  roomNo: string
  /** 连接交给父级控制（例如离开房间时传 false） */
  enabled?: boolean
}>()

const expanded = ref(false)
const {
  status,
  errorText,
  micChannel,
  publishedChannel,
  listen,
  localLevel,
  speakers,
  connect,
  disconnect,
  setMicChannel,
  toggleListen,
  resumeAudio,
} = useVoiceChannel()

const visibleSpeakers = computed(() => speakers.value.slice(0, 6))

const statusText = computed(() => {
  switch (status.value) {
    case 'connected': return '已连接'
    case 'connecting': return '连接中…'
    case 'error': return '失败'
    default: return '未连接'
  }
})

const publishedText = computed(() => {
  if (publishedChannel.value === 'public') return '公共麦已开'
  if (publishedChannel.value === 'blue') return '队伍麦已开'
  return '未开启'
})

const dbText = computed(() => {
  const level = localLevel.value
  if (!level) return '—'
  return `${Math.round(20 * Math.log10(level))} dB`
})

const orbClass = computed(() => ({
  'ch-public': micChannel.value === 'public',
  'ch-blue': micChannel.value === 'blue',
  'ch-muted': micChannel.value === 'muted',
}))

const orbTitle = computed(() => {
  if (status.value === 'error') return `语音连接失败：${errorText.value}`
  if (status.value === 'connecting') return '正在连接语音…'
  if (micChannel.value === 'muted') return '已闭麦（点击展开切换）'
  return micChannel.value === 'public' ? '公共频道麦（点击展开切换）' : '队伍频道麦（点击展开切换）'
})

const ringStyle = computed(() => {
  const level = micChannel.value === 'muted' ? 0 : Math.min(1, localLevel.value * 4)
  return {
    transform: `scale(${(1 + level * 0.35).toFixed(3)})`,
    opacity: String(micChannel.value === 'muted' ? 0 : 0.25 + level * 0.75),
  }
})

/** 选中挡位后自动收起（用户确认的行为） */
async function pickChannel(channel: VoiceMicChannel) {
  // 点击属于用户手势：先把被自动播放策略挂起的音频放出来
  await resumeAudio()
  await setMicChannel(channel)
  expanded.value = false
}

async function onOrbClick() {
  await resumeAudio()
  expanded.value = true
}

async function onToggleListen(channel: VoiceListenChannel) {
  await resumeAudio()
  toggleListen(channel)
}

function onDocumentClick() {
  expanded.value = false
}

async function start() {
  await connect(props.roomNo)
}

watch(
  () => props.roomNo,
  async (value, old) => {
    if (value === old) return
    await disconnect()
    if (value && props.enabled !== false) await start()
  }
)

watch(
  () => props.enabled,
  async (value) => {
    if (value === false) await disconnect()
    else if (status.value === 'idle' && props.roomNo) await start()
  }
)

onMounted(async () => {
  document.addEventListener('click', onDocumentClick)
  if (props.roomNo && props.enabled !== false) await start()
})

onBeforeUnmount(async () => {
  document.removeEventListener('click', onDocumentClick)
  await disconnect()
})
</script>

<style scoped>
.voice-dock {
  position: fixed;
  top: 88px;
  right: 16px;
  z-index: 2400;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  pointer-events: none;
}

.voice-dock > * {
  pointer-events: auto;
}

.voice-orb {
  position: relative;
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: grid;
  place-items: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.32);
  transition: background 0.18s ease, transform 0.12s ease;
}

.voice-orb:active {
  transform: scale(0.96);
}

.voice-orb.ch-public {
  background: #f99e1a;
}

.voice-orb.ch-blue {
  background: #3e8ed0;
}

.voice-orb.ch-muted {
  background: #7a7a7a;
}

.orb-ring {
  position: absolute;
  inset: -4px;
  border: 2px solid currentColor;
  border-radius: 50%;
  transition: transform 0.08s linear, opacity 0.12s linear;
}

.orb-icon {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.orb-icon .slash {
  stroke: #fff;
  stroke-width: 2.2;
}

.orb-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 3px;
  border-radius: 999px;
  background: #1b1f26;
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
}

.voice-panel {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px;
  border-radius: 16px;
  background: var(--bg-secondary, #1e232b);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.35), inset 0 0 0 1px var(--glass-border, rgba(255, 255, 255, 0.12));
  animation: voice-pop 0.15s ease-out;
}

@keyframes voice-pop {
  from {
    transform: scale(0.85);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.mic-row {
  display: flex;
  gap: 8px;
}

.mic-gear {
  width: 44px;
  height: 44px;
  padding: 0;
  border: none;
  border-radius: 50%;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: #fff;
  opacity: 0.72;
  filter: saturate(0.55);
  transition: 0.15s ease;
}

.mic-gear svg {
  width: 22px;
  height: 22px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.mic-gear .slash {
  stroke: #fff;
  stroke-width: 2.2;
}

.mic-gear.public {
  background: #f99e1a;
}

.mic-gear.blue {
  background: #3e8ed0;
}

.mic-gear.muted {
  background: #7a7a7a;
}

.mic-gear.on {
  opacity: 1;
  filter: none;
  box-shadow: 0 0 0 2px currentColor, 0 4px 12px rgba(0, 0, 0, 0.3);
  transform: scale(1.05);
}

.speaker-row {
  display: flex;
  gap: 8px;
}

.speaker-arc {
  width: 44px;
  height: 20px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: 0.15s ease;
}

.speaker-arc svg {
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
}

.speaker-arc.public {
  color: #f99e1a;
}

.speaker-arc.blue {
  color: #3e8ed0;
}

.speaker-arc .mini-slash {
  opacity: 0;
}

.speaker-arc.off {
  color: #8a8f98;
}

.speaker-arc.off .mini-slash {
  opacity: 1;
}

.voice-error {
  margin: 2px 0 0;
  max-width: 148px;
  font-size: 10px;
  line-height: 1.4;
  color: #ff8a8a;
}

/* 自检行 */
.voice-diag {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 8px;
  max-width: 160px;
  margin-top: 2px;
  padding-top: 4px;
  border-top: 1px solid var(--glass-border, rgba(255, 255, 255, 0.12));
  font-size: 10px;
  line-height: 1.3;
  color: var(--text-secondary, #9aa1ab);
}

.voice-diag.connected {
  color: #5ad17a;
}

.voice-diag.error {
  color: #ff8a8a;
}

/* 发言栏：无背景、点击穿透、尽量小字体 */
.speaker-list {
  margin: 0;
  padding: 0;
  list-style: none;
  max-width: 160px;
  pointer-events: none;
  text-align: right;
}

.speaker-list li {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 3px;
  font-size: 11px;
  line-height: 14px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.65);
}

.speaker-list li.public {
  color: #ffbe5c;
}

.speaker-list li.blue {
  color: #7db8ee;
}

.speaker-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.speaker-icon {
  flex: 0 0 auto;
  width: 10px;
  height: 10px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
}

@media (max-width: 768px) {
  .voice-dock {
    transform: scale(0.85);
    transform-origin: top right;
  }
}
</style>
