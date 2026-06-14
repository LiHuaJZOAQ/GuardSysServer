# GuardSys Web Monitor 部署指南

## 系统架构

```
南向设备(开发板)  -->  TCP:3001  -->  Railway服务器
                                          |
                                          v
                                    Socket.io
                                          |
                                          v
                                     Vue3 前端  -->  Vercel
```

## 部署步骤

### 1. 部署后端 (Railway)

1. 注册 Railway 账号: https://railway.app （使用 GitHub 登录）
2. 创建新项目: "New Project" -> "Deploy from GitHub repo"
3. 选择你的 GitHub 仓库（或先推送 server 目录）
4. 在 Railway 控制台添加环境变量:
   - `SCKEY`: Server酱的 SCKEY（可选，用于报警推送）
   - `PORT`: 3000
   - `TCP_PORT`: 3001
5. 部署完成后，获取 Railway 分配的域名

> Railway 部署时会自动安装依赖并构建前端（`postinstall` 触发 `web/` 的 `npm install && npm run build`），访问 Railway 域名即可同时使用 API 和前端页面，**无需单独部署前端**。

### 2. 部署前端 (Vercel)

1. 注册 Vercel 账号: https://vercel.com （使用 GitHub 登录）
2. 导入 GitHub 仓库
3. 配置:
   - Root Directory: `web`
   - Build Command: `npm run build`
   - Output Directory: `dist`
 4. 部署完成后获取前端域名

### 3. 配置南向设备

修改 GuardSysAPP 中的服务器地址为 Railway 分配的域名:

在 `entry/src/main/ets/pages/TCPClient.ets` 中找到:
```typescript
const SERVER_HOST = 'your-server.com';  // 修改为 Railway 域名
const SERVER_PORT = 3001;
```

### 4. 配置 Server酱 报警推送

1. 访问 https://sct.ftqq.com/
2. 注册账号并获取 SCKEY
3. 在 Railway 后台添加环境变量 `SCKEY`

## 本地开发

### 后端
```bash
cd server
npm install
npm run dev
```

### 前端
```bash
cd web
npm install
npm run dev
```

## 功能说明

1. **实时监控**: 页面自动显示温湿度、烟雾、红外状态
2. **设备控制**: 选择设备后可设置报警模式
3. **报警推送**: 当烟雾>=200 或 温度>=40 时自动推送微信通知
4. **历史数据**: 显示24小时历史曲线

## 故障排查

1. 设备无法连接: 检查服务器域名是否正确，TCP端口是否开放
2. 前端无法连接: 确认后端已正确启动，前端使用相对路径 (`/api/...`) 无需额外配置；如前后端分离部署请配置 Vite 代理
3. 推送失败: 检查 SCKEY 是否正确配置
