const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const cookieParser = require('cookie-parser');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initDb } = require('./db/init');
const { registerRoutes } = require('./routes');
const { setupChat } = require('./chat');
const { attachUser } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);

const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend', 'public');
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'uploads');

function getAllowedOrigins() {
  const configured = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);

  return configured.length
    ? configured
    : [
        `http://localhost:${PORT}`,
        `http://127.0.0.1:${PORT}`,
        'http://localhost:3000',
        'http://127.0.0.1:3000',
      ];
}

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(helmet({ contentSecurityPolicy: false }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true);
    return callback(null, getAllowedOrigins().includes(origin));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use('/uploads', express.static(UPLOADS_DIR));

// Apply authentication middleware to all routes
app.use(attachUser);

registerRoutes(app);

if (!fs.existsSync(FRONTEND_DIR)) {
  console.warn(`[server] Frontend directory not found: ${FRONTEND_DIR}`);
} else {
  app.use(express.static(FRONTEND_DIR));
}

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  const indexPath = path.join(FRONTEND_DIR, 'index.html');
  if (!fs.existsSync(indexPath)) {
    return res.status(404).send('Frontend not found');
  }

  return res.sendFile(indexPath);
});

initDb()
  .then(() => {
    setupChat(server);
    server.listen(PORT, () => {
      console.log(`[server] Boutique running at http://localhost:${PORT}`);
      console.log(`[server] API available at http://localhost:${PORT}/api`);
      console.log(`[server] Admin panel at http://localhost:${PORT}/admin/dashboard.html`);
    });
  })
  .catch(err => {
    console.error('[server] Failed to start:', err);
    process.exit(1);
  });
