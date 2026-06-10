<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="image-viewer-mask" @click="close">
        <div class="image-viewer-container" @click.stop>
          <img
            :src="src"
            class="image-viewer-img"
            :style="{
              transform: `rotate(${rotateDeg}deg)`,
              maxWidth: (rotateDeg % 180 === 0) ? '90vw' : '90vh',
              maxHeight: (rotateDeg % 180 === 0) ? '90vh' : '90vw'
            }"
            @click.stop
          />
        </div>
        <button class="image-viewer-close" @click="close">✕</button>
        <button class="image-viewer-rotate" @click.stop="rotate">⟳</button>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  visible: boolean
  src: string
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'close'): void
}>()

const rotateDeg = ref(0)

function rotate() {
  rotateDeg.value = (rotateDeg.value + 90) % 360
}

// 每次打开图片或切换图片时重置旋转角度
watch(() => props.visible, (newVal) => {
  if (newVal) rotateDeg.value = 0
})
watch(() => props.src, () => {
  rotateDeg.value = 0
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

.image-viewer-img {
  object-fit: contain;
  cursor: default;
  border-radius: 8px;
  transition: transform 0.2s ease;
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

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>