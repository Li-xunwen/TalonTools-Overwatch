<template>
  <div class="poster-wrapper">
    <div class="poster-container" ref="containerRef">
      <div class="play-hero hero1" ref="hero1"></div>
      <div class="play-hero hero2" ref="hero2"></div>
      <div class="play-hero hero3" ref="hero3"></div>
      <div class="play-hero hero4" ref="hero4"></div>
      <div class="play-hero hero5" ref="hero5"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

//const containerRef = ref<HTMLElement | null>(null)
const hero1 = ref<HTMLElement | null>(null)
const hero2 = ref<HTMLElement | null>(null)
const hero3 = ref<HTMLElement | null>(null)
const hero4 = ref<HTMLElement | null>(null)
const hero5 = ref<HTMLElement | null>(null)

let animationIntervals: number[] = []
let resizeTimer: ReturnType<typeof setTimeout> | null = null

function resetHeroPosition(hero: HTMLElement | null) {
  if (!hero) return
  hero.style.transition = 'transform 0s'
  hero.style.transform = 'translate(0, 0)'
  void hero.offsetHeight
  hero.style.transition = 'transform 3s ease-in-out'
}

function animateHeroBreathing(hero: HTMLElement | null) {
  if (!hero) return
  const tx = (Math.random() - 0.5) * 10
  const ty = (Math.random() - 0.5) * 10
  hero.style.transform = `translate(${tx}px, ${ty}px)`
}

function initHeroesAnimation() {
  const heroes = [hero1.value, hero2.value, hero3.value, hero4.value, hero5.value]
  heroes.forEach(hero => {
    resetHeroPosition(hero)
    const interval = setInterval(() => animateHeroBreathing(hero), 2000 + Math.random() * 3000)
    animationIntervals.push(interval)
  })
}

function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    const heroes = [hero1.value, hero2.value, hero3.value, hero4.value, hero5.value]
    heroes.forEach(resetHeroPosition)
  }, 100)
}

onMounted(() => {
  initHeroesAnimation()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  animationIntervals.forEach(interval => clearInterval(interval))
  animationIntervals = []
  window.removeEventListener('resize', handleResize)
  if (resizeTimer) clearTimeout(resizeTimer)
})
</script>

<style scoped>
/* ========== 主题变量（用于支持深色模式，但不依赖外部） ========== */
:root {
  --bg-primary: #ffffff;
  --bg-secondary: #f5f5f5;
  --text-primary: #333333;
  --card-bg: #eeeeee;
  --accent: #555555;
  --shadow-color: rgba(0, 0, 0, 0.1);
}

[data-theme="dark"] {
  --bg-primary: #121212;
  --bg-secondary: #1e1e1e;
  --text-primary: #ffffff;
  --card-bg: #2a2a2a;
  --accent: #bbbbbb;
  --shadow-color: rgba(0, 0, 0, 0.5);
}

/* ========== 头图海报区域样式 ========== */
.poster-wrapper {
  width: 100%;
  aspect-ratio: 2 / 1;
  margin: 0 auto;
  position: relative;
  border-radius: 15px;
  overflow: hidden;
  box-shadow: 0 0 30px var(--shadow-color);
  margin-top: 0;
  margin-bottom: 10px;
  background: transparent;
  padding: 0 10px;
}

.poster-container {
  position: relative;
  width: 100%;
  height: 100%;
  background: transparent;
  z-index: 3;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
}

/* 英雄角色公共样式 */
.play-hero {
  position: absolute;
  background-size: contain;
  background-repeat: no-repeat;
  z-index: 2;
  transition: transform 3s ease-in-out;
  background-position: center bottom;
}

/* 各英雄专属背景图片（保留原始 URL） */
.hero1 {
  width: 80%;
  height: 80%;
  bottom: 0%;
  background-image: url('https://ld5.res.netease.com/pc/zt/20241113163154/assets/hero1_f0293c69.webp');
}
.hero2 {
  width: 80%;
  height: 80%;
  bottom: 0%;
  background-image: url('https://ld5.res.netease.com/pc/zt/20241113163154/assets/hero2_1f3ee00a.webp');
}
.hero3 {
  width: 80%;
  height: 80%;
  bottom: 0%;
  transform: translateX(-50%);
  background-image: url('https://ld5.res.netease.com/pc/zt/20241113163154/assets/hero3_741524a1.webp');
}
.hero4 {
  width: 80%;
  height: 80%;
  bottom: 0%;
  background-image: url('https://ld5.res.netease.com/pc/zt/20241113163154/assets/hero4_74f4aebf.webp');
}
.hero5 {
  width: 80%;
  height: 80%;
  bottom: 0%;
  background-image: url('https://ld5.res.netease.com/pc/zt/20241113163154/assets/hero5_282fd673.webp');
}

/* 可选：如果不需要浮动装饰元素，可忽略；此处不包含 .floating-elements 相关样式 */
</style>