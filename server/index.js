const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Database = require('better-sqlite3');
const schedule = require('node-schedule');
const cors = require('cors');
const net = require('net');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../web/dist')));

const PORT = process.env.PORT || 3000;
const TCP_PORT = process.env.TCP_PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'guardsys-secret-key-change-in-production';

const db = new Database('guardsys.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    name TEXT,
    connected_at DATETIME,
    last_seen DATETIME,
    online INTEGER DEFAULT 0,
    armed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sensor_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    temp REAL,
    humi REAL,
    smoke REAL,
    ir INTEGER,
    alarm INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (device_id) REFERENCES devices(id)
  );

  CREATE TABLE IF NOT EXISTS push_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT,
    push_type TEXT,
    pushed_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

try { db.exec(`ALTER TABLE sensor_logs ADD COLUMN rssi REAL DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE sensor_logs ADD COLUMN alarm_reason TEXT DEFAULT NULL`); } catch (e) {}
try { db.exec(`ALTER TABLE devices ADD COLUMN armed INTEGER DEFAULT 0`); } catch (e) {}

const defaultUser = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!defaultUser) {
  const hashedPassword = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run('admin', hashedPassword);
  console.log('Default user created: admin / admin123');
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未登录' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token无效' });
    }
    req.user = user;
    next();
  });
}

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: '用户名已存在' });
  }

  const hashedPassword = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, hashedPassword);
  res.json({ success: true });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  if (!bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, username: user.username });
});

app.get('/api/auth/verify', authenticateToken, (req, res) => {
  res.json({ username: req.user.username });
});

const deviceConnections = new Map();

const TCP_SERVER = net.createServer((socket) => {
  const deviceId = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`Device connected: ${deviceId}`);

  deviceConnections.set(deviceId, socket);

  const existingDevice = db.prepare('SELECT id FROM devices WHERE id = ?').get(deviceId);
  if (existingDevice) {
    db.prepare('UPDATE devices SET connected_at = ?, last_seen = ?, online = 1 WHERE id = ?')
      .run(new Date().toISOString(), new Date().toISOString(), deviceId);
  } else {
    db.prepare('INSERT INTO devices (id, name, connected_at, last_seen, online) VALUES (?, ?, ?, ?, 1)')
      .run(deviceId, `Device-${deviceId}`, new Date().toISOString(), new Date().toISOString());
  }

  io.emit('device:online', { deviceId, online: true });

  socket.on('data', (data) => {
    try {
      const jsonStr = data.toString().trim();
      const lines = jsonStr.split('\n');

      lines.forEach(line => {
        if (!line.trim()) return;
        const parsed = JSON.parse(line);
        handleDeviceData(deviceId, parsed, socket);
      });
    } catch (e) {
      console.error('Parse error:', e.message);
      socket.write(JSON.stringify({ error: 'Invalid JSON' }) + '\n');
    }
  });

  socket.on('close', () => {
    console.log(`Device disconnected: ${deviceId}`);
    deviceConnections.delete(deviceId);
    db.prepare('UPDATE devices SET online = 0, last_seen = ? WHERE id = ?')
      .run(new Date().toISOString(), deviceId);
    io.emit('device:online', { deviceId, online: false });
  });

  socket.on('error', (err) => {
    console.error(`Socket error for ${deviceId}:`, err.message);
  });
});

function computeAlarmReason(data) {
  const reasons = [];
  const smoke = parseFloat(data.smoke);
  const temp = parseFloat(data.temp);
  const humi = parseFloat(data.humi);
  const alarm = parseInt(data.alarm);
  const ir = Boolean(data.ir);

  if (alarm === 2) {
    if (smoke >= 200) reasons.push('烟雾过高');
    if (ir && (smoke >= 100 || temp >= 40)) reasons.push('人员未撤离');
    if (humi >= 80) reasons.push('湿度过高');
    if (humi <= 20) reasons.push('湿度过低');
    if (reasons.length === 0) reasons.push('入侵报警');
  } else if (alarm === 1) {
    if (smoke >= 100) reasons.push('烟雾偏高');
    if (temp >= 40) reasons.push('温度过高');
    if (humi >= 80) reasons.push('湿度过高');
    if (humi <= 20) reasons.push('湿度过低');
  } else if (alarm === 0) {
    if (smoke >= 50 || temp >= 35) reasons.push('数值偏高');
    if (humi >= 70 || humi <= 30) reasons.push('湿度异常');
    if (ir) reasons.push('有人活动');
  }
  return reasons.length > 0 ? reasons.join(' + ') : null;
}

