require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,
}));

// ─── CORS — зөвшөөрөгдсөн origin-ууд ─────────────────────────────────────────
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  'http://localhost:3000',
  'http://localhost:3001',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow no-origin (mobile, curl, etc) or whitelisted
    if (!origin || allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error('CORS: Origin зөвшөөрөгдөөгүй — ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));

app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ─── Trust proxy (Vercel) ─────────────────────────────────────────────────────
app.set('trust proxy', 1);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/', (req, res) => res.json({
  status: 'ok',
  name: 'МонтоТрейд Cargo API',
  version: '2.0.0',
  db: process.env.DATABASE_URL ? '✅ connected' : '⚠️ not configured',
}));

app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ─── Routes ───────────────────────────────────────────────────────────────────
if (process.env.DATABASE_URL) {
  try {
    app.use('/api', require('./routes'));
    console.log('✅ API routes loaded');
  } catch (err) {
    console.error('❌ Route load error:', err.message);
    app.use('/api', (req, res) => res.status(503).json({ message: 'Server error' }));
  }
} else {
  app.use('/api', (req, res) => res.status(503).json({
    message: 'DATABASE_URL тохируулагдаагүй байна. Vercel environment variables-д нэмнэ үү.',
  }));
}

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ message: 'Endpoint олдсонгүй' }));

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  // Don't leak stack traces to client
  console.error('❌ Error:', err.stack);
  const status = err.status || 500;
  res.status(status).json({
    message: status === 500 ? 'Серверийн алдаа гарлаа' : err.message,
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;
