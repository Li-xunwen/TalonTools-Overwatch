<template>
  <div class="join-play news-page">
    <ThemeToggle />
    <div class="content-area">
      <div class="top-tip-text">⚡游戏⚡</div>

      <!-- 修改后的 Minecraft 安装版面（原 coming-soon-section） -->
      <div class="section minecraft-section">
        <h2 class="section-title">⛏️ 我的世界 (Minecraft) 安装</h2>
        <div class="minecraft-content">
          <p>欢迎来到黑爪旗下的Minecraft！我们提供 <strong>Java版 1.21.4</strong>服务器。</p>
          <div class="button-group">
            <router-link to="/MinecraftHelp" class="mc-btn secondary">
              安装教程与下载链接
            </router-link>
            <a href="https://kook.vip/KWcZc1" target="_blank" rel="noopener noreferrer" class="mc-btn secondary">
             黑爪 Kook 语音频道 
            </a>
          </div>

          <!-- 服务器状态展示 -->
          <div class="server-status" v-if="serverStatus">
            <div class="status-header">
              <span class="status-dot" :class="serverStatus.online !== undefined ? (serverStatus.online ? 'online' : 'offline') : 'unknown'"></span>
              <span class="status-label">服务器状态</span>
              <span class="status-refresh" @click="fetchServerStatus">🔄</span>
            </div>
            <div v-if="serverStatus.error" class="status-error">{{ serverStatus.error }}</div>
            <div v-else>
              <div class="status-players">在线 {{ serverStatus.online }} / {{ serverStatus.max }} 人</div>
              <div class="status-motd">{{ serverStatus.motd }}</div>
              <div class="status-latency">延迟 {{ serverStatus.latency }}ms</div>
              <div v-if="serverStatus.players && serverStatus.players.length" class="status-player-list">
                <span v-for="p in serverStatus.players" :key="p.id" class="player-tag">{{ p.name }}</span>
              </div>
              <div v-else class="status-empty">暂无玩家在线</div>
            </div>
          </div>
          <div v-else class="server-status loading">⏳ 加载服务器状态...</div>
        </div>
      </div>

      <!-- 保留原有的近期动态区块，增加 Minecraft 相关动态 -->
      <div class="section">
        <h2 class="section-title">📢 近期动态 / 施工中</h2>
        <div class="test-elements-grid">
          <div class="test-element">🎉 你画我猜守望先锋</div>
          <div class="test-element">🚀 谁是守望先锋卧底</div>
          <div class="test-element">🏆 （江郎才尽了）</div>
          <div class="test-element">💎 （有生之年能做出新的功能吗）</div>
        </div>
      </div>
    </div>
    <BottomNav />
    <div class="footer-beian">
      <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
        {{ icpNumber }}
      </a>
      <span class="sep">|</span>
      <a href="https://www.beian.gov.cn/" target="_blank" rel="noopener noreferrer">
        {{ policeNumber }}
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import BottomNav from '@/components/BottomNav.vue'

const icpNumber = import.meta.env.VITE_ICP_NUMBER || "待备案";
const policeNumber = import.meta.env.VITE_POLICE_NUMBER || "办理中";

// 服务器状态数据
const serverStatus = ref<any>(null)
let refreshTimer: number | null = null

// 获取服务器状态（携带 token）
async function fetchServerStatus() {
  try {
    const token = localStorage.getItem('authToken')
    const res = await fetch('/api/minecraft/status', {
      headers: {
        'Authorization': token ? `Bearer ${token}` : ''
      }
    })

    if (res.status === 401) {
      serverStatus.value = { error: '请先登录查看服务器状态' }
      return
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: '请求失败' }))
      serverStatus.value = { error: err.error || '请求失败' }
      return
    }

    const data = await res.json()
    serverStatus.value = data // 包含 online, max, motd, latency, players
  } catch (e) {
    serverStatus.value = { error: '网络错误，请稍后重试' }
  }
}

