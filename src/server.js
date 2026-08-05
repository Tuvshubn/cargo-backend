require('dotenv').config();
const express = require('express');
const app = express();

// CORS — first middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Requested-With');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

app.use(require('compression')());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.set('trust proxy', 1);

// Auto-migrate on startup if DB is available
const db = require('./config/db');
if (db._hasDB) {
  require('./config/migrate')().catch(e => console.error('Migration error:', e.message));
}

app.get('/', (req, res) => res.json({
  status: 'ok',
  name: 'МонтоТрейд Cargo API v2.0',
  db: db._hasDB ? '✅ PostgreSQL connected' : '⚠️ No DB — login works, data features disabled',
}));
app.get('/health', (req, res) => res.json({ status: 'ok', db: db._hasDB }));

try {
  app.use('/api', require('./routes'));
} catch (err) {
  console.error('Route error:', err.message);
  app.use('/api', (req, res) => res.status(503).json({ message: err.message }));
}

app.use((req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, _next) => res.status(500).json({ message: err.message }));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
module.exports = app;
