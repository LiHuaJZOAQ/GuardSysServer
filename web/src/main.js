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

const app = createApp(App)
app.use(router)
app.mount('#app')
