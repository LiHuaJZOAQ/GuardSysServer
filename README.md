# GuardSys 服务端

OpenHarmony 北向监控系统的云端服务端，负责接收设备传感器数据、存储历史记录、推送报警通知、为 Web 前端提供实时数据与远程控制 API。

## 项目结构

```
GuardSysServer/
├── server/                        # 后端 (Express + Socket.io + SQLite)
│   ├── index.js                   # 服务端入口（单文件）
│   ├── test.js                    # 集成测试
│   ├── railway.json               # Railway 部署配置
│   └── package.json
├── web/                           # 前端 (Vue 3 + Vite)
│   ├── src/
│   │   ├── App.vue                # 根组件 (<router-view>)
│   │   ├── main.js                # 入口 + 路由
│   │   ├── components/
│   │   │   ├── Login.vue          # 登录/注册页
│   │   │   └── Dashboard.vue      # 仪表盘（实时数据 + 控制面板 + 图表）
│   │   └── views/
│   │       └── ActivityLog.vue    # 活动日志页
│   ├── index.html
│   ├── vite.config.js             # Vite 配置（含开发代理）
│   └── package.json
├── docs/                          # 文档
│   ├── appintegration.md          # 鸿蒙 APP 对接说明
│   ├── test.md                    # 测试说明
│   └── spec/                      # 设计文档
├── .github/workflows/
│   └── test.yml                   # CI: 服务端集成测试
├── AGENTS.md                      # AI 辅助说明
└── README.md
```

---

## TCP 通信协议

设备通过 **TCP 端口 3001** 连接服务器，JSON 以 `\n` 换行符分隔，支持单次连接发送多条数据。

### 设备上报

