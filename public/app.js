(function () {
  'use strict';

  const ALL_KEY = '__all__';

  const I18N = {
    zh: {
      app_title: '局域网传输',
      app_logo: '📡 局域网传输',
      conn_status: '连接状态',
      device_name_label: '我的设备名',
      device_name_placeholder: '未命名设备',
      menu: '菜单',
      drop_hint: '松开以发送文件',
      input_placeholder: '输入消息…（Enter 发送，Shift+Enter 换行）',
      btn_file: '📎 文件',
      btn_file_title: '发送文件',
      btn_clip: '📋 剪贴板',
      btn_clip_title: '把输入内容作为剪贴板文本发送，对方会自动复制',
      btn_send: '发送',
      everyone: '所有人',
      group: '群聊',
      no_devices: '暂无其他在线设备',
      device: '设备',
      online: '在线',
      offline: '离线',
      empty_tip: '还没有消息，开始交流吧',
      clip_self: '📋 剪贴板文本',
      clip_received: '📋 剪贴板文本，已自动复制',
      sent: '已发送',
      download: '下载',
      clipboard_received: '收到「{name}」的剪贴板文本',
      not_connected: '尚未连接服务器',
      input_required: '请先在输入框填写要发送的文本',
      upload_failed: '上传失败',
      upload_error: '上传出错，请重试',
      me: '我',
      android_phone: '安卓手机',
      android_tablet: '安卓平板',
      iphone: 'iPhone',
      ipad: 'iPad',
      windows_pc: 'Windows 电脑',
      mac_pc: 'Mac 电脑',
      linux_device: 'Linux 设备',
    },
    en: {
      app_title: 'LAN Transfer',
      app_logo: '📡 LAN Transfer',
      conn_status: 'Connection status',
      device_name_label: 'Device name',
      device_name_placeholder: 'Unnamed device',
      menu: 'Menu',
      drop_hint: 'Release to send files',
      input_placeholder: 'Type a message… (Enter to send, Shift+Enter for newline)',
      btn_file: '📎 File',
      btn_file_title: 'Send a file',
      btn_clip: '📋 Clipboard',
      btn_clip_title: 'Send the input as clipboard text, auto-copied on the other device',
      btn_send: 'Send',
      everyone: 'Everyone',
      group: 'Group',
      no_devices: 'No other devices online',
      device: 'Device',
      online: 'Online',
      offline: 'Offline',
      empty_tip: 'No messages yet, start chatting',
      clip_self: '📋 Clipboard text',
      clip_received: '📋 Clipboard text, auto-copied',
      sent: 'Sent',
      download: 'Download',
      clipboard_received: 'Clipboard received from {name}',
      not_connected: 'Not connected to server',
      input_required: 'Enter text first',
      upload_failed: 'Upload failed',
      upload_error: 'Upload error, please retry',
      me: 'Me',
      android_phone: 'Android phone',
      android_tablet: 'Android tablet',
      iphone: 'iPhone',
      ipad: 'iPad',
      windows_pc: 'Windows PC',
      mac_pc: 'Mac',
      linux_device: 'Linux device',
    },
  };

  function resolveInitialLang() {
    const urlLang = new URLSearchParams(location.search).get('lang');
    if (urlLang === 'zh' || urlLang === 'en') {
      localStorage.setItem('lang', urlLang);
      return urlLang;
    }
    const saved = localStorage.getItem('lang');
    if (saved === 'zh' || saved === 'en') return saved;
    return (navigator.language && navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en');
  }

  let lang = resolveInitialLang();

  function t(key, params) {
    let s = I18N[lang][key] || I18N.zh[key] || key;
    if (params) {
      for (const k in params) s = s.replace('{' + k + '}', params[k]);
    }
    return s;
  }

  function applyLang() {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
    document.querySelectorAll('[data-i18n]').forEach((el) => {
      const key = el.getAttribute('data-i18n');
      el.textContent = key === 'lang_switch' ? (lang === 'zh' ? 'EN' : '中文') : t(key);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((el) => {
      el.title = t(el.getAttribute('data-i18n-title'));
    });
    renderDevices();
    renderMessages();
  }

  function setLang(l) {
    if (l === lang) return;
    lang = l;
    localStorage.setItem('lang', l);
    applyLang();
  }

  let myId = localStorage.getItem('deviceId');
  if (!myId) { myId = genId(); localStorage.setItem('deviceId', myId); }
  let myName = localStorage.getItem('deviceName') || '';

  let target = ALL_KEY;
  let ws = null;
  let connected = false;
  let reconnectTimer = null;
  let devices = [];
  let resolvedName = '';
  const conversations = { [ALL_KEY]: [] };

  function genId() {
    return Math.random().toString(16).slice(2, 6) + Math.random().toString(16).slice(2, 6);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB';
  }
  function formatTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function fileIcon(name) {
    const ext = (name.split('.').pop() || '').toLowerCase();
    const map = {
      jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️',
      mp4: '🎬', mov: '🎬', avi: '🎬', mkv: '🎬',
      mp3: '🎵', wav: '🎵', flac: '🎵',
      zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️',
      pdf: '📄', doc: '📄', docx: '📄', txt: '📄', md: '📄',
      exe: '⚙️', apk: '📱',
    };
    return map[ext] || '📁';
  }

  let toastTimer = null;
  function toast(text) {
    const el = document.getElementById('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
  }

  const $ = (id) => document.getElementById(id);
  const deviceListEl = $('device-list');
  const messagesEl = $('messages');
  const chatTitleEl = $('chat-title');
  const chatSubEl = $('chat-sub');
  const inputEl = $('input');
  const connStatusEl = $('conn-status');
  const nameInputEl = $('device-name');
  const fileInputEl = $('file-input');
  const dropHintEl = $('drop-hint');
  const sidebarEl = $('sidebar');
  const overlayEl = $('overlay');
  const menuBtn = $('btn-menu');
  const langBtn = $('btn-lang');

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}`);

    ws.onopen = () => {
      connected = true;
      setConnStatus(true);
      sendHello();
    };
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      onMessage(msg);
    };
    ws.onclose = () => {
      connected = false;
      setConnStatus(false);
      renderDevices();
      scheduleReconnect();
    };
    ws.onerror = () => {};
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connect(); }, 2000);
  }
  function setConnStatus(on) {
    connStatusEl.className = 'status-dot ' + (on ? 'online' : 'offline');
  }
  function detectPlatform() {
    const ua = navigator.userAgent;
    if (/Android/i.test(ua)) return 'Android';
    if (/iPhone|iPad/i.test(ua)) return 'iOS';
    if (/Windows/i.test(ua)) return 'Windows';
    if (/Mac/i.test(ua)) return 'macOS';
    if (/Linux/i.test(ua)) return 'Linux';
    return 'unknown';
  }

  async function sendHello() {
    resolvedName = await resolveName();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'hello', id: myId, name: resolvedName, platform: detectPlatform() }));
    }
  }

  async function resolveName() {
    if (myName) return myName;
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    if (isLocal) {
      try {
        const r = await fetch('/api/hostname');
        const d = await r.json();
        if (d && d.hostname) return d.hostname;
      } catch {}
    }
    return autoDeviceName();
  }

  function autoDeviceName() {
    const ua = navigator.userAgent;
    const isTablet = /iPad|Tablet/i.test(ua);
    switch (detectPlatform()) {
      case 'Android': return isTablet ? t('android_tablet') : t('android_phone');
      case 'iOS': return isTablet ? t('ipad') : t('iphone');
      case 'Windows': return t('windows_pc');
      case 'macOS': return t('mac_pc');
      case 'Linux': return t('linux_device');
      default: return t('device');
    }
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'welcome':
        myId = msg.id;
        localStorage.setItem('deviceId', myId);
        break;
      case 'devices':
        devices = msg.list || [];
        renderDevices();
        break;
      case 'chat':
        receive(msg, 'chat');
        break;
      case 'clipboard':
        receive(msg, 'clipboard');
        break;
      case 'file':
        receive(msg, 'file');
        break;
      case 'history':
        loadHistoryMessages(msg.messages || []);
        break;
    }
  }

  function loadHistoryMessages(list) {
    for (const key of Object.keys(conversations)) {
      delete conversations[key];
    }
    ensureRoom(ALL_KEY);
    ensureRoom(target);

    list.forEach((m) => {
      const grouped = (m.type === 'chat' || m.type === 'clipboard') && !m.to;
      const room = grouped ? ALL_KEY : m.from;
      ensureRoom(room);
      conversations[room].push({
        type: m.type, from: m.from, fromName: m.fromName || t('device'), text: m.text,
        fileId: m.fileId, name: m.name, size: m.size, ts: m.ts,
        self: m.from === myId, read: true,
      });
    });
    renderMessages();
    renderDevices();
  }

  function receive(msg, type) {
    const grouped = (type === 'chat' || type === 'clipboard') && !msg.to;
    const room = grouped ? ALL_KEY : msg.from;
    ensureRoom(room);

    const entry = {
      type, from: msg.from, fromName: msg.fromName, text: msg.text,
      fileId: msg.fileId, name: msg.name, size: msg.size, ts: msg.ts, self: false,
    };
    conversations[room].push(entry);

    if (room === target) {
      appendMessage(entry);
    } else {
      renderDevices();
    }

    if (type === 'clipboard') {
      copyToClipboard(msg.text);
      toast(t('clipboard_received', { name: msg.fromName }));
    }
  }

  function ensureRoom(room) {
    if (!conversations[room]) conversations[room] = [];
  }
  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    }
  }

  function renderDevices() {
    const others = devices.filter((d) => d.id !== myId);

    let html = `
      <div class="device ${target === ALL_KEY ? 'active' : ''}" data-target="${ALL_KEY}">
        <div class="avatar" style="background:#23b26d">👥</div>
        <div class="meta">
          <div class="name">${t('everyone')}</div>
          <div class="sub">${t('group')}</div>
        </div>
      </div>`;

    for (const d of others) {
      const active = target === d.id ? 'active' : '';
      const count = unreadCount(d.id);
      const platform = d.platform && d.platform !== 'unknown' ? d.platform : t('device');
      html += `
        <div class="device ${active}" data-target="${esc(d.id)}">
          <div class="avatar">${esc(d.name.slice(0, 1)) || '?'}</div>
          <div class="meta">
            <div class="name">${esc(d.name)}</div>
            <div class="sub">${esc(platform)}</div>
          </div>
          ${count > 0 ? `<span class="you">${count}</span>` : ''}
        </div>`;
    }

    if (others.length === 0) {
      html += `<div class="no-devices">${t('no_devices')}</div>`;
    }

    deviceListEl.innerHTML = html;
    deviceListEl.querySelectorAll('.device').forEach((el) => {
      el.addEventListener('click', () => {
        selectTarget(el.dataset.target);
        closeSidebar();
      });
    });
    updateChatHeader();
  }

  function unreadCount(room) {
    return (conversations[room] || []).filter((m) => !m.self && !m.read).length;
  }

  function selectTarget(tgt) {
    target = tgt;
    ensureRoom(tgt);
    renderDevices();
    renderMessages();
  }

  function updateChatHeader() {
    if (target === ALL_KEY) {
      chatTitleEl.textContent = t('everyone');
      chatSubEl.textContent = t('group');
    } else {
      const d = devices.find((x) => x.id === target);
      chatTitleEl.textContent = d ? d.name : t('device');
      chatSubEl.textContent = d ? t('online') : t('offline');
    }
  }

  function renderMessages() {
    const list = conversations[target] || [];
    list.forEach((m) => { m.read = true; });
    updateChatHeader();

    if (list.length === 0) {
      messagesEl.innerHTML = `<div class="empty-tip">${t('empty_tip')}</div>`;
      return;
    }
    messagesEl.innerHTML = '';
    list.forEach((m) => messagesEl.appendChild(buildMsgElement(m)));
    scrollBottom();
    bindDownloadButtons();
  }

  function buildMsgElement(m) {
    const wrap = document.createElement('div');
    wrap.className = m.self ? 'msg self' : 'msg';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    if (!m.self) {
      const sender = document.createElement('div');
      sender.className = 'sender';
      sender.textContent = `${m.fromName} · ${formatTime(m.ts)}`;
      bubble.appendChild(sender);
    }

    if (m.type === 'chat') {
      bubble.appendChild(document.createTextNode(m.text || ''));
    } else if (m.type === 'clipboard') {
      const div = document.createElement('div');
      div.textContent = m.text || '';
      bubble.appendChild(div);
      const note = document.createElement('div');
      note.className = 'clip-note';
      note.textContent = m.self ? t('clip_self') : t('clip_received');
      bubble.appendChild(note);
    } else if (m.type === 'file') {
      bubble.appendChild(buildFileCard(m));
    }

    wrap.appendChild(bubble);
    m._el = wrap;
    return wrap;
  }

  function buildFileCard(m) {
    const card = document.createElement('div');
    card.className = 'file-card';

    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = fileIcon(m.name);
    card.appendChild(icon);

    const info = document.createElement('div');
    info.className = 'file-info';
    const nm = document.createElement('div');
    nm.className = 'file-name';
    nm.textContent = m.name;
    const sz = document.createElement('div');
    sz.className = 'file-size';
    sz.textContent = formatSize(m.size);
    info.appendChild(nm);
    info.appendChild(sz);
    card.appendChild(info);
    m._sizeEl = sz;

    if (m.uploading) {
      const wrap = document.createElement('div');
      wrap.className = 'progress';
      const bar = document.createElement('div');
      bar.className = 'bar';
      bar.style.width = '0%';
      wrap.appendChild(bar);
      card.appendChild(wrap);
      m._progressBar = bar;
    } else if (m.self) {
      const tag = document.createElement('span');
      tag.className = 'sent-tag';
      tag.textContent = t('sent');
      card.appendChild(tag);
    } else {
      const btn = document.createElement('button');
      btn.className = 'dl-btn';
      btn.textContent = t('download');
      btn.addEventListener('click', () => downloadFile(m.fileId, m.name));
      card.appendChild(btn);
    }

    return card;
  }

  function bindDownloadButtons() {
    messagesEl.querySelectorAll('.dl-btn').forEach((btn) => {
      if (!btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', () => downloadFile(btn.dataset.file, btn.dataset.name));
      }
    });
  }

  function scrollBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function appendMessage(m) {
    const tip = messagesEl.querySelector('.empty-tip');
    if (tip) tip.remove();
    messagesEl.appendChild(buildMsgElement(m));
    m.read = true;
    scrollBottom();
  }

  function sendChat() {
    const text = inputEl.value.trim();
    if (!text) return;
    if (!connected) { toast(t('not_connected')); return; }

    const entry = { type: 'chat', from: myId, fromName: resolvedName || t('me'), text, ts: Date.now(), self: true };
    ensureRoom(target);
    conversations[target].push(entry);
    appendMessage(entry);

    const payload = { type: 'chat', text };
    if (target !== ALL_KEY) payload.to = target;
    ws.send(JSON.stringify(payload));

    inputEl.value = '';
    autoGrow();
  }

  function sendClipboard() {
    const text = inputEl.value.trim();
    if (!text) { toast(t('input_required')); return; }
    if (!connected) { toast(t('not_connected')); return; }

    const entry = { type: 'clipboard', from: myId, fromName: resolvedName || t('me'), text, ts: Date.now(), self: true };
    ensureRoom(target);
    conversations[target].push(entry);
    appendMessage(entry);

    const payload = { type: 'clipboard', text };
    if (target !== ALL_KEY) payload.to = target;
    ws.send(JSON.stringify(payload));

    inputEl.value = '';
    autoGrow();
  }

  function sendFiles(fileList) {
    if (!connected) { toast(t('not_connected')); return; }
    Array.from(fileList).forEach(uploadFile);
  }

  function uploadFile(file) {
    const entry = {
      type: 'file', from: myId, fromName: resolvedName || t('me'),
      name: file.name, size: file.size, ts: Date.now(), self: true, uploading: true,
    };
    ensureRoom(target);
    conversations[target].push(entry);
    appendMessage(entry);

    const fd = new FormData();
    fd.append('file', file);

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && entry._progressBar) {
        entry._progressBar.style.width = Math.round((e.loaded / e.total) * 100) + '%';
      }
    };
    xhr.onload = () => {
      if (xhr.status === 200) {
        let resp = null;
        try { resp = JSON.parse(xhr.responseText); } catch {}
        if (resp && resp.fileId) {
          entry.uploading = false;
          entry.fileId = resp.fileId;
          const payload = { type: 'file', fileId: resp.fileId, name: resp.name, size: resp.size };
          if (target !== ALL_KEY) payload.to = target;
          ws.send(JSON.stringify(payload));
          replaceEntryElement(entry);
        } else {
          removeEntry(entry);
          toast(t('upload_failed'));
        }
      } else {
        removeEntry(entry);
        toast(t('upload_failed'));
      }
    };
    xhr.onerror = () => {
      removeEntry(entry);
      toast(t('upload_error'));
    };
    xhr.send(fd);
  }

  function replaceEntryElement(entry) {
    if (!entry._el || entry._el.parentNode !== messagesEl) return;
    const fresh = buildMsgElement(entry);
    messagesEl.replaceChild(fresh, entry._el);
    scrollBottom();
  }

  function removeEntry(entry) {
    for (const room in conversations) {
      const i = conversations[room].indexOf(entry);
      if (i >= 0) {
        conversations[room].splice(i, 1);
        if (room === target) renderMessages();
        break;
      }
    }
  }

  function downloadFile(fileId, name) {
    const a = document.createElement('a');
    a.href = `/api/download/${encodeURIComponent(fileId)}`;
    a.download = name || '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  let dragDepth = 0;
  document.addEventListener('dragenter', (e) => { e.preventDefault(); dragDepth++; dropHintEl.classList.add('show'); });
  document.addEventListener('dragleave', (e) => { e.preventDefault(); dragDepth--; if (dragDepth <= 0) { dragDepth = 0; dropHintEl.classList.remove('show'); } });
  document.addEventListener('dragover', (e) => e.preventDefault());
  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    dropHintEl.classList.remove('show');
    if (e.dataTransfer && e.dataTransfer.files.length) sendFiles(e.dataTransfer.files);
  });

  function closeSidebar() {
    sidebarEl.classList.remove('open');
    overlayEl.classList.remove('show');
  }

  $('btn-send').addEventListener('click', sendChat);
  $('btn-clip').addEventListener('click', sendClipboard);
  $('btn-file').addEventListener('click', () => fileInputEl.click());
  fileInputEl.addEventListener('change', () => { sendFiles(fileInputEl.files); fileInputEl.value = ''; });

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
  });
  function autoGrow() {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
  }
  inputEl.addEventListener('input', autoGrow);

  nameInputEl.addEventListener('change', () => {
    myName = nameInputEl.value.trim();
    localStorage.setItem('deviceName', myName);
    if (ws) ws.close();
    scheduleReconnect();
  });

  langBtn.addEventListener('click', () => setLang(lang === 'zh' ? 'en' : 'zh'));
  menuBtn.addEventListener('click', () => {
    sidebarEl.classList.add('open');
    overlayEl.classList.add('show');
  });
  overlayEl.addEventListener('click', closeSidebar);

  const mq = window.matchMedia('(min-width: 768px)');
  const onMq = (e) => { if (e.matches) closeSidebar(); };
  if (mq.addEventListener) mq.addEventListener('change', onMq);
  else if (mq.addListener) mq.addListener(onMq);

  nameInputEl.value = myName || '';
  applyLang();
  connect();
})();