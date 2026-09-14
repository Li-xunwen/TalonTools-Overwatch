<template>
  <!-- 队伍席位与观战席共用的成员展示 -->
  <div class="member-slot" :class="{ empty: !member, mine, stacked }">
    <!-- 空位：队伍栏显示椅子图标 + 「空位」；观战席只显示椅子图标 -->
    <template v-if="!member">
      <img v-if="stacked" class="member-avatar" :src="chairIcon" :alt="emptyLabel">
      <div v-else class="member-empty">
        <img class="member-avatar" :src="chairIcon" :alt="emptyLabel">
        <span ref="emptyLabelRef" class="member-name empty-label">{{ emptyLabel }}</span>
      </div>
    </template>

    <!-- 观战席（stacked）：上方仅头像，下方只显示标签；点击他人头像时临时显示完整 ID -->
    <template v-else-if="stacked">
      <img
        class="member-avatar"
        :src="member.avatar"
        :alt="member.displayName"
        @error="onAvatarError"
      >
      <div class="member-meta">
        <span v-if="member.isOwner" class="member-tag">房主</span>
        <span v-if="hasMapRight" class="member-tag map-right-tag">选图</span>
        <span v-else-if="mine" class="member-tag mine-tag">我</span>
        <span v-if="member.ready" class="member-tag ready-tag">准备</span>
        <span v-if="statusTag" class="member-status" :class="statusClass">{{ statusTag }}</span>
      </div>
    </template>

    <!-- 队伍栏：第一行头像靠左 + 右侧标签区，第二行昵称靠左 -->
    <template v-else>
      <div class="member-top">
        <img
          class="member-avatar"
          :src="member.avatar"
          :alt="member.displayName"
          @error="onAvatarError"
        >
        <div class="member-tags">
          <span v-if="member.isOwner" class="member-tag">房主</span>
          <span v-if="hasMapRight" class="member-tag map-right-tag">选图</span>
          <span v-else-if="mine" class="member-tag mine-tag">我</span>
          <span v-if="member.ready" class="member-tag ready-tag">准备</span>
        </div>
      </div>
      <div class="member-name-row">
        <span
          ref="memberNameRef"
          class="member-name"
          :class="[nameClass, { compact: nameIsCompact }]"
        >{{ member.displayName }}</span>
        <span v-if="statusTag" class="member-status" :class="statusClass">{{ statusTag }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { SeatMember } from '@/types/undercover'

const props = withDefaults(
  defineProps<{
    member: SeatMember | null
    mine?: boolean
    stacked?: boolean
    hasMapRight?: boolean
    nameClass?: string
    emptyLabel?: string
    chairIcon?: string
  }>(),
  {
    mine: false,
    stacked: false,
    hasMapRight: false,
    nameClass: '',
    emptyLabel: '空位',
    chairIcon: '/ico/椅子.svg'
  }
)

// 原始名称（有成员用战网ID去 #数字后的昵称，空位用「空位」）
const rawName = computed(() => (props.member ? props.member.displayName : props.emptyLabel))

// 按字符切分（避免拆坏 emoji），用于判断是否需要缩小字号
const nameChars = computed(() => Array.from(rawName.value))

// 4 个字以内用当前字号，5 个字及以上先缩小一档（超出宽度时再由 fitMemberName 继续缩）
const nameIsCompact = computed(() => nameChars.value.length > 4)

// 头像下方的状态标签：断线优先于后台
const statusTag = computed(() => {
  if (!props.member) return ''
  if (!props.member.connected) return '断线'
  return props.member.background ? '后台' : ''
})

const statusClass = computed(() => (props.member?.connected ? 'background' : 'offline'))

/* =========================
   「空位」文字：按可用宽度缩放，强制完整显示（不出现省略号）
   队伍栏的 ID：按可用宽度动态缩小字号，完整显示
========================= */
const emptyLabelRef = ref<HTMLElement | null>(null)
const memberNameRef = ref<HTMLElement | null>(null)
let labelObserver: ResizeObserver | null = null

function fitEmptyLabel() {
  const el = emptyLabelRef.value
  if (!el) return

  el.style.transform = 'scale(1)'

  const available = el.clientWidth
  const natural = el.scrollWidth
  if (!available || !natural || natural <= available) return

  el.style.transform = `scale(${Math.max(available / natural, 0.6)})`
}

// 队伍栏 ID：动态缩小字号以完整显示（最小 8px）
function fitMemberName() {
  const el = memberNameRef.value
  if (!el) return

  const available = el.clientWidth
  const natural = el.scrollWidth
  if (!available || !natural || natural <= available + 0.5) return

  const current = parseFloat(getComputedStyle(el).fontSize) || 15.2
  const next = Math.max(current * (available / natural), 8)
  if (Math.abs(next - current) < 0.1) return

  el.style.fontSize = `${next}px`
}

function fitAll() {
  fitEmptyLabel()
  fitMemberName()
}

function observeFitTargets() {
  if (!labelObserver) return
  labelObserver.disconnect()
  if (emptyLabelRef.value) labelObserver.observe(emptyLabelRef.value)
  if (memberNameRef.value) labelObserver.observe(memberNameRef.value)
}

onMounted(() => {
  fitAll()

  if (typeof ResizeObserver === 'undefined') return
  labelObserver = new ResizeObserver(() => fitAll())
  observeFitTargets()
})

watch([emptyLabelRef, memberNameRef], () => {
  observeFitTargets()
  fitAll()
})

onBeforeUnmount(() => {
  labelObserver?.disconnect()
  labelObserver = null
})

function onAvatarError(e: Event) {
  // 空位显示的是椅子图标，加载失败时不做替换
  if (!props.member) return

  const img = e.target as HTMLImageElement
  img.src = '/res/imge/default-avatar.png'
  img.onerror = null
}
</script>

<style scoped>
.member-slot {
  display: flex;
  flex-direction: column;
  /* 内容不足一个席位高度时（空位）垂直居中 */
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 100%;
  min-height: 68px;
  min-width: 0;
}

.member-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  /* 间距收窄给右侧标签让位（卡片内宽 84px：头像 44 + 标签区 36） */
  gap: 4px;
  min-width: 0;
}

