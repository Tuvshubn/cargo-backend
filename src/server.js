require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const app = express();
const PORT = process.env.PORT || 5000;

// ===== CORS - бүх origin зөвшөөрөх =====
const allowedOrigins = [
  process.env.CLIENT_URL,
  process.env.ADMIN_URL,
  'http://localhost:3000',
  'http://localhost:3001',
];

app.use(cors({
  origin: function (origin, callback) {
    // origin байхгүй бол (Postman, direct call) зөвшөөрнө
    if (!origin) return callback(null, true);
    // vercel.app domain бүгд зөвшөөрнө
    if (origin.endsWith('.vercel.app') || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // development дээр бүгд зөвшөөрнө
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    callback(null, true); // production дээр ч зөвшөөрнө (нээлттэй API)
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Disposition'],
}));

// OPTIONS preflight бүгдийг зөвшөөрнө
app.options('*', cors());

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));
app.use(compression());
if (process.env.NODE_ENV !== 'production') app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ===== Health check =====
app.get('/', (req, res) => res.json({
  status: 'ok',
  message: 'МонтоТрейд Cargo API v1.0',
  time: new Date().toISOString(),
  db: process.env.DATABASE_URL ? 'configured' : 'not configured',
}));
app.get('/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

// ===== Routes =====
if (process.env.DATABASE_URL) {
  try {
    const routes = require('./routes');
    app.use('/api', routes);
    console.log('✅ Routes loaded');
  } catch (err) {
    console.error('Route error:', err.message);
  }
} else {
  app.use('/api', (req, res) => {
    res.status(503).json({ message: 'DATABASE_URL тохируулагдаагүй байна. Vercel environment variables дээр нэмнэ үү.' });
  });
}

// ===== 404 handler =====
app.use((req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.path}` });
});

// ===== Error handler =====
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Серверийн алдаа',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
module.exports = app;
