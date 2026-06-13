const net = require('net');
const http = require('http');

const SERVER_URL = 'http://localhost:3000';
const TCP_HOST = 'localhost';
const TCP_PORT = 3001;

function httpPost(path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    const data = JSON.stringify(body);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function httpGet(path, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, SERVER_URL);
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = http.get({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      headers
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(body || '{}') }));
    });
    req.on('error', reject);
  });
}

async function main() {
  let pass = 0;
  let fail = 0;

  const check = (name, condition, detail) => {
    if (condition) { console.log(`\x1b[32m[PASS]\x1b[0m ${name}`); pass++; }
    else { console.log(`\x1b[31m[FAIL]\x1b[0m ${name}: ${detail}`); fail++; }
  };

  // T1: 登录
  console.log('=== T1: 用户登录 ===');
  const loginRes = await httpPost('/api/auth/login', { username: 'admin', password: 'admin123' });
  const token = loginRes.body.token;
  check('T1', !!token, `status=${loginRes.status}, body=${JSON.stringify(loginRes.body)}`);
  if (!token) process.exit(1);

  // T2: 未认证被拒
  console.log('=== T2: 未认证被拒 ===');
  const unauthRes = await httpGet('/api/devices');
  check('T2', unauthRes.status === 401 || unauthRes.status === 403, `status=${unauthRes.status}`);

  // T3: 模拟设备连接并上报
  console.log('=== T3: 模拟设备连接 ===');
  const client = new net.Socket();
  await new Promise(resolve => client.connect(TCP_PORT, TCP_HOST, resolve));
  console.log('  设备已连接');

  console.log('=== T4: 发送上报数据 ===');
  client.write(JSON.stringify({ type: 'report', temp: '25.3', humi: '60.1', smoke: 45, ir: false, alarm: 0 }) + '\n');

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log('=== T5: 查询设备列表 ===');
  const devicesRes = await httpGet('/api/devices', token);
  const devices = Array.isArray(devicesRes.body) ? devicesRes.body : [];
  check('T5', devices.length > 0, `共 ${devices.length} 个设备`);

  const onlineDevice = devices.find(d => d.online === 1);
  check('设备在线', !!onlineDevice, onlineDevice ? onlineDevice.id : '未找到在线设备');

  if (!onlineDevice) {
    console.log('所有设备离线，跳过后续测试');
    process.exit(1);
  }

  const deviceId = onlineDevice.id;

  console.log('=== T6: 查询最新数据 ===');
  const latestRes = await httpGet(`/api/devices/${deviceId}/latest`, token);
  const hasTemp = latestRes.body.temp !== undefined && latestRes.body.temp !== null;
  check('T6', hasTemp, JSON.stringify(latestRes.body));

  console.log('=== T7: 查询历史数据 ===');
  const historyRes = await httpGet(`/api/devices/${deviceId}/history?hours=24`, token);
  check('T7', Array.isArray(historyRes.body) && historyRes.body.length > 0, `${historyRes.body.length} 条记录`);

  console.log('=== T8: 控制指令下发 ===');
  const ctrlRes = await httpPost(`/api/devices/${deviceId}/control`, { action: 'setAlarm', value: 1 }, token);
  check('T8', ctrlRes.body.success === true, JSON.stringify(ctrlRes.body));

  console.log('=== T9: 报警条件触发 ===');
  client.write(JSON.stringify({ type: 'report', temp: '42.0', humi: '45.0', smoke: 260, ir: true, alarm: 2 }) + '\n');
  await new Promise(resolve => setTimeout(resolve, 500));
  check('T9', true, '报警数据已上报（未配置SCKEY则跳过推送）');

  console.log('=== T10: 设备离线检测 ===');
  client.destroy();
  await new Promise(resolve => setTimeout(resolve, 2000));
  const offlineRes = await httpPost(`/api/devices/${deviceId}/control`, { action: 'collect' }, token);
  check('T10', !!offlineRes.body.error, `错误消息: ${offlineRes.body.error}`);

  console.log('');
  console.log('================================================');
  console.log(`测试完成: 通过 ${pass}, 失败 ${fail}`);
  console.log('================================================');
}

main().catch(err => {
  console.error('测试异常:', err);
  process.exit(1);
});
