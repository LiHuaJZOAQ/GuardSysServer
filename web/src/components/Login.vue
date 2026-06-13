<template>
  <div class="login-container">
    <div class="login-card">
      <h2 class="text-center mb-4">GuardSys 监控系统</h2>

      <ul class="nav nav-pills nav-justified mb-4">
        <li class="nav-item">
          <button class="nav-link" :class="tab === 'login' ? 'active' : ''" @click="tab = 'login'">登录</button>
        </li>
        <li class="nav-item">
          <button class="nav-link" :class="tab === 'register' ? 'active' : ''" @click="tab = 'register'">注册</button>
        </li>
      </ul>

      <form @submit.prevent="tab === 'login' ? handleLogin() : handleRegister()">
        <div class="mb-3">
          <label class="form-label">用户名</label>
          <input v-model="username" type="text" class="form-control" required />
        </div>
        <div class="mb-3">
          <label class="form-label">密码</label>
          <input v-model="password" type="password" class="form-control" required minlength="6" />
        </div>
        <div v-if="error" class="alert alert-danger">{{ error }}</div>
        <div v-if="success" class="alert alert-success">{{ success }}</div>
        <button type="submit" class="btn btn-primary w-100" :disabled="loading">
          {{ loading ? '处理中...' : tab === 'login' ? '登录' : '注册' }}
        </button>
      </form>
    </div>
  </div>
</template>

<script>
import { useRouter } from 'vue-router'

export default {
  name: 'Login',
  data() {
    return {
      tab: 'login',
      username: '',
      password: '',
      error: '',
      success: '',
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

      try {
        const res = await fetch('/api/auth/login', {
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

    async handleRegister() {
      this.error = ''
      this.success = ''
      this.loading = true

      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: this.username,
            password: this.password
          })
        })

        const data = await res.json()

        if (!res.ok) {
          this.error = data.error || '注册失败'
          return
        }

        this.success = '注册成功，请登录'
        this.tab = 'login'
        this.password = ''
      } catch (e) {
        this.error = '网络错误，请检查服务器连接'
      } finally {
        this.loading = false
      }
    },

    async verifyToken(token) {
      try {
        const res = await fetch('/api/auth/verify', {
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
