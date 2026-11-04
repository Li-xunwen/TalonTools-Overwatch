<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="image-viewer-mask" @click="close" @wheel="onWheel">
        <div ref="containerEl" class="image-viewer-container" :class="{ 'long-image': isLongLayout }" @click.stop>
          <img
            ref="imgEl"
            :src="src"
            class="image-viewer-img"
            :class="{
              interacting: isInteracting,
              panning: isPanning,
              zoomable: scale > 1,
              scrollable: isLongLayout && scale <= 1,
              scrolling: isScrollDragging
            }"
            :title="isLongLayout
              ? '长图：滚轮或拖动浏览，Ctrl+滚轮缩放，双击重置'
              : '滚轮缩放，放大后拖动平移，双击重置'"
            :style="{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale}) rotate(${rotateDeg}deg)`,
              width: isLongLayout ? '100%' : undefined,
              maxWidth: isLongLayout ? '100%' : ((rotateDeg % 180 === 0) ? '90vw' : '90vh'),
              maxHeight: isLongLayout ? 'none' : ((rotateDeg % 180 === 0) ? '90vh' : '90vw')
            }"
            draggable="false"
            @load="onImageLoad"
            @click.stop
            @dblclick.stop="resetView"
            @pointerdown="startPan"
            @pointermove="onPan"
            @pointerup="endPan"
            @pointercancel="endPan"
          />
        </div>
        <button class="image-viewer-close" @click="close">✕</button>
        <button class="image-viewer-rotate" @click.stop="rotate">⟳</button>
        <button class="image-viewer-download" @click.stop="download">⬇</button>
        <button
          v-if="Math.abs(scale - 1) > 0.001"
          class="image-viewer-zoom"
          title="滚轮缩放，拖动平移；点击重置"
          @click.stop="resetView"
        >
          {{ Math.round(scale * 100) }}%
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'

const props = defineProps<{
  visible: boolean
  src: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

const rotateDeg = ref(0)

const MIN_SCALE = 0.5
const MAX_SCALE = 8

const imgEl = ref<HTMLImageElement | null>(null)
const containerEl = ref<HTMLElement | null>(null)
const naturalWidth = ref(0)
const naturalHeight = ref(0)
const scale = ref(1)
const offsetX = ref(0)
const offsetY = ref(0)
const isPanning = ref(false)
const isInteracting = ref(false)
const isPinching = ref(false)
const isScrollDragging = ref(false)
const activePointers = new Map<number, { x: number; y: number }>()

const isLongImage = computed(() =>
  naturalWidth.value > 0 && naturalHeight.value / naturalWidth.value >= 1.5
)
const isLongLayout = computed(() =>
  isLongImage.value && rotateDeg.value % 180 === 0
)

let interactionTimer: ReturnType<typeof setTimeout> | null = null
let panStartX = 0
let panStartY = 0
let panStartOffsetX = 0
let panStartOffsetY = 0
let pinchStartDistance = 0
let pinchStartScale = 1
let pinchStartOffsetX = 0
let pinchStartOffsetY = 0
let pinchAnchorX = 0
let pinchAnchorY = 0
let layoutCenterX = 0
let layoutCenterY = 0
let scrollStartY = 0
let scrollStartTop = 0

function markInteracting() {
  isInteracting.value = true
  if (interactionTimer) clearTimeout(interactionTimer)
  interactionTimer = setTimeout(() => {
    isInteracting.value = false
  }, 160)
}

function resetView() {
  scale.value = 1
  offsetX.value = 0
  offsetY.value = 0
  isPanning.value = false
  isPinching.value = false
  isScrollDragging.value = false
  activePointers.clear()
  if (containerEl.value) containerEl.value.scrollTop = 0
}

function onImageLoad(e: Event) {
  const image = e.target as HTMLImageElement
  naturalWidth.value = image.naturalWidth
  naturalHeight.value = image.naturalHeight
}

function onWheel(e: WheelEvent) {
  if (e.target !== imgEl.value || !imgEl.value) {
    e.preventDefault()
    return
  }

  // 长图在 1x 时滚轮用于浏览整张长图，Ctrl+滚轮才缩放。
  if (isLongLayout.value && scale.value <= 1 && !e.ctrlKey) return
  e.preventDefault()

  const factor = Math.exp(-e.deltaY * 0.0015)
  const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale.value * factor))
  if (Math.abs(nextScale - scale.value) < 0.0001) return

  const rect = imgEl.value.getBoundingClientRect()
  const ratio = nextScale / scale.value
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2
  const dx = e.clientX - centerX + offsetX.value
  const dy = e.clientY - centerY + offsetY.value

  if (nextScale <= 1) {
    offsetX.value = 0
    offsetY.value = 0
  } else {
    offsetX.value = offsetX.value * ratio + dx * (1 - ratio)
    offsetY.value = offsetY.value * ratio + dy * (1 - ratio)
  }
  scale.value = nextScale
  markInteracting()
}

