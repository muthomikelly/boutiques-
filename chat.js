/**
 * chat.js — floating live chat widget for customers
 * Include on any page where chat should appear.
 * Requires the user to be logged in (reads token via /api/auth/me).
 */
(async function initChat() {
  // Only show chat if logged in
  const meRes = await fetch('/api/auth/me', { credentials: 'include' });
  if (!meRes.ok) return;
  const { user } = await meRes.json();
  if (!user) return;

  // Get JWT token from cookie (we need it for WS auth)
  // We'll request a short-lived chat token from the server
  const tokenRes = await fetch('/api/auth/chat-token', { credentials: 'include' });
  if (!tokenRes.ok) return;
  const { token } = await tokenRes.json();

  // ── Build widget HTML ──────────────────────────────────────────────────────
  const widget = document.createElement('div');
  widget.id = 'chatWidget';
  widget.innerHTML = `
    <button id="chatToggle" class="chat-toggle" aria-label="Open chat">
      <span class="chat-toggle-icon">💬</span>
      <span id="chatUnread" class="chat-unread hidden">0</span>
    </button>
    <div id="chatBox" class="chat-box hidden">
      <div class="chat-box-header">
        <div class="chat-header-info">
          <div class="chat-avatar">🛍️</div>
          <div>
            <strong>Boutique Support</strong>
            <span class="chat-status" id="chatStatus">Connecting…</span>
          </div>
        </div>
        <button id="chatClose" class="chat-close-btn">✕</button>
      </div>
      <div id="chatMessages" class="chat-messages">
        <div class="chat-welcome">
          <p>👋 Hi <strong>${user.name.split(' ')[0]}</strong>! How can we help you today?</p>
        </div>
      </div>
      <div class="chat-input-row">
        <input id="chatInput" type="text" placeholder="Type a message…" autocomplete="off" />
        <button id="chatSend" class="chat-send-btn">➤</button>
      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // ── State ──────────────────────────────────────────────────────────────────
  let ws        = null;
  let isOpen    = false;
  let unread    = 0;

  const toggle   = document.getElementById('chatToggle');
  const box      = document.getElementById('chatBox');
  const messages = document.getElementById('chatMessages');
  const input    = document.getElementById('chatInput');
  const sendBtn  = document.getElementById('chatSend');
  const closeBtn = document.getElementById('chatClose');
  const statusEl = document.getElementById('chatStatus');
  const unreadEl = document.getElementById('chatUnread');

  // ── WebSocket ──────────────────────────────────────────────────────────────
  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws/chat?token=${token}`);

    ws.onopen = () => {
      statusEl.textContent = 'Online';
      statusEl.style.color = '#16a34a';
    };

    ws.onclose = () => {
      statusEl.textContent = 'Offline';
      statusEl.style.color = '#dc2626';
      // Reconnect after 3s
      setTimeout(connect, 3000);
    };

    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'history') {
        data.messages.forEach(m => appendMessage(m, false));
        scrollToBottom();
      } else if (data.type === 'message') {
        appendMessage(data, true);
        if (!isOpen && data.senderId !== user.id) {
          unread++;
          unreadEl.textContent = unread;
          unreadEl.classList.remove('hidden');
        }
      }
    };
  }

  connect();

  // ── Render message ─────────────────────────────────────────────────────────
  function appendMessage(msg, animate) {
    const isMine = msg.senderId === user.id || msg.sender_id === user.id;
    const name   = msg.senderName || msg.sender_name;
    const role   = msg.senderRole || msg.sender_role;
    const text   = msg.text;
    const time   = new Date((msg.createdAt || msg.created_at * 1000)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const div = document.createElement('div');
    div.className = `chat-msg ${isMine ? 'mine' : 'theirs'} ${animate ? 'animate' : ''}`;
    div.innerHTML = `
      ${!isMine ? `<div class="msg-sender">${role === 'admin' ? '🛍️ Boutique' : name}</div>` : ''}
      <div class="msg-bubble">${escapeHtml(text)}</div>
      <div class="msg-time">${time}</div>
    `;
    messages.appendChild(div);
    if (animate) scrollToBottom();
  }

  function scrollToBottom() {
    messages.scrollTop = messages.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // ── Send message ───────────────────────────────────────────────────────────
  function sendMessage() {
    const text = input.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'message', text }));
    input.value = '';
    input.focus();
  }

  sendBtn.addEventListener('click', sendMessage);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendMessage(); });

  // ── Toggle open/close ──────────────────────────────────────────────────────
  toggle.addEventListener('click', () => {
    isOpen = !isOpen;
    box.classList.toggle('hidden', !isOpen);
    if (isOpen) {
      unread = 0;
      unreadEl.classList.add('hidden');
      scrollToBottom();
      input.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    isOpen = false;
    box.classList.add('hidden');
  });
})();