```json
{"type":"report","temp":"25.3","humi":"60.1","smoke":12.34,"ir":true,"alarm":0}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `type` | string | 固定 `"report"` |
| `temp` | string | 温度（如 `"25.3"`） |
| `humi` | string | 湿度（如 `"60.1"`） |
| `smoke` | number | 烟雾浓度（ppm） |
| `ir` | bool | 红外有人 `true`/`false` |
| `alarm` | number | 报警模式：0=正常，1=警告，2=报警 |
| `rssi` | number | WiFi 信号强度（可选） |

服务器应答：`{"success":true}`

### 红外布防/撤防

设备可在运行时切换布防状态并同步到服务器：

```json
{"type":"arm","value":1}
```

- `value=1` 布防：红外有人自动触发设备端报警
- `value=0` 撤防：红外仅记录日志

服务器存储布防状态并推送给 Web 前端（Socket.io 事件 `device:arm`）。

### 控制指令（服务器 → 设备）

通过 REST API `POST /api/devices/:id/control` 下发：

```json
{"type":"cmd","action":"setAlarm","value":1}
```

| action | value | 说明 |
|--------|-------|------|
| `setAlarm` | 0/1/2 | 设置报警模式 |
| `collect` | (无) | 触发设备立即采集一次传感器数据 |
| `arm` | 0/1 | 远程布防/撤防 |

### 心跳

设备每 30s 发送心跳保持连接：

```json
{"type":"ping"}
```

服务器不回复心跳，断线 5 分钟后自动标记设备离线。

---

## 报警逻辑

传感器数据入库时自动计算 `alarm_reason`，跟随报警等级输出对应原因。

| 报警等级 | 条件 | alarm_reason |
|----------|------|-------------|
| **报警 (2)** | `smoke >= 200` | 烟雾过高 |
| | `ir==true && (smoke>=100 \|\| temp>=40)` | 人员未撤离 |
| | `humi >= 80` | 湿度过高 |
| | `humi <= 20` | 湿度过低 |
| | 以上均不匹配 | 入侵报警 |
| **警告 (1)** | `smoke >= 100` | 烟雾偏高 |
| | `temp >= 40` | 温度过高 |
| | `humi >= 80` | 湿度过高 |
| | `humi <= 20` | 湿度过低 |
| **正常 (0)** | `smoke >= 50 \|\| temp >= 35` | 数值偏高 |
| | `humi >= 70 \|\| humi <= 30` | 湿度异常 |
| | `ir == true` | 有人活动 |

### ServerChan 推送

当满足以下任一条件时，通过 ServerChan 推送微信通知（一天一台设备仅推一次）：

- `smoke >= 200`
- `temp >= 40`
- `humi >= 80` 或 `humi <= 20`
- `alarm >= 2`

需要配置环境变量 `SCKEY`。

---

## 数据库

SQLite 数据库 `guardsys.db`，包含以下表：

| 表名 | 说明 |
|------|------|
| `users` | 用户账号（默认 admin / admin123） |
| `devices` | 设备信息（含在线状态、布防状态） |
| `sensor_logs` | 传感器历史记录（保留 7 天） |
| `push_logs` | 推送日志（防重复） |

---

## API 接口

所有 REST API 统一前缀 `/api`，认证接口除外均需 `Authorization: Bearer <token>` 请求头。认证失败返回 `401 Unauthorized` 或 `403 Forbidden`。

### REST

| 方法 | 路径 | 认证 | 说明 |
|------|------|:----:|------|
| POST | `/api/auth/register` | — | 注册账号 |
| POST | `/api/auth/login` | — | 登录获取 JWT |
| GET | `/api/auth/verify` | Bearer | 验证 token |
| GET | `/api/devices` | Bearer | 设备列表 |
| GET | `/api/devices/:id/latest` | Bearer | 设备最新数据 |
| GET | `/api/devices/:id/history?hours=24` | Bearer | 设备历史数据 |
| POST | `/api/devices/:id/control` | Bearer | 设备控制指令 |
| GET | `/api/logs?limit=50&deviceId=` | Bearer | 传感器日志 |

#### `POST /api/auth/register`

注册新用户。

```json
// Request
{"username":"admin","password":"240be518..."}
// Response 200
{"success":true}
// Response 400
{"error":"用户名已存在"}
```

#### `POST /api/auth/login`

登录获取 JWT token（有效期 24 小时）。

```json
// Request
{"username":"admin","password":"240be518..."}
// Response 200
{"token":"eyJhbGciOiJIUzI1NiIs...","username":"admin"}
// Response 401
{"error":"用户名或密码错误"}
```

#### `GET /api/auth/verify`

验证当前 token 是否有效。

```json
// Response 200
{"username":"admin"}
// Response 401
{"error":"未登录"}
```

#### `GET /api/devices`

获取所有设备列表，按最后在线时间倒序。

```json
// Response 200
[
  {
    "id": "::ffff:123.45.67.89:54321",
    "name": "Device-::ffff:123.45.67.89:54321",
    "connected_at": "2026-06-14T08:00:00.000Z",
    "last_seen": "2026-06-14T08:05:00.000Z",
    "online": 1,
    "armed": 1
  }
]
```

#### `GET /api/devices/:id/latest`

获取指定设备最新一条传感器数据。

```json
// Response 200
{
  "id": 128,
  "device_id": "::ffff:123.45.67.89:54321",
  "temp": 25.3,
  "humi": 60.1,
  "smoke": 45,
  "ir": 0,
  "alarm": 0,
  "rssi": -65,
  "alarm_reason": null,
  "created_at": "2026-06-14T08:05:00.000Z"
}
```

#### `GET /api/devices/:id/history?hours=24`

查询设备历史数据，默认最近 24 小时，最多 1000 条。支持 `hours` 参数调整时间范围。

```json
// Response 200
[{"id":128,"temp":25.3,...},{"id":127,"temp":25.1,...}]
```

#### `POST /api/devices/:id/control`

向设备发送控制指令。设备在线时通过 TCP 转发，同时通过 Socket.io 广播 `device:command` 事件。
 
```json
// Request
{"action":"setAlarm","value":1}
// Response 200
{"success":true}
// Response 400
{"error":"Device offline"}
```

| action | value | 说明 |
|--------|-------|------|
| `setAlarm` | 0 / 1 / 2 | 设置报警模式：正常 / 警告 / 报警 |
| `collect` | 不传 | 触发设备立即采集一次传感器数据 |
| `arm` | 0 / 1 | 远程撤防 / 布防 |

#### `GET /api/logs?limit=50&deviceId=`

查询传感器日志记录，支持分页和设备过滤。

| 参数 | 默认 | 说明 |
|------|------|------|
| `limit` | 50 | 返回条数上限 |
| `deviceId` | 全部 | 按设备 ID 过滤 |

```json
// Response 200
[{"id":128,"device_id":"...","temp":25.3,"alarm":0,"alarm_reason":null,...}]
```

### Socket.io 事件

Web 前端通过 Socket.io 连接（需传入 `auth: { token }`）接收实时推送：

```js
// 前端连接示例
const socket = io({ auth: { token: 'eyJhbGciOiJ...' } })
```

| 事件 | 方向 | payload | 说明 |
|------|:----:|---------|------|
| `sensor:data` | 服务 → 前端 | `{deviceId, temp, humi, smoke, ir, alarm, rssi, alarmReason, timestamp}` | 传感器实时数据 |
| `device:online` | 服务 → 前端 | `{deviceId, online: bool}` | 设备上线/离线 |
| `device:command` | 服务 → 前端 | `{deviceId, action, value}` | 控制指令已下发 |
| `device:arm` | 服务 → 前端 | `{deviceId, armed: bool}` | 布防/撤防状态变化 |

---

## 部署指南

### 系统架构

```
南向设备(开发板)  -->  TCP:3001  -->  Railway服务器
                                          |
                                          v
                                    Socket.io
                                          |
                                          v
                                     Vue3 前端  -->  Vercel
