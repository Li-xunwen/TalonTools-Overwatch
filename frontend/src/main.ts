import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { useTheme } from './composables/useTheme'
import "./style/theme.css";

// 挂载前先把主题定下来：任何页面（包括没有主题按钮的页面）刷新后都能保持上次的模式，
// 同时避免先渲染浅色再切深色的闪烁
useTheme().initTheme()

createApp(App).use(router).mount('#app')
