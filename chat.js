const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { getDb } = require('./db/init');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';

// In-memory store: userId → ws connection
const connections = new Map();

function setupChat(server) {
  const wss = new WebSocketServer({ server, path: '/ws/chat' });

  wss.on('connection', (ws, req) => {
    // Parse token from query string: /ws/chat?token=xxx
    const url    = new URL(req.url, 'http://localhost');
    const token  = url.searchParams.get('token');
    let user     = null;

    try {
      user = jwt.verify(token, JWT_SECRET);
    } catch {
      ws.close(4001, 'Unauthorized');
      return;
    }

    ws.userId   = user.id;
    ws.userName = user.name;
    ws.userRole = user.role;
    connections.set(user.id, ws);

    console.log(`[chat] ${user.name} (${user.role}) connected`);

    // Send recent chat history to this user
    sendHistory(ws, user);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === 'message' && msg.text?.trim()) {
          saveAndBroadcast(user, msg.text.trim());
        }
      } catch {}
    });

    ws.on('close', () => {
      connections.delete(user.id);
      console.log(`[chat] ${user.name} disconnected`);
    });
  });

  console.log('[chat] WebSocket server ready at /ws/chat');
}

function saveAndBroadcast(sender, text) {
  const db = getDb();

  // Save to DB
  const result = db.prepare(
    `INSERT INTO chat_messages (sender_id, sender_name, sender_role, text)
     VALUES (?, ?, ?, ?)`
  ).run(sender.id, sender.name, sender.role, text);

  const message = {
    type:        'message',
    id:          result.lastInsertRowid,
    senderId:    sender.id,
    senderName:  sender.name,
    senderRole:  sender.role,
    text,
    createdAt:   Date.now(),
  };

  const payload = JSON.stringify(message);

  if (sender.role === 'admin') {
    // Admin message → broadcast to ALL connected customers
    for (const [, ws] of connections) {
      if (ws.readyState === 1) ws.send(payload);
    }
  } else {
    // Customer message → send to self + all admins
    const senderWs = connections.get(sender.id);
    if (senderWs?.readyState === 1) senderWs.send(payload);

    for (const [, ws] of connections) {
      if (ws.userRole === 'admin' && ws.readyState === 1) ws.send(payload);
    }
  }
}

function sendHistory(ws, user) {
  const db = getDb();
  let messages;

  if (user.role === 'admin') {
    // Admin sees all messages
    messages = db.prepare(
      `SELECT * FROM chat_messages ORDER BY created_at DESC LIMIT 100`
    ).all().reverse();
  } else {
    // Customer sees their own messages + admin replies
    messages = db.prepare(
      `SELECT * FROM chat_messages
       WHERE sender_id = ? OR sender_role = 'admin'
       ORDER BY created_at ASC LIMIT 100`
    ).all(user.id);
  }

  ws.send(JSON.stringify({ type: 'history', messages }));
}

module.exports = { setupChat };
