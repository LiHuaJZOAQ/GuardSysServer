import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import Login from './components/Login.vue'
import App from './App.vue'

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/login', component: Login },
    { path: '/', component: App }
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
