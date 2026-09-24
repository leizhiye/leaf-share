const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    const safeName = base.replace(/[^\w\u4e00-\u9fa5\-.]/g, '_').slice(0, 80) || 'file';
    const id = crypto.randomBytes(4).toString('hex');
    cb(null, `${Date.now()}_${id}_${safeName}${ext}`);
  },
});
const upload = multer({ storage });

const LOG_DIR = path.join(__dirname, 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const HISTORY_FILE = path.join(LOG_DIR, 'history.jsonl');

let sessionPath = null;
const allHistory = [];

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function loadHistory() {
  allHistory.length = 0;
  if (fs.existsSync(HISTORY_FILE)) {
    try {
      const lines = fs.readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const m = JSON.parse(line);
          if (m && m.type && m.ts) allHistory.push(m);
        } catch {}
      }
    } catch {}
  }
}

function mergeOrphanSessions() {
  try {
    const files = fs.readdirSync(LOG_DIR).filter((f) => /^session_.*\.jsonl$/.test(f));
    for (const f of files) {
      const p = path.join(LOG_DIR, f);
      const data = fs.readFileSync(p, 'utf8');
      if (data) fs.appendFileSync(HISTORY_FILE, data);
      fs.unlinkSync(p);
      console.log(`  已合并遗留会话日志: ${f}`);
    }
  } catch (err) {
    console.error('  合并遗留日志失败:', err.message);
  }
}

function startSession() {
  mergeOrphanSessions();
  loadHistory();
  sessionPath = path.join(LOG_DIR, `session_${timestamp()}.jsonl`);
  fs.writeFileSync(sessionPath, '');
  console.log(`  本次会话日志: ${path.basename(sessionPath)}`);
}

function logMessage(packet) {
  allHistory.push(packet);
  if (sessionPath) {
    try { fs.appendFileSync(sessionPath, JSON.stringify(packet) + '\n'); } catch {}
  }
}

function mergeSessionToHistory() {
  if (!sessionPath || !fs.existsSync(sessionPath)) return;
  try {
    const data = fs.readFileSync(sessionPath, 'utf8');
    if (data) fs.appendFileSync(HISTORY_FILE, data);
    fs.unlinkSync(sessionPath);
    console.log(`  会话日志已合并到: ${path.basename(HISTORY_FILE)}`);
  } catch (err) {
    console.error('  合并日志失败:', err.message);
  }
}

const clients = new Map();

function deviceList() {
  return Array.from(clients.values()).map((c) => ({
    id: c.id,
    name: c.name,
    platform: c.platform,
  }));
}

function broadcast(message, exclude) {
  const data = JSON.stringify(message);
  for (const ws of clients.keys()) {
    if (ws !== exclude && ws.readyState === ws.OPEN) ws.send(data);
  }
}

function sendTo(ws, message) {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}

function findClientById(id) {
  for (const [ws, c] of clients) {
    if (c.id === id) return ws;
  }
  return null;
}

