<template>
  <div class="login-container">
    <div class="login-card">
      <h2 class="text-center mb-4">GuardSys 监控系统</h2>
      <form @submit.prevent="handleLogin">
        <div class="mb-3">
          <label class="form-label">用户名</label>
          <input v-model="username" type="text" class="form-control" required />
        </div>
        <div class="mb-3">
          <label class="form-label">密码</label>
          <input v-model="password" type="password" class="form-control" required />
        </div>
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <button type="submit" class="btn btn-primary w-100" :disabled="loading">
          {{ loading ? '登录中...' : '登录' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import { io } from 'socket.io-client'
import { useRouter } from 'vue-router'

export default {
  name: 'Login',
  data() {
    return {
      username: '',
      password: '',
      error: '',
      loading: false
    }
  },
  setup() {
    const router = useRouter()
    return { router }
  },
  mounted() {
    const token = localStorage.getItem('token')
    if (token) {
      this.verifyToken(token)
    }
  },
  methods: {
    async handleLogin() {
      this.error = ''
      this.loading = true

      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

      try {
        const res = await fetch(`${serverUrl}/api/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.username,
            password: this.password
          })
        })

        const data = await res.json()

        if (!res.ok) {
          this.error = data.error || '登录失败'
          return
        }

        localStorage.setItem('token', data.token)
        localStorage.setItem('username', data.username)

        this.router.push('/')
      } catch (e) {
        this.error = '网络错误，请检查服务器连接'
      } finally {
        this.loading = false
      }
    },

    async verifyToken(token) {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'

      try {
        const res = await fetch(`${serverUrl}/api/auth/verify`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })

        if (res.ok) {
          this.router.push('/')
        } else {
          localStorage.removeItem('token')
          localStorage.removeItem('username')
        }
      } catch (e) {
        localStorage.removeItem('token')
        localStorage.removeItem('username')
      }
    }
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}

.login-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.1);
  width: 100%;
  max-width: 400px;
}
</style>
