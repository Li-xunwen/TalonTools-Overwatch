<template>
  <Transition name="fade">
    <div v-if="visible" class="toast-message">
      {{ message }}
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{
  message: string
  duration?: number  // 显示时长（毫秒）
}>()

const visible = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null

watch(() => props.message, (newMsg) => {
  if (newMsg) {
    visible.value = true
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      visible.value = false
    }, props.duration || 3000)
  } else {
    visible.value = false
    if (timer) clearTimeout(timer)
  }
})
</script>

<style scoped>
.toast-message {
  position: fixed;
  bottom: 80px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.85);
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  /* 永远压在所有浮层之上：选项卡遮罩（3000+）、毛玻璃 mask、地图选择器（3300）等
     都带 backdrop-filter，层级低于它们时提示会被模糊掉 */
  z-index: 100000;
  white-space: nowrap;
  pointer-events: none;
  backdrop-filter: blur(4px);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