wss.on('connection', (ws) => {
  let device = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case 'hello': {
        device = {
          id: msg.id || crypto.randomBytes(4).toString('hex'),
          name: (msg.name || '未命名设备').slice(0, 50),
          platform: msg.platform || 'unknown',
        };
        clients.set(ws, device);
        sendTo(ws, { type: 'welcome', id: device.id });
        sendTo(ws, { type: 'history', messages: allHistory.slice(-500) });
        broadcast({ type: 'devices', list: deviceList() });
        break;
      }

      case 'chat': {
        if (!device) return;
        const text = String(msg.text || '').trim();
        if (!text) return;
        const packet = {
          type: 'chat',
          from: device.id,
          fromName: device.name,
          text: text.slice(0, 2000),
          ts: Date.now(),
        };
        if (msg.to) packet.to = msg.to;
        logMessage(packet);
        if (msg.to) {
          const target = findClientById(msg.to);
          if (target) sendTo(target, packet);
        } else {
          broadcast(packet, ws);
        }
        break;
      }

      case 'clipboard': {
        if (!device) return;
        const text = String(msg.text || '');
        if (!text) return;
        const packet = {
          type: 'clipboard',
          from: device.id,
          fromName: device.name,
          text: text.slice(0, 50000),
          ts: Date.now(),
        };
        if (msg.to) packet.to = msg.to;
        logMessage(packet);
        if (msg.to) {
          const target = findClientById(msg.to);
          if (target) sendTo(target, packet);
        } else {
          broadcast(packet, ws);
        }
        break;
      }

      case 'file': {
        if (!device) return;
        const packet = {
          type: 'file',
          from: device.id,
          fromName: device.name,
          fileId: msg.fileId,
          name: msg.name,
          size: msg.size,
          ts: Date.now(),
        };
        if (msg.to) packet.to = msg.to;
        logMessage(packet);
        if (msg.to) {
          const target = findClientById(msg.to);
          if (target) sendTo(target, packet);
        } else {
          broadcast(packet, ws);
        }
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    if (device) {
      clients.delete(ws);
      broadcast({ type: 'devices', list: deviceList() });
    }
  });

  ws.on('error', () => {});
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: '未收到文件' });
    return;
  }
  res.json({
    fileId: req.file.filename,
    name: req.file.originalname,
    size: req.file.size,
    url: `/api/download/${encodeURIComponent(req.file.filename)}`,
  });
});

app.get('/api/download/:fileId', (req, res) => {
  const fileId = req.params.fileId;
  if (!/^[\w.\-]+$/.test(fileId)) {
    res.status(400).send('非法文件标识');
    return;
  }
  const filePath = path.join(UPLOAD_DIR, fileId);
  if (!fs.existsSync(filePath)) {
    res.status(404).send('文件不存在或已被移除');
    return;
  }
  res.download(filePath);
});

app.get('/api/hostname', (req, res) => {
  res.json({ hostname: os.hostname(), platform: os.platform() });
});

app.use(express.static(path.join(__dirname, 'public')));

server.listen(PORT, '0.0.0.0', () => {
  startSession();
  console.log('===================================');
  console.log('  局域网传输工具已启动');
  console.log('===================================');
  console.log(`  本机访问: http://localhost:${PORT}`);

  const VIRTUAL_RE = /vmware|virtualbox|hyper-v|vethernet|virtual|radmin|vpn|loopback|docker|wsl|tap|tun|hamachi|zerotier|tailscale|bluetooth/i;
  const nets = os.networkInterfaces();
  const lanAddrs = [];
  for (const name of Object.keys(nets)) {
    const virtual = VIRTUAL_RE.test(name);
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !virtual) {
        lanAddrs.push(net.address);
      }
    }
  }

  if (lanAddrs.length > 0) {
    console.log('  局域网访问（手机/其他设备用这个）:');
    for (const addr of lanAddrs) {
      console.log(`    http://${addr}:${PORT}`);
    }
  } else {
    console.log('  未检测到局域网地址，请检查网络连接');
  }
  console.log('===================================');
  console.log('  其他设备需与本机连接同一 WiFi/局域网');
  console.log('  按 Ctrl+C 停止服务（会话日志会自动合并保存）');
  console.log('===================================');
});

wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('===================================');
    console.log('  启动失败：端口已被占用');
    console.log('  通常是因为上一个服务窗口未完全关闭');
    console.log('  请关闭所有旧的服务窗口，然后重新运行');
    console.log('===================================');
    process.exit(1);
  } else {
    throw err;
  }
});

let shuttingDown = false;
function cleanupAndExit(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  try {
    console.log('\n正在保存并合并日志...');
    mergeSessionToHistory();
  } catch {}
  server.close(() => process.exit(code));
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => cleanupAndExit(0));
process.on('SIGTERM', () => cleanupAndExit(0));

if (process.stdin.isTTY) {
  process.stdin.resume();
  process.stdin.on('end', () => cleanupAndExit(0));
  process.stdin.on('close', () => cleanupAndExit(0));
}