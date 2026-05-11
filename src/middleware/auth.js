const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ─── 1. JWT Authentication ────────────────────────────────────────────────────
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Нэвтрэх шаардлагатай.' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'CHANGE_THIS_SECRET');

    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_active FROM users WHERE id = $1 AND is_active = true',
      [decoded.id]
    );
    if (!rows[0]) return res.status(401).json({ message: 'Хэрэглэгч олдсонгүй эсвэл идэвхгүй.' });

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return res.status(401).json({ message: 'Токен хугацаа дууссан.' });
    if (err.name === 'JsonWebTokenError') return res.status(401).json({ message: 'Токен буруу байна.' });
    return res.status(401).json({ message: 'Нэвтрэлт амжилтгүй.' });
  }
};

// ─── 2. Role-Based Access Control ────────────────────────────────────────────
const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Нэвтрэх шаардлагатай.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: 'Энэ үйлдэл хийх эрх байхгүй.' });
  }
  next();
};

// ─── 3. DB Permission Check (RBAC from DB) ───────────────────────────────────
const requirePermission = (permission) => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Нэвтрэх шаардлагатай.' });

  // admin always has all permissions
  if (req.user.role === 'admin') return next();

  try {
    const { rows } = await pool.query(
      'SELECT 1 FROM role_permissions WHERE role = $1 AND permission = $2',
      [req.user.role, permission]
    );
    if (!rows.length) {
      return res.status(403).json({ message: `Энэ үйлдэл хийх эрх байхгүй. (${permission})` });
    }
    next();
  } catch (err) {
    return res.status(500).json({ message: 'Эрх шалгахад алдаа гарлаа.' });
  }
};

// ─── 4. IDOR Prevention — Own resource only (or admin) ───────────────────────
const requireOwnerOrAdmin = (paramName = 'id', userField = 'id') => async (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Нэвтрэх шаардлагатай.' });
  if (req.user.role === 'admin') return next();

  const resourceId = req.params[paramName];
  if (String(req.user[userField]) !== String(resourceId)) {
    return res.status(403).json({ message: 'Бусдын мэдээлэлд хандах эрхгүй.' });
  }
  next();
};

// ─── 5. Rate Limiting (in-memory) ────────────────────────────────────────────
const rateLimitMap = new Map();

const rateLimit = (maxRequests = 100, windowMs = 60000) => (req, res, next) => {
  const key = req.ip + (req.user?.id || '');
  const now = Date.now();
  const record = rateLimitMap.get(key) || { count: 0, start: now };

  if (now - record.start > windowMs) {
    record.count = 1; record.start = now;
  } else {
    record.count++;
  }
  rateLimitMap.set(key, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ message: 'Хэт олон хүсэлт. Түр хүлээнэ үү.' });
  }
  next();
};

// Strict rate limit for auth endpoints
const authRateLimit = rateLimit(10, 60000); // 10/min

// ─── 6. Audit Logging ────────────────────────────────────────────────────────
const auditLog = async (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const user = req.user ? `${req.user.email}(${req.user.role})` : 'anonymous';
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? '⚠️ ' : '✅';
    console.log(`${level} ${req.method} ${req.path} | ${res.statusCode} | ${user} | ${duration}ms | IP:${req.ip}`);
  });
  next();
};

// ─── 7. Input Sanitization ───────────────────────────────────────────────────
const sanitize = (req, res, next) => {
  const clean = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === 'string') {
        // Strip null bytes and control chars
        obj[key] = obj[key].replace(/\0/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
      } else if (typeof obj[key] === 'object') {
        clean(obj[key]);
      }
    }
  };
  clean(req.body);
  clean(req.query);
  next();
};

module.exports = { auth, requireRole, requirePermission, requireOwnerOrAdmin, rateLimit, authRateLimit, auditLog, sanitize };
