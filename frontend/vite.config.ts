import { defineConfig, mergeConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()
const apiProxyTarget = process.env.API_PROXY_TARGET

const defaultConfig = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: 5173,           // 默认 Vite 端口
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
      },
    },
  },
})

// 尝试加载本地配置文件（如果存在）
let localConfig = {}
const localConfigPath = path.resolve(__dirname, 'vite.config.local.ts')
if (fs.existsSync(localConfigPath)) {
  try {
    const localModule = await import(localConfigPath)
    localConfig = localModule.default || localModule
  } catch (e) {
    console.warn('加载本地配置失败，忽略:', e)
  }
}

export default mergeConfig(defaultConfig, localConfig)