.member-avatar {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
  /* 图标与底色方块强制 1:1 */
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  object-fit: cover;
  background: var(--bg-primary);
}

.member-slot.empty .member-avatar {
  object-fit: contain;
  padding: 4px;
  box-sizing: border-box;
  opacity: 0.75;
  /* 空位时允许椅子图标缩小给文字让位，但高度跟随宽度，保持 1:1 */
  flex: 0 1 44px;
  min-width: 24px;
  height: auto;
}

/* 观战席空位只有图标、不需要给文字让位：固定 44 × 44，保证严格 1:1 */
.member-slot.stacked.empty .member-avatar {
  flex: 0 0 44px;
  width: 44px;
  height: 44px;
}

/* 空位：椅子图标 + 「空位」，两者垂直居中 */
.member-empty {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

/* 空位文字：不省略、不换行，靠缩放适配（scale 由脚本按可用宽度计算） */
.member-name.empty-label {
  display: block;
  overflow: visible;
  text-overflow: clip;
  white-space: nowrap;
  transform-origin: left center;
}

/* 观战席（stacked）：仅头像居中，下方一行显示 ID 与标签 */
.member-slot.stacked {
  align-items: center;
  gap: 4px;
}

.member-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.member-meta .member-name {
  width: auto;
  flex: 0 1 auto;
  text-align: center;
}

/* 头像右侧的标签区：房主 / 我 / 选图，改为上下排列 */
.member-tags {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  overflow: hidden;
}

.member-tag {
  flex: 0 0 auto;
  font-size: 0.7rem;
  padding: 1px 6px;
  border-radius: 20px;
  color: white;
  background: #2c3e66;
  /* 标签文字强制同行，不换行 */
  white-space: nowrap;
}

.member-tag.mine-tag {
  background: var(--accent);
}

/* 拥有选图权：绿色标签 */
.member-tag.map-right-tag {
  background: #2ecc71;
  color: #0a2a17;
  font-weight: 700;
}

/* 已准备：绿色标签（浅一些，与选图权标签区分） */
.member-tag.ready-tag {
  background: rgba(46, 204, 113, 0.85);
  color: #06281a;
}

/* 昵称（战网ID 去 #数字）靠左 */
.member-name {
  width: 100%;
  text-align: left;
  font-size: 0.95rem;
  /* 颜色交给 uw-id-* 类（全局）或从父级继承，否则作用域内的 color 会盖掉 ID 颜色 */
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 队伍栏：昵称与状态标签同一行（都在头像下方） */
.member-name-row {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-width: 0;
}

.member-name-row .member-name {
  flex: 0 1 auto;
  width: auto;
  min-width: 0;
}

/* 断线 / 后台状态标签 */
.member-status {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 8px;
  font-size: 0.62rem;
  line-height: 1.5;
  color: #fff;
  white-space: nowrap;
}

.member-status.offline {
  background: #ff4d4f;
}

.member-status.background {
  background: #f39c12;
}

/* 5 个字及以上缩小字号（超过 6 个字已在脚本里截断为 6 字 + 省略号） */
.member-name.compact {
  font-size: 0.8rem;
}

@media (max-width: 768px) {
  .member-avatar {
    flex-basis: 36px;
    width: 36px;
    height: 36px;
  }

  .member-name {
    font-size: 0.85rem;
  }
}
</style>