function handleDeviceData(deviceId, data, socket) {
  if (data.type === 'arm') {
    const armed = data.value ? 1 : 0;
    db.prepare('UPDATE devices SET armed = ? WHERE id = ?').run(armed, deviceId);
    io.emit('device:arm', { deviceId, armed: Boolean(armed) });
    console.log(`Device ${deviceId} ${armed ? 'armed' : 'disarmed'}`);
    socket.write(JSON.stringify({ success: true }) + '\n');
    return;
  }

  if (data.type === 'report') {
    const { temp, humi, smoke, ir, alarm, rssi } = data;
    const alarmReason = computeAlarmReason(data);

    db.prepare(`
      INSERT INTO sensor_logs (device_id, temp, humi, smoke, ir, alarm, rssi, alarm_reason)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(deviceId, temp, humi, smoke, ir ? 1 : 0, alarm, rssi || null, alarmReason);

    db.prepare('UPDATE devices SET last_seen = ? WHERE id = ?')
      .run(new Date().toISOString(), deviceId);

    const deviceData = {
      deviceId,
      temp: parseFloat(temp),
      humi: parseFloat(humi),
      smoke: parseFloat(smoke),
      ir: Boolean(ir),
      alarm: parseInt(alarm),
      rssi: rssi || null,
      alarmReason,
      timestamp: new Date().toISOString()
    };

    io.emit('sensor:data', deviceData);
    socket.write(JSON.stringify({ success: true }) + '\n');

    checkAlarmConditions(deviceId, deviceData);
  }
}

function checkAlarmConditions(deviceId, data) {
  const smokeThreshold = 200;
  const tempThreshold = 40;
  const humiHigh = 80;
  const humiLow = 20;

  const shouldPush = data.smoke >= smokeThreshold ||
    data.temp >= tempThreshold ||
    data.humi >= humiHigh ||
    data.humi <= humiLow ||
    data.alarm >= 2;

  const pushedToday = db.prepare(`
    SELECT COUNT(*) as count FROM push_logs
    WHERE device_id = ? AND push_type = 'alarm'
    AND DATE(pushed_at) = DATE('now')
  `).get(deviceId);

  if (shouldPush && pushedToday.count === 0) {
    sendServerChanAlarm(data);
    db.prepare('INSERT INTO push_logs (device_id, push_type) VALUES (?, ?)')
      .run(deviceId, 'alarm');
  }
}

function sendServerChanAlarm(data) {
  const SCKEY = process.env.SCKEY;
  if (!SCKEY) {
    console.log('Server酱 SCKEY not configured, skipping push');
    return;
  }

  const title = '⚠️ GuardSys 报警提醒';
  const content = `温度: ${data.temp}°C\n湿度: ${data.humi}%\n烟雾: ${data.smoke}\n状态: ${getAlarmStatus(data.alarm)}`;

  fetch(`https://sctapi.ftqq.com/${SCKEY}.send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content })
  }).then(res => res.json())
    .then(json => console.log('Server酱推送结果:', json))
    .catch(err => console.error('Server酱推送失败:', err));
}

function getAlarmStatus(alarm) {
  const statusMap = { 0: '正常', 1: '警告', 2: '报警' };
  return statusMap[alarm] || '未知';
}

app.get('/api/devices', authenticateToken, (req, res) => {
  const devices = db.prepare('SELECT * FROM devices ORDER BY last_seen DESC').all();
  res.json(devices);
});

app.get('/api/devices/:id/latest', authenticateToken, (req, res) => {
  const latest = db.prepare(`
    SELECT * FROM sensor_logs
    WHERE device_id = ?
    ORDER BY created_at DESC LIMIT 1
  `).get(req.params.id);
  res.json(latest || {});
});

app.get('/api/devices/:id/history', authenticateToken, (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const history = db.prepare(`
    SELECT * FROM sensor_logs
    WHERE device_id = ? AND created_at >= datetime('now', '-' || ? || ' hours')
    ORDER BY created_at DESC
    LIMIT 1000
  `).all(req.params.id, hours);
  res.json(history);
});

app.post('/api/devices/:id/control', authenticateToken, (req, res) => {
  const { action, value } = req.body;
  const deviceId = req.params.id;
  const socket = deviceConnections.get(deviceId);

  if (!socket) {
    return res.status(400).json({ error: 'Device offline' });
  }

  const cmd = JSON.stringify({ type: 'cmd', action, value }) + '\n';
  socket.write(cmd);

  io.emit('device:command', { deviceId, action, value });

  if (action === 'arm') {
    const armed = value ? 1 : 0;
    db.prepare('UPDATE devices SET armed = ? WHERE id = ?').run(armed, deviceId);
    io.emit('device:arm', { deviceId, armed: Boolean(armed) });
  }

  res.json({ success: true });
});

app.get('/api/logs', authenticateToken, (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const deviceId = req.query.deviceId || null;
  let sql = `SELECT * FROM sensor_logs`;
  const params = [];
  if (deviceId) {
    sql += ` WHERE device_id = ?`;
    params.push(deviceId);
  }
  sql += ` ORDER BY created_at DESC LIMIT ?`;
  params.push(limit);
  res.json(db.prepare(sql).all(...params));
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../web/dist/index.html'));
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('未登录'));
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return next(new Error('Token无效'));
    socket.user = user;
    next();
  });
});

io.on('connection', (socket) => {
  console.log(`Web client connected: ${socket.user.username}`);

  socket.on('disconnect', () => {
    console.log(`Web client disconnected: ${socket.user.username}`);
  });
});

schedule.scheduleJob('0 * * * *', () => {
  db.prepare(`
    UPDATE devices SET online = 0
    WHERE online = 1 AND last_seen < datetime('now', '-5 minutes')
  `).run();

  const offlineDevices = db.prepare('SELECT id FROM devices WHERE online = 0').all();
  offlineDevices.forEach(d => {
    io.emit('device:online', { deviceId: d.id, online: false });
  });
});

db.prepare("DELETE FROM sensor_logs WHERE created_at < datetime('now', '-7 days')").run();

TCP_SERVER.listen(TCP_PORT, () => {
  console.log(`TCP Server listening on port ${TCP_PORT}`);
});

server.listen(PORT, () => {
  console.log(`HTTP Server listening on port ${PORT}`);
});
