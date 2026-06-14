import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import Login from './components/Login.vue'
import Dashboard from './components/Dashboard.vue'
import ActivityLog from './views/ActivityLog.vue'
import App from './App.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login },
    { path: '/', component: Dashboard },
    { path: '/logs', component: ActivityLog }
  ]
})

router.beforeEach((to) => {
  const token = localStorage.getItem('token')
  if (to.path !== '/login' && !token) {
    return '/login'
  }
})

const app = createApp(App)
app.use(router)
app.mount('#app')
