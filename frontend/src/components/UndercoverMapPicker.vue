<template>
  <Teleport to="body">
    <div class="map-picker-mask" @click="emit('close')">
      <div class="map-picker" @click.stop>
        <header class="picker-header">
          <h3 class="picker-title">
            {{ mode === 'vote' ? '投票选图' : mode === 'recommend' ? '推荐选图' : '选择地图' }}
          </h3>
          <button class="picker-close" title="关闭" @click="emit('close')">✕</button>
        </header>

        <div class="picker-body">
          <!-- 地图类型（文件夹）：默认全部收起 -->
          <section v-for="category in MAP_CATEGORIES" :key="category.name" class="category">
            <button class="category-head" @click="toggleCategory(category.name)">
              <img
                v-if="category.icon"
                class="category-icon"
                :src="category.icon"
                :alt="category.name"
              >
              <span class="category-name">{{ category.name }}</span>
              <!-- 投票阶段：地图类型名后面汇总该类型的总票数 -->
              <span v-if="mode === 'vote' && categoryVoteTotal(category) > 0" class="category-votes">
                {{ categoryVoteTotal(category) }} 票
              </span>
              <span class="category-count">{{ category.maps.length }}</span>
              <span class="category-arrow">{{ expandedCategory === category.name ? '▾' : '▸' }}</span>
            </button>

            <!-- 展开：3 × 3 地图列表 -->
            <div v-if="expandedCategory === category.name" class="map-grid">
              <button
                v-for="map in category.maps"
                :key="`${category.name}-${map.name}`"
                class="map-card"
                :class="{ selected: map.name === highlighted }"
                @click="handleMapClick(map.name)"
              >
                <img class="map-image" :src="map.image" :alt="map.name">
                <span v-if="mode === 'vote' && voteCounts?.[map.name]" class="map-votes">
                  {{ voteCounts[map.name] }} 票
                </span>
                <span class="map-label">
                  <img v-if="category.icon" class="map-label-icon" :src="category.icon" alt="">
                  {{ map.name }}
                </span>
              </button>
            </div>
          </section>
        </div>

        <!-- 推荐模式：选中后点确定 -->
        <footer v-if="mode === 'recommend'" class="picker-footer">
          <button
            class="picker-confirm"
            :disabled="!pickedMap"
            @click="emit('confirm', pickedMap)"
          >{{ pickedMap ? `确定推荐 ${pickedMap}` : '请先选择一张地图' }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { MAP_CATEGORIES } from '@/data/owMaps'
import type { MapCategory } from '@/data/owMaps'

const props = defineProps<{
  /** choose 模式：当前已选地图，用于高亮 */
  selected?: string
  /** choose = 选图；vote = 投票选图 */
  mode?: 'choose' | 'vote' | 'recommend'
  /** vote 模式：自己当前投给哪张图 */
  votedMap?: string
  /** vote 模式：每张地图的当前票数 */
  voteCounts?: Record<string, number>
}>()

const emit = defineEmits<{
  (e: 'select', name: string): void
  (e: 'confirm', name: string): void
  (e: 'close'): void
}>()

// 地图类型默认全部收起；展开互斥，同一时间只展开一个类型
const expandedCategory = ref<string | null>(null)

// 推荐模式：先选中、再点确定
const pickedMap = ref('')

const highlighted = computed(
  () => (props.mode === 'vote' ? props.votedMap : props.mode === 'recommend' ? pickedMap.value : props.selected) ?? ''
)

function handleMapClick(name: string) {
  if (props.mode === 'recommend') {
    pickedMap.value = name
    return
  }
  emit('select', name)
}

function toggleCategory(name: string) {
  expandedCategory.value = expandedCategory.value === name ? null : name
}

// 该地图类型下的总票数（投票阶段显示在类型名后面）
function categoryVoteTotal(category: MapCategory): number {
  if (!props.voteCounts) return 0
  return category.maps.reduce((total, map) => total + (props.voteCounts?.[map.name] ?? 0), 0)
}
</script>

<style scoped>
.map-picker-mask {
  position: fixed;
  inset: 0;
  z-index: 3300;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
}

/* 选图组件：800 × 500，超出屏幕时自适应缩小 */
.map-picker {
  display: flex;
  flex-direction: column;
  width: 800px;
  height: 500px;
  max-width: 96vw;
  max-height: 92vh;
  border-radius: 22px;
  background: var(--bg-primary);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4), inset 0 0 0 1px var(--glass-border);
  overflow: hidden;
}

.picker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--glass-border);
}

.picker-title {
  margin: 0;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.picker-close {
  border: none;
  background: transparent;
  color: var(--text-primary);
  font-size: 18px;
  cursor: pointer;
  opacity: 0.7;
}

.picker-close:hover {
  opacity: 1;
}

.picker-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px 20px;
}

/* 推荐模式的底部确定栏 */
.picker-footer {
  flex: 0 0 auto;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--glass-border);
}

.picker-confirm {
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-radius: 14px;
  background: #2c3e66;
  color: #fff;
  font-size: 0.92rem;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
}

.picker-confirm:hover:not(:disabled) {
  filter: brightness(1.1);
}

.picker-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.category + .category {
  margin-top: 8px;
}

/* 地图类型行：图标 + 名称 + 数量 + 展开箭头 */
.category-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  border-radius: 12px;
  background: var(--bg-secondary);
  color: var(--text-primary);
  font-size: 0.95rem;
  font-family: inherit;
  cursor: pointer;
  transition: 0.15s ease;
  box-shadow: inset 0 0 0 1px var(--glass-border);
}

.category-head:hover {
  background: #2c3e66;
  color: #fff;
}

.category-icon {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.category-name {
  flex: 1;
  min-width: 0;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.category-count {
  flex: 0 0 auto;
  font-size: 0.75rem;
  opacity: 0.7;
}

/* 投票阶段：类型名后面的汇总票数（橙色） */
.category-votes {
  flex: 0 0 auto;
  color: #ff9f1c;
  font-size: 0.78rem;
  font-weight: 700;
}

.category-arrow {
  flex: 0 0 auto;
  opacity: 0.8;
}

/* 3 × 3 地图列表 */
.map-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.map-card {
  position: relative;
  padding: 0;
  border: none;
  border-radius: 12px;
  overflow: hidden;
  aspect-ratio: 16 / 9;
  background: var(--bg-secondary);
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--glass-border);
  transition: 0.15s ease;
}

.map-card:hover {
  transform: translateY(-2px);
}

.map-card.selected {
  box-shadow: 0 0 0 3px #4dabf7;
}

.map-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 投票阶段：左上角显示当前票数 */
.map-votes {
  position: absolute;
  left: 6px;
  top: 6px;
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  /* 票数用橙色字体 */
  color: #ff9f1c;
  font-size: 0.72rem;
  font-weight: 700;
  pointer-events: none;
}

/* 图片右下角：透明黑色长椭圆底 + 白色类型图标 + 白色地图名 */
.map-label {
  position: absolute;
  right: 6px;
  bottom: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  max-width: calc(100% - 12px);
  padding: 2px 9px 2px 6px;
  /* 长椭圆底 */
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.55);
  backdrop-filter: blur(2px);
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  pointer-events: none;
}

.map-label-icon {
  flex: 0 0 auto;
  width: 15px;
  height: 15px;
  object-fit: contain;
  /* 任意颜色的 svg 统一转成白色，并略微上浮 */
  filter: brightness(0) invert(1);
  transform: translateY(-1px);
}
</style>