```

### 部署步骤

#### 1. 部署后端 (Railway)

1. 注册 Railway 账号: https://railway.app （使用 GitHub 登录）
2. 创建新项目: "New Project" -> "Deploy from GitHub repo"
3. 选择你的 GitHub 仓库（或先推送 server 目录）
4. 在 Railway 控制台添加环境变量:
   - `SCKEY`: Server酱的 SCKEY（可选，用于报警推送）
   - `PORT`: 3000
   - `TCP_PORT`: 3001
5. 部署完成后，获取 Railway 分配的域名

> Railway 部署时会自动安装依赖并构建前端（`postinstall` 触发 `web/` 的 `npm install && npm run build`），访问 Railway 域名即可同时使用 API 和前端页面，**无需单独部署前端**。

#### 2. 部署前端 (Vercel)

1. 注册 Vercel 账号: https://vercel.com （使用 GitHub 登录）
2. 导入 GitHub 仓库
3. 配置:
   - Root Directory: `web`
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. 部署完成后获取前端域名

#### 3. 配置南向设备

修改 GuardSysAPP 中的服务器地址为 Railway 分配的域名:

在 `entry/src/main/ets/pages/TCPClient.ets` 中找到:
```typescript
const SERVER_HOST = 'your-server.com';  // 修改为 Railway 域名
const SERVER_PORT = 3001;
```

#### 4. 配置 Server酱 报警推送

1. 访问 https://sct.ftqq.com/
2. 注册账号并获取 SCKEY
3. 在 Railway 后台添加环境变量 `SCKEY`

### 本地开发

#### 后端
```bash
cd server
npm install
npm run dev
```

#### 前端
```bash
cd web
npm install
npm run dev
```

### 功能说明

1. **实时监控**: 页面自动显示温湿度、烟雾、红外状态
2. **设备控制**: 选择设备后可设置报警模式
3. **报警推送**: 当烟雾>=200 或 温度>=40 时自动推送微信通知
4. **历史数据**: 显示24小时历史曲线

### 故障排查

1. 设备无法连接: 检查服务器域名是否正确，TCP端口是否开放
2. 前端无法连接: 确认后端已正确启动，前端使用相对路径 (`/api/...`) 无需额外配置；如前后端分离部署请配置 Vite 代理
3. 推送失败: 检查 SCKEY 是否正确配置