function getPinchPoints() {
  return [...activePointers.values()].slice(0, 2)
}

function beginPinch() {
  if (!imgEl.value || activePointers.size < 2) return
  const [a, b] = getPinchPoints()
  const distance = Math.hypot(a.x - b.x, a.y - b.y)
  if (distance < 1) return

  const rect = imgEl.value.getBoundingClientRect()
  const midX = (a.x + b.x) / 2
  const midY = (a.y + b.y) / 2

  pinchStartDistance = distance
  pinchStartScale = scale.value
  pinchStartOffsetX = offsetX.value
  pinchStartOffsetY = offsetY.value
  layoutCenterX = rect.left + rect.width / 2 - offsetX.value
  layoutCenterY = rect.top + rect.height / 2 - offsetY.value
  pinchAnchorX = midX - layoutCenterX
  pinchAnchorY = midY - layoutCenterY
  isPinching.value = true
  isPanning.value = false
  isScrollDragging.value = false
}

function startPan(e: PointerEvent) {
  if (e.pointerType === 'mouse' && e.button !== 0) return
  if (!activePointers.has(e.pointerId) && activePointers.size >= 2) return

  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  const target = e.currentTarget as HTMLElement
  try {
    target.setPointerCapture(e.pointerId)
  } catch {
    // 忽略不支持指针捕获的浏览器
  }
  e.preventDefault()

  if (activePointers.size >= 2) {
    beginPinch()
    markInteracting()
    return
  }

  if (isLongLayout.value && scale.value <= 1 && containerEl.value) {
    isScrollDragging.value = true
    isPanning.value = false
    scrollStartY = e.clientY
    scrollStartTop = containerEl.value.scrollTop
    markInteracting()
    return
  }

  if (scale.value <= 1) return
  isPanning.value = true
  panStartX = e.clientX
  panStartY = e.clientY
  panStartOffsetX = offsetX.value
  panStartOffsetY = offsetY.value
  markInteracting()
}

function onPan(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

  if (isPinching.value && activePointers.size >= 2) {
    const [a, b] = getPinchPoints()
    const distance = Math.hypot(a.x - b.x, a.y - b.y)
    if (pinchStartDistance < 1) return

    const nextScale = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, pinchStartScale * (distance / pinchStartDistance))
    )
    const scaleRatio = nextScale / pinchStartScale
    const midX = (a.x + b.x) / 2
    const midY = (a.y + b.y) / 2
    const midOffsetX = midX - layoutCenterX
    const midOffsetY = midY - layoutCenterY

    if (nextScale <= 1) {
      offsetX.value = 0
      offsetY.value = 0
    } else {
      offsetX.value = midOffsetX - scaleRatio * (pinchAnchorX - pinchStartOffsetX)
      offsetY.value = midOffsetY - scaleRatio * (pinchAnchorY - pinchStartOffsetY)
    }
    scale.value = nextScale
    markInteracting()
    e.preventDefault()
    return
  }

  if (isScrollDragging.value) {
    if (containerEl.value) {
      containerEl.value.scrollTop = scrollStartTop - (e.clientY - scrollStartY)
    }
    e.preventDefault()
    return
  }

  if (!isPanning.value) return
  offsetX.value = panStartOffsetX + (e.clientX - panStartX)
  offsetY.value = panStartOffsetY + (e.clientY - panStartY)
}

