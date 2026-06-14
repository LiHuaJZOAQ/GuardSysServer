<template>
  <div class="container py-4">
    <div class="d-flex justify-content-between align-items-center mb-4">
      <h1>GuardSys 监控系统</h1>
      <div class="d-flex align-items-center gap-2">
        <span class="me-3">欢迎, {{ username }}</span>
        <router-link to="/logs" class="btn btn-outline-info btn-sm">活动日志</router-link>
        <button class="btn btn-outline-secondary btn-sm" @click="logout">登出</button>
      </div>
    </div>

    <div class="d-flex justify-content-between align-items-center mb-4">
      <span :class="connectionStatus === 'connected' ? 'text-success' : 'text-danger'">
        {{ connectionStatus === 'connected' ? '● 已连接' : '● 未连接' }}
      </span>
      <div class="d-flex align-items-center gap-2">
        <label class="form-label mb-0 text-muted" style="font-size:0.85rem">刷新频率</label>
        <select v-model.number="refreshRate" class="form-select form-select-sm" style="width:auto" @change="changeRefreshRate">
          <option :value="2">2s</option>
          <option :value="5">5s</option>
          <option :value="10">10s</option>
          <option :value="30">30s</option>
        </select>
      </div>
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
          <div class="sensor-value" :class="getLevelClass(latestData.temp, 35, 40)">
            {{ latestData.temp ?? '--' }}<span class="sensor-unit">°C</span>
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">湿度</div>
          <div class="sensor-value">{{ latestData.humi ?? '--' }}<span class="sensor-unit">%</span></div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">烟雾</div>
          <div class="sensor-value" :class="getLevelClass(latestData.smoke, 100, 200)">
            {{ latestData.smoke ?? '--' }}<span class="sensor-unit">ppm</span>
          </div>
        </div>
      </div>
    </div>

    <div class="row mb-4">
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">红外</div>
          <div class="sensor-value" :class="latestData.ir ? 'ir-active' : 'text-muted'">
            {{ latestData.ir === undefined ? '--' : latestData.ir ? '● 有人' : '○ 无人' }}
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">WiFi 信号</div>
          <div class="sensor-value" :class="getRssiClass(latestData.rssi)">
            {{ latestData.rssi !== undefined && latestData.rssi !== null ? formatRssi(latestData.rssi) : '--' }}
          </div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3" :class="getAlarmCardClass(latestData.alarm)">
          <div class="text-muted">报警状态</div>
          <div class="sensor-value">{{ getAlarmText(latestData.alarm) }}</div>
          <div v-if="latestData.alarmReason" class="small mt-1">{{ latestData.alarmReason }}</div>
          <button v-if="latestData.alarm && latestData.alarm > 0 && selectedDevice" class="btn btn-sm btn-outline-danger mt-2" @click="dismissAlarm">
            撤销报警
          </button>
        </div>
      </div>
      <div class="col-md-3">
        <div class="card text-center p-3">
          <div class="text-muted">报警模式</div>
          <div class="sensor-value">{{ getAlarmModeText(currentAlarm) }}</div>
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
                  <th>选择</th>
                  <th>设备ID</th>
                  <th>状态</th>
                  <th>最后在线</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="device in devices" :key="device.id"
                    :class="selectedDevice === device.id ? 'table-active' : ''"
                    style="cursor:pointer" @click="selectDevice(device.id)">
                  <td>
                    <input type="radio" :checked="selectedDevice === device.id" @change="selectDevice(device.id)" />
                  </td>
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
      username: localStorage.getItem('username') || '',
      refreshTimer: null,
      refreshRate: 5
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
  watch: {
    selectedDevice(id) {
      if (id) {
        this.fetchLatest()
        this.fetchHistory()
      } else {
        this.latestData = {}
        this.historyData = []
        this.currentAlarm = 0
        this.updateChart()
      }
    }
  },
  mounted() {
    this.initSocket()
    this.fetchDevices()
    this.initChart()
    this.startRefreshTimer()
  },
  beforeUnmount() {
    this.clearRefreshTimer()
    if (this.socket) this.socket.disconnect()
    if (this.chart) this.chart.destroy()
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

    selectDevice(id) {
      this.selectedDevice = id
    },

    startRefreshTimer() {
      this.refreshTimer = setInterval(() => {
        if (this.selectedDevice) {
          this.fetchLatest()
        }
      }, this.refreshRate * 1000)
    },

    clearRefreshTimer() {
      if (this.refreshTimer) {
        clearInterval(this.refreshTimer)
        this.refreshTimer = null
      }
    },

    changeRefreshRate() {
      this.clearRefreshTimer()
      this.startRefreshTimer()
    },

    initSocket() {
      const token = localStorage.getItem('token')
      this.socket = io({
        auth: { token },
        transports: ['websocket', 'polling']
      })

      this.socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message)
        this.connectionStatus = 'disconnected'
      })

      this.socket.on('connect', () => {
        this.connectionStatus = 'connected'
      })

      this.socket.on('disconnect', () => {
        this.connectionStatus = 'disconnected'
      })

      this.socket.on('sensor:data', (data) => {
        if (!this.selectedDevice || data.deviceId === this.selectedDevice) {
          this.latestData = data
          this.currentAlarm = data.alarm ?? 0
        }
        this.historyData.push(data)
        if (this.historyData.length > 200) this.historyData.shift()
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

      this.socket.on('device:arm', ({ deviceId, armed }) => {
        const device = this.devices.find(d => d.id === deviceId)
        if (device) device.armed = armed ? 1 : 0
        if (this.selectedDevice === deviceId) {
          this.currentAlarm = armed ? 1 : 0
        }
      })
    },

    async fetchDevices() {
      try {
        const res = await fetch('/api/devices', { headers: this.getAuthHeader() })
        if (res.status === 401 || res.status === 403) { this.logout(); return }
        this.devices = await res.json()
        if (!this.selectedDevice && this.devices.length > 0) {
          this.selectedDevice = this.devices[0].id
        }
      } catch (e) {
        console.error('Failed to fetch devices:', e)
      }
    },

    async fetchLatest() {
      if (!this.selectedDevice) return
      try {
        const res = await fetch(`/api/devices/${this.selectedDevice}/latest`, { headers: this.getAuthHeader() })
        const latest = await res.json()
        if (latest && latest.id) {
          this.latestData = {
            temp: latest.temp,
            humi: latest.humi,
            smoke: latest.smoke,
            ir: latest.ir,
            alarm: latest.alarm,
            rssi: latest.rssi,
            alarmReason: latest.alarm_reason
          }
          this.currentAlarm = latest.alarm ?? 0
        }
      } catch (e) {
        console.error('Failed to fetch latest:', e)
      }
    },

    async fetchHistory() {
      if (!this.selectedDevice) return
      try {
        const res = await fetch(`/api/devices/${this.selectedDevice}/history?hours=24`, { headers: this.getAuthHeader() })
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
      try {
        const res = await fetch(`/api/devices/${this.selectedDevice}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
          body: JSON.stringify({ action: 'setAlarm', value })
        })
        const result = await res.json()
        this.controlMessage = result.success ? '报警模式已设置' : '设置失败: ' + result.error
      } catch (e) {
        this.controlMessage = '设置失败: ' + e.message
      }
      setTimeout(() => this.controlMessage = '', 3000)
    },

    async dismissAlarm() {
      if (!this.selectedDevice) return
      try {
        const res = await fetch(`/api/devices/${this.selectedDevice}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
          body: JSON.stringify({ action: 'setAlarm', value: 0 })
        })
        const result = await res.json()
        if (result.success) {
          this.currentAlarm = 0
          this.latestData = { ...this.latestData, alarm: 0, alarmReason: null }
          this.controlMessage = '报警已撤销'
        } else {
          this.controlMessage = '撤销失败: ' + result.error
        }
      } catch (e) {
        this.controlMessage = '撤销失败: ' + e.message
      }
      setTimeout(() => this.controlMessage = '', 3000)
    },

    async triggerCollect() {
      if (!this.selectedDevice) {
        this.controlMessage = '请先选择设备'
        setTimeout(() => this.controlMessage = '', 3000)
        return
      }
      try {
        const res = await fetch(`/api/devices/${this.selectedDevice}/control`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...this.getAuthHeader() },
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
          data: { labels: [], datasets: [
            { label: '温度 (°C)', data: [], borderColor: '#ff6384', yAxisID: 'y' },
            { label: '湿度 (%)', data: [], borderColor: '#36a2eb', yAxisID: 'y' },
            { label: '烟雾', data: [], borderColor: '#ff9f40', yAxisID: 'y1' }
          ]},
          options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            scales: {
              y: { type: 'linear', display: true, position: 'left', title: { display: true, text: '温度/湿度' } },
              y1: { type: 'linear', display: true, position: 'right', title: { display: true, text: '烟雾' }, grid: { drawOnChartArea: false } }
            }
          }
        })
      })
    },

    updateChart() {
      if (!this.chart) return
      this.chart.data.labels = this.historyData.map(d => new Date(d.created_at || d.timestamp).toLocaleTimeString())
      this.chart.data.datasets[0].data = this.historyData.map(d => d.temp)
      this.chart.data.datasets[1].data = this.historyData.map(d => d.humi)
      this.chart.data.datasets[2].data = this.historyData.map(d => d.smoke)
      this.chart.update()
    },

    getLevelClass(val, warn, danger) {
      if (val === undefined || val === null) return ''
      if (val >= danger) return 'text-danger'
      if (val >= warn) return 'text-warning'
      return ''
    },

    getRssiClass(rssi) {
      if (rssi === undefined || rssi === null) return ''
      if (rssi >= -60) return 'text-success'
      if (rssi >= -80) return 'text-warning'
      return 'text-danger'
    },

    getAlarmCardClass(alarm) {
      if (alarm === 2) return 'alarm-danger'
      if (alarm === 1) return 'alarm-warning'
      return ''
    },

    getAlarmText(alarm) {
      const map = { 0: '正常', 1: '警告', 2: '报警' }
      return map[alarm] ?? '--'
    },

    getAlarmModeText(alarm) {
      const map = { 0: '正常', 1: '警告', 2: '报警' }
      return alarm !== undefined ? map[alarm] ?? '未知' : '--'
    },

    formatRssi(rssi) {
      if (rssi >= -50) return '强'
      if (rssi >= -70) return '中'
      return '弱'
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
.ir-active { color: #dc3545; }
.alarm-danger { border-left: 4px solid #dc3545; }
.alarm-warning { border-left: 4px solid #ffc107; }
</style>