onMounted(() => {
  fetchServerStatus()
  refreshTimer = window.setInterval(fetchServerStatus, 30000) // 每30秒刷新
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.news-page .content-area {
  padding-top: 20px;
}

/* 修改后的 Minecraft 版面样式 */
.minecraft-section {
  text-align: center;
  background: var(--card-bg);
  border-radius: 32px;
  padding: 40px 24px;
  margin: 20px 0;
  box-shadow: var(--shadow);
  transition: transform 0.2s;
}

.minecraft-subtitle {
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--accent, #42b983);
  margin-bottom: 24px;
  padding-bottom: 12px;
  border-bottom: 2px dashed var(--border-light, #e2e8f0);
  display: inline-block;
}

.minecraft-content p {
  font-size: 1rem;
  line-height: 1.6;
  color: var(--text-primary);
  margin: 16px 0;
}

.button-group {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 20px;
  margin: 32px 0 24px;
}

.mc-btn {
  display: inline-block;
  padding: 12px 28px;
  border-radius: 48px;
  font-weight: 700;
  text-decoration: none;
  transition: 0.2s ease;
  cursor: pointer;
  font-size: 1rem;
  border: none;
  background: none;
  font-family: inherit;
}

.mc-btn.primary {
  background: linear-gradient(135deg, #2c7a4d, #1e5a3a);
  color: white;
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.1);
}

.mc-btn.primary:hover {
  transform: translateY(-3px);
  filter: brightness(1.05);
  box-shadow: 0 12px 20px rgba(0, 0, 0, 0.15);
}

.mc-btn.secondary {
  background: #2c3e66;
  color: white;
}

.mc-btn.secondary:hover {
  background: #1f2c4b;
  transform: translateY(-2px);
}

.mc-btn.outline {
  background: transparent;
  border: 2px solid var(--accent, #42b983);
  color: var(--accent, #42b983);
}

.mc-btn.outline:hover {
  background: var(--accent, #42b983);
  color: white;
}

.notice {
  font-size: 0.85rem;
  color: var(--text-secondary, #5a6e8a);
  background: var(--bg-secondary, #f1f5f9);
  padding: 10px 16px;
  border-radius: 24px;
  display: inline-block;
  margin-top: 12px;
}

.inline-link {
  color: var(--accent, #42b983);
  text-decoration: underline;
  font-weight: 500;
}

.placeholder-icon {
  font-size: 64px;
  opacity: 0.7;
  margin-top: 30px;
  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
}

/* 原有近期动态样式保持不变并增强 */
.test-elements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.test-element {
  height: 100px;
  background: var(--accent, #42b983);
  color: var(--bg-primary, #ffffff);
  border-radius: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1rem;
  box-shadow: 0 5px 15px var(--shadow-color, rgba(0, 0, 0, 0.1));
  transition: all 0.3s ease;
  text-align: center;
  padding: 12px;
}

.test-element:hover {
  transform: translateY(-5px);
  box-shadow: 0 12px 25px var(--shadow-color, rgba(0, 0, 0, 0.15));
}

.top-tip-text {
  font-size: clamp(20px, 5vw, 36px);
  text-align: center;
  padding: 20px 0 10px;
  font-weight: bold;
  color: var(--text-primary);
  letter-spacing: 1px;
}

.section-title {
  font-size: 1.8rem;
  margin-bottom: 12px;
  color: var(--text-primary);
}

/* ========== 服务器状态样式 ========== */
.server-status {
  margin: 24px auto 0;
  max-width: 500px;
  background: var(--bg-secondary, #f1f5f9);
  border-radius: 24px;
  padding: 16px 20px;
  text-align: left;
  box-shadow: inset 0 0 0 1px var(--border-color, #e2e8f0);
}

.server-status.loading {
  text-align: center;
  opacity: 0.7;
}

.status-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}

.status-dot.online {
  background: #2ecc71;
  box-shadow: 0 0 6px #2ecc71;
}

.status-dot.offline {
  background: #e74c3c;
}

.status-dot.unknown {
  background: #f39c12;
}

.status-label {
  font-weight: 600;
  font-size: 1rem;
  color: var(--text-primary);
}

.status-refresh {
  margin-left: auto;
  cursor: pointer;
  opacity: 0.6;
  transition: 0.2s;
  font-size: 1.1rem;
}

.status-refresh:hover {
  opacity: 1;
  transform: rotate(60deg);
}

.status-error {
  color: #e74c3c;
  padding: 6px 0;
}

.status-players {
  font-weight: 600;
  font-size: 1.1rem;
  color: var(--text-primary);
}

.status-motd {
  font-size: 0.95rem;
  color: var(--text-secondary);
  background: var(--card-bg);
  padding: 6px 12px;
  border-radius: 20px;
  display: inline-block;
  margin: 6px 0;
}

.status-latency {
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin: 4px 0;
}

.status-player-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.player-tag {
  background: var(--accent, #42b983);
  color: white;
  padding: 2px 14px;
  border-radius: 30px;
  font-size: 0.85rem;
  font-weight: 500;
}

.status-empty {
  color: var(--text-muted);
  font-style: italic;
  margin-top: 6px;
}
</style>