<template>
  <div class="container py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h1>GuardSys 监控系统</h1>
      <div>
        <span class="me-3">欢迎, {{ username }}</span>
        <button class="btn btn-outline-secondary btn-sm" @click="logout">登出</button>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-4">
      <span :class="connectionStatus === 'connected' ? 'text-success' : 'text-danger'">
        {{ connectionStatus === 'connected' ? '● 已连接' : '● 未连接' }}
      </span>
    </div>

    <div class="row mb-4">
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">设备在线</div>
          <div class="sensor-value">{{ onlineDevices }}/{{ totalDevices }}</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">温度</div>
          <div class="sensor-value" :class="getTempClass(latestData.temp)">
            {{ latestData.temp || '--' }}<span class="sensor-unit">°C</span>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">湿度</div>
          <div class="sensor-value">{{ latestData.humi || '--' }}<span class="sensor-unit">%</span></div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">烟雾</div>
          <div class="sensor-value" :class="getSmokeClass(latestData.smoke)">
            {{ latestData.smoke || '--' }}
          </div>
        </div>
      </div>
    </div>

    <div class="row mb-4">
      <div class="col-md-6">
        <div class="card p-3">
          <h5>设备列表</h5>
          <div class="table-responsive">
            <table class="table table-hover">
              <thead>
                <tr>
                  <th>设备ID</th>
                  <th>状态</th>
                  <th>最后在线</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="device in devices" :key="device.id">
                  <td>{{ device.id }}</td>
                  <td>
                    <span :class="device.online ? 'status-online' : 'status-offline'">
                      {{ device.online ? '在线' : '离线' }}
                    </span>
                  </td>
                  <td>{{ formatTime(device.last_seen) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="col-md-6">
        <div class="card p-3">
          <h5>控制面板</h5>
          <div class="mb-3">
            <label class="form-label">选择设备</label>
            <select v-model="selectedDevice" class="form-select">
              <option value="">请选择设备</option>
              <option v-for="device in onlineDevicesList" :key="device.id" :value="device.id">
                {{ device.id }}
              </option>
            </select>
          </div>
          <div class="mb-3">
            <label class="form-label">报警模式</label>
            <div class="btn-group w-100">
              <button 
                class="btn" 
                :class="currentAlarm === 0 ? 'btn-success' : 'btn-outline-secondary'"
                @click="setAlarm(0)"
              >正常</button>
              <button 
                class="btn" 
                :class="currentAlarm === 1 ? 'btn-warning' : 'btn-outline-secondary'"
                @click="setAlarm(1)"
              >警告</button>
              <button 
                class="btn" 
                :class="currentAlarm === 2 ? 'btn-danger' : 'btn-outline-secondary'"
                @click="setAlarm(2)"
              >报警</button>
            </div>
          </div>
          <div class="mb-3">
            <button class="btn btn-primary w-100" @click="triggerCollect">
              立即采集传感器数据
            </button>
          </div>
          <div v-if="controlMessage" class="alert alert-info">{{ controlMessage }}</div>
        </div>
      </div>
    </div>

    <div class="card p-3">
      <h5>历史数据 (最近24小时)</h5>
      <canvas ref="chartCanvas" height="100"></canvas>
    </div>
  </div>
</template>

<script>
import { io } from 'socket.io-client'
import { Chart, registerables } from 'chart.js'
import { useRouter } from 'vue-router'

Chart.register(...registerables)

export default {
  name: 'Dashboard',
  data() {
    return {
      socket: null,
      connectionStatus: 'disconnected',
      devices: [],
      latestData: {},
      selectedDevice: '',
      currentAlarm: 0,
      controlMessage: '',
      chart: null,
      historyData: [],
      username: localStorage.getItem('username') || ''
    }
  },
  setup() {
    const router = useRouter()
    return { router }
  },
  computed: {
    totalDevices() {
      return this.devices.length
    },
    onlineDevices() {
      return this.devices.filter(d => d.online).length
    },
    onlineDevicesList() {
      return this.devices.filter(d => d.online)
    }
  },
  mounted() {
    this.initSocket()
    this.fetchDevices()
    this.initChart()
  },
  beforeUnmount() {
    if (this.socket) {
      this.socket.disconnect()
    }
    if (this.chart) {
      this.chart.destroy()
    }
  },
  methods: {
    logout() {
      localStorage.removeItem('token')
      localStorage.removeItem('username')
      this.router.push('/login')
    },

    getAuthHeader() {
      const token = localStorage.getItem('token')
      return { 'Authorization': `Bearer ${token}` }
    },

    initSocket() {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling']
      })

      this.socket.on('connect', () => {
        this.connectionStatus = 'connected'
      })

      this.socket.on('disconnect', () => {
        this.connectionStatus = 'disconnected'
      })

      this.socket.on('sensor:data', (data) => {
        this.latestData = data
        this.historyData.push(data)
        if (this.historyData.length > 100) {
          this.historyData.shift()
        }
        this.updateChart()
      })

      this.socket.on('device:online', ({ deviceId, online }) => {
        const device = this.devices.find(d => d.id === deviceId)
        if (device) {
          device.online = online
        } else {
          this.fetchDevices()
        }
      })
    },

    async fetchDevices() {
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
      try {
        const res = await fetch(`${serverUrl}/api/devices`, {
          headers: this.getAuthHeader()
        })
        
        if (res.status === 401 || res.status === 403) {
          this.logout()
          return
        }

        this.devices = await res.json()

        if (this.devices.length > 0) {
          const latestRes = await fetch(`${serverUrl}/api/devices/${this.devices[0].id}/latest`, {
            headers: this.getAuthHeader()
          })
          const latest = await latestRes.json()
          if (latest) {
            this.latestData = {
              temp: latest.temp,
              humi: latest.humi,
              smoke: latest.smoke,
              ir: latest.ir,
              alarm: latest.alarm
            }
            this.currentAlarm = latest.alarm || 0
          }
          this.fetchHistory()
        }
      } catch (e) {
        console.error('Failed to fetch devices:', e)
      }
    },

    async fetchHistory() {
      if (!this.devices.length) return
      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
      try {
        const res = await fetch(`${serverUrl}/api/devices/${this.devices[0].id}/history?hours=24`, {
          headers: this.getAuthHeader()
        })
        this.historyData = await res.json()
        this.updateChart()
      } catch (e) {
        console.error('Failed to fetch history:', e)
      }
    },

    async setAlarm(value) {
      if (!this.selectedDevice) {
        this.controlMessage = '请先选择设备'
        setTimeout(() => this.controlMessage = '', 3000)
        return
      }

      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
      try {
        const res = await fetch(`${serverUrl}/api/devices/${this.selectedDevice}/control`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...this.getAuthHeader()
          },
          body: JSON.stringify({ action: 'setAlarm', value })
        })
        const result = await res.json()
        if (result.success) {
          this.currentAlarm = value
          this.controlMessage = '报警模式已设置'
        } else {
          this.controlMessage = '设置失败: ' + result.error
        }
      } catch (e) {
        this.controlMessage = '设置失败: ' + e.message
      }
      setTimeout(() => this.controlMessage = '', 3000)
    },

    async triggerCollect() {
      if (!this.selectedDevice) {
        this.controlMessage = '请先选择设备'
        setTimeout(() => this.controlMessage = '', 3000)
        return
      }

      const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:3000'
      try {
        const res = await fetch(`${serverUrl}/api/devices/${this.selectedDevice}/control`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            ...this.getAuthHeader()
          },
          body: JSON.stringify({ action: 'collect' })
        })
        const result = await res.json()
        this.controlMessage = result.success ? '采集命令已发送' : '发送失败: ' + result.error
      } catch (e) {
        this.controlMessage = '发送失败: ' + e.message
      }
      setTimeout(() => this.controlMessage = '', 3000)
    },

    initChart() {
      this.$nextTick(() => {
        const ctx = this.$refs.chartCanvas?.getContext('2d')
        if (!ctx) return

        this.chart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: [],
            datasets: [
              { label: '温度 (°C)', data: [], borderColor: '#ff6384', yAxisID: 'y' },
              { label: '湿度 (%)', data: [], borderColor: '#36a2eb', yAxisID: 'y' },
              { label: '烟雾', data: [], borderColor: '#ff9f40', yAxisID: 'y1' }
            ]
          },
          options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
              y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: { display: true, text: '温度/湿度' }
              },
              y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: { display: true, text: '烟雾' },
                grid: { drawOnChartArea: false }
              }
            }
          }
        })
      })
    },

    updateChart() {
      if (!this.chart) return

      const labels = this.historyData.map(d => new Date(d.created_at).toLocaleTimeString())

      this.chart.data.labels = labels
      this.chart.data.datasets[0].data = this.historyData.map(d => d.temp)
      this.chart.data.datasets[1].data = this.historyData.map(d => d.humi)
      this.chart.data.datasets[2].data = this.historyData.map(d => d.smoke)
      this.chart.update()
    },

    getTempClass(temp) {
      if (!temp) return ''
      if (temp >= 40) return 'text-danger'
      if (temp >= 35) return 'text-warning'
      return ''
    },

    getSmokeClass(smoke) {
      if (smoke === undefined || smoke === null) return ''
      if (smoke >= 200) return 'text-danger'
      if (smoke >= 100) return 'text-warning'
      return ''
    },

    formatTime(timeStr) {
      if (!timeStr) return '--'
      return new Date(timeStr).toLocaleString()
    }
  }
}
</script>

<style scoped>
.sensor-value { font-size: 2rem; font-weight: bold; color: #333; }
.sensor-unit { font-size: 1rem; color: #666; }
.status-online { color: #28a745; }
.status-offline { color: #dc3545; }
</style>
