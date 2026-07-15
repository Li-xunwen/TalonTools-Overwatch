import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import dotenv from 'dotenv'
import fs from 'fs'

dotenv.config()

const apiProxyTarget = process.env.API_PROXY_TARGET
const serverPort = parseInt(process.env.VITE_SERVER_PORT || '5173', 10)
const enableHttps = process.env.VITE_ENABLE_HTTPS === 'true'
const sslKeyPath = process.env.SSL_KEY_PATH
const sslCertPath = process.env.SSL_CERT_PATH

let httpsConfig = undefined
if (enableHttps && sslKeyPath && sslCertPath) {
  try {
    httpsConfig = {
      key: fs.readFileSync(sslKeyPath, 'utf8'),
      cert: fs.readFileSync(sslCertPath, 'utf8'),
    }
  } catch (err) {
    console.warn('读取 SSL 证书文件失败，将使用 HTTP:', err)
    httpsConfig = undefined
  }
} else if (enableHttps) {
  console.warn('已设置 VITE_ENABLE_HTTPS=true 但未提供 SSL_KEY_PATH 或 SSL_CERT_PATH，将使用 HTTP')
}

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  },
  server: {
    host: '0.0.0.0',
    port: serverPort,
    https: httpsConfig,
    proxy: {
      '/api': {
        target: apiProxyTarget,
        changeOrigin: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            if (req.headers['x-real-ip']) {
              proxyReq.setHeader('X-Real-IP', req.headers['x-real-ip'])
            }
            if (req.headers['x-forwarded-for']) {
              proxyReq.setHeader('X-Forwarded-For', req.headers['x-forwarded-for'])
            }
            if (req.headers['x-forwarded-proto']) {
              proxyReq.setHeader('X-Forwarded-Proto', req.headers['x-forwarded-proto'])
            }
          })
        }
      },
      // Markdown 中的 /resource/users/{author_id}/xxx.png → 重写为 /users/xxx → 代理到后端
      '/resource': {
        target: apiProxyTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/resource/, ''),
      }
    }
  }
})
