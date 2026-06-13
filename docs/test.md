# 服务器功能测试文档

## 前置条件

1. 服务器已启动（`cd server && node index.js`）
2. 环境已安装 Node.js

## 一键测试

```bash
cd server && node test.js
```

输出 `9/9 通过` 即服务器功能完备。

## 测试覆盖

| 编号 | 测试项 | 说明 |
|------|--------|------|
| T1 | 用户登录 | admin/admin123 获取 JWT token |
| T2 | 未认证拦截 | 无 token 访问返回 401 |
| T3 | 设备 TCP 连接 | 模拟设备建立 TCP 连接 |
| T4 | 数据上报 | 发送 report JSON 到服务器 |
| T5 | 设备列表查询 | 认证后查询设备信息 |
| T6 | 最新数据查询 | 查询单个设备最新传感器数据 |
| T7 | 历史数据查询 | 查询 24 小时内数据记录 |
| T8 | 控制指令下发 | 向在线设备发送 setAlarm 指令 |
| T9 | 报警条件触发 | 高温/高烟数据触发推送 |
| T10 | 离线设备处理 | 设备断开后控制指令返回错误 |

## 单步验证

如需手动逐项验证，使用以下命令：

```bash
# 1. 登录
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

# 2. 模拟设备上报（用 Node.js 临时连接）
node -e "
const net=require('net');
const c=new net.Socket();
c.connect(3001,'localhost',()=>{
  c.write(JSON.stringify({type:'report',temp:'25.3',humi:'60.1',smoke:45,ir:false,alarm:0})+'\n');
  setTimeout(()=>c.destroy(),500);
});
"

# 3. 查看数据
curl -s http://localhost:3000/api/devices -H "Authorization: Bearer $TOKEN"
```
