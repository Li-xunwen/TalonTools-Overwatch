import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'

const routes = [
  {
    path: '/',
    name: 'Login',
    component: LoginView,
    meta: { requiresAuth: false },
  },
  {
    path: '/main',
    name: 'Main',
    component: () => import('../views/MainView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/news',
    name: 'News',
    component: () => import('../views/NewsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/profile',
    name: 'Profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true },
  }

]

// 先创建 router 实例
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

// 导航守卫：检查是否需要登录
router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth) {
    const token = localStorage.getItem('authToken')
    const expiresAt = localStorage.getItem('tokenExpiresAt')

    // 检查 Token 是否存在且未过期
    if (!token || !expiresAt || Date.now() > parseInt(expiresAt)) {
      // Token 无效或已过期，清除本地存储
      localStorage.removeItem('authToken')
      localStorage.removeItem('tokenExpiresAt')

      // 跳转到登录页
      next('/')
      return
    }
  }

  // Token 有效或不需要认证，正常放行
  next()
})

export default router