function endPan(e: PointerEvent) {
  if (!activePointers.has(e.pointerId)) return
  activePointers.delete(e.pointerId)

  const target = e.currentTarget as HTMLElement
  try {
    target.releasePointerCapture(e.pointerId)
  } catch {
    // 指针可能已经释放
  }

  if (isScrollDragging.value) {
    isScrollDragging.value = false
    isPanning.value = false
    markInteracting()
    return
  }

  if (activePointers.size >= 2) {
    beginPinch()
    markInteracting()
    return
  }

  if (isPinching.value) {
    isPinching.value = false
    if (activePointers.size === 1 && scale.value > 1) {
      const remaining = [...activePointers.values()][0]
      isPanning.value = true
      panStartX = remaining.x
      panStartY = remaining.y
      panStartOffsetX = offsetX.value
      panStartOffsetY = offsetY.value
    } else if (activePointers.size === 1 && isLongLayout.value && containerEl.value) {
      const remaining = [...activePointers.values()][0]
      isScrollDragging.value = true
      isPanning.value = false
      scrollStartY = remaining.y
      scrollStartTop = containerEl.value.scrollTop
    } else {
      isPanning.value = false
    }
  } else {
    isPanning.value = false
  }
  markInteracting()
}

function rotate() {
  rotateDeg.value = (rotateDeg.value + 90) % 360
}

async function download() {
  try {
    const res = await fetch(props.src)
    if (!res.ok) throw new Error('下载失败')
    const blob = await res.blob()

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filenameFromSrc(props.src)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  } catch (err) {
    console.error(err)
  }
}

function filenameFromSrc(src: string) {
  const path = src.split('?')[0]
  const name = path.split('/').pop()
  if (name) return name
  return 'image.png'
}

// 每次打开图片或切换图片时重置旋转角度
watch(() => props.visible, (newVal) => {
  if (newVal) {
    rotateDeg.value = 0
    naturalWidth.value = 0
    naturalHeight.value = 0
    resetView()
  }
})
watch(() => props.src, () => {
  rotateDeg.value = 0
  naturalWidth.value = 0
  naturalHeight.value = 0
  resetView()
})

onUnmounted(() => {
  if (interactionTimer) clearTimeout(interactionTimer)
})

const close = () => {
  emit('update:visible', false)
  emit('close')
}
</script>

<style scoped>
.image-viewer-mask {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.9);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.image-viewer-container {
  max-width: 90%;
  max-height: 90%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.image-viewer-container.long-image {
  width: 90vw;
  max-width: 90vw;
  max-height: 90vh;
  overflow-x: hidden;
  overflow-y: auto;
  align-items: flex-start;
  justify-content: center;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}

.image-viewer-container.long-image .image-viewer-img {
  flex: 0 0 auto;
}

.image-viewer-img {
  object-fit: contain;
  cursor: default;
  border-radius: 8px;
  transform-origin: center center;
  transition: transform 0.16s ease-out;
  will-change: transform;
  user-select: none;
  -webkit-user-drag: none;
  touch-action: none;
}

.image-viewer-img.interacting {
  transition: none;
}

.image-viewer-img.zoomable {
  cursor: grab;
}

.image-viewer-img.panning {
  cursor: grabbing;
}

.image-viewer-img.scrollable {
  cursor: grab;
}

.image-viewer-img.scrolling {
  cursor: grabbing;
}

.image-viewer-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
}

.image-viewer-close:hover {
  background: rgba(0, 0, 0, 0.8);
}

.image-viewer-rotate {
  position: absolute;
  bottom: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10000;
}

.image-viewer-rotate:hover {
  background: rgba(0, 0, 0, 0.8);
}

.image-viewer-download {
  position: absolute;
  bottom: 20px;
  left: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10000;
}

.image-viewer-download:hover {
  background: rgba(0, 0, 0, 0.8);
}

.image-viewer-zoom {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  font-size: 13px;
  line-height: 1.2;
  cursor: pointer;
  transition: background 0.2s;
  z-index: 10000;
  backdrop-filter: blur(4px);
}

.image-viewer-zoom:hover {
  background: rgba(0, 0, 0, 0.8);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
