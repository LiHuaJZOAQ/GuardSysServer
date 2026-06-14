<template>
  <div class="container py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h1>活动日志</h1>
      <router-link to="/" class="btn btn-outline-secondary btn-sm">返回仪表盘</router-link>
    </div>

    <div class="card p-3 mb-4">
      <div class="d-flex justify-content-between align-items-center">
        <div class="d-flex align-items-center gap-2">
          <label class="form-label mb-0">设备过滤</label>
          <select v-model="filterDevice" class="form-select form-select-sm" style="width:auto" @change="fetchLogs">
            <option value="">全部设备</option>
            <option v-for="d in devices" :key="d.id" :value="d.id">{{ d.id }}</option>
          </select>
        </div>
        <button class="btn btn-outline-primary btn-sm" @click="fetchLogs">刷新</button>
      </div>
    </div>

    <div class="card p-3">
      <div class="table-responsive">
        <table class="table table-hover">
          <thead>
            <tr>
              <th>时间</th>
              <th>设备</th>
              <th>温度</th>
              <th>湿度</th>
              <th>烟雾</th>
              <th>红外</th>
              <th>状态</th>
              <th>报警原因</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="log in logs" :key="log.id" :class="getRowClass(log)">
              <td>{{ formatTime(log.created_at) }}</td>
              <td><small>{{ log.device_id }}</small></td>
              <td>{{ log.temp ?? '--' }}°C</td>
              <td>{{ log.humi ?? '--' }}%</td>
              <td :class="getLevelClass(log.smoke, 100, 200)">{{ log.smoke ?? '--' }}ppm</td>
              <td>{{ log.ir ? '有人' : '无人' }}</td>
              <td><span :class="getStatusBadge(log.alarm)">{{ getAlarmText(log.alarm) }}</span></td>
              <td>{{ log.alarm_reason || '--' }}</td>
            </tr>
            <tr v-if="logs.length === 0">
              <td colspan="8" class="text-center text-muted py-4">暂无数据</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ActivityLog',
  data() {
    return {
      logs: [],
      devices: [],
      filterDevice: ''
    }
  },
  mounted() {
    this.fetchDevices()
    this.fetchLogs()
  },
  methods: {
    getAuthHeader() {
      const token = localStorage.getItem('token')
      return { 'Authorization': `Bearer ${token}` }
    },

    async fetchDevices() {
      try {
        const res = await fetch('/api/devices', { headers: this.getAuthHeader() })
        if (res.ok) this.devices = await res.json()
      } catch (e) {
        console.error(e)
      }
    },

    async fetchLogs() {
      try {
        let url = '/api/logs?limit=100'
        if (this.filterDevice) url += `&deviceId=${this.filterDevice}`
        const res = await fetch(url, { headers: this.getAuthHeader() })
        if (res.ok) this.logs = await res.json()
      } catch (e) {
        console.error(e)
      }
    },

    getRowClass(log) {
      if (log.alarm === 2) return 'table-danger'
      if (log.alarm === 1) return 'table-warning'
      return ''
    },

    getStatusBadge(alarm) {
      if (alarm === 2) return 'badge bg-danger'
      if (alarm === 1) return 'badge bg-warning text-dark'
      return 'badge bg-success'
    },

    getAlarmText(alarm) {
      const map = { 0: '正常', 1: '警告', 2: '报警' }
      return map[alarm] ?? '未知'
    },

    getLevelClass(val, warn, danger) {
      if (val === undefined || val === null) return ''
      if (val >= danger) return 'text-danger fw-bold'
      if (val >= warn) return 'text-warning fw-bold'
      return ''
    },

    formatTime(timeStr) {
      if (!timeStr) return '--'
      return new Date(timeStr).toLocaleString()
    }
  }
}
</script>
