
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'montotrade_2024_super_secret_key';

const FALLBACK = {
  'admin-001': { id:'admin-001', name:'Super Admin', email:'admin@cargo.mn', role:'admin', phone:'7500-5747' },
};

const auth = async (req, res, next) => {
  try {
    const h = req.headers.authorization;
    if (!h?.startsWith('Bearer ')) return res.status(401).json({ message: 'Нэвтрэх шаардлагатай' });
    const decoded = jwt.verify(h.split(' ')[1], JWT_SECRET);
    const db = require('../config/db');
    if (db._hasDB) {
      try {
        const { rows } = await db.query('SELECT id,name,email,role,phone FROM users WHERE id=\$1 AND is_active=true', [decoded.id]);
        if (rows[0]) { req.user = rows[0]; return next(); }
      } catch (e) {}
    }
    req.user = FALLBACK[decoded.id] || { id:decoded.id, name:decoded.name||decoded.email, email:decoded.email, role:decoded.role, phone:'' };
    next();
  } catch (err) {
    return res.status(401).json({ message: err.name === 'TokenExpiredError' ? 'Токен хугацаа дууссан' : 'Нэвтрэлт амжилтгүй' });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user?.role)) return res.status(403).json({ message: 'Эрх байхгүй' });
  next();
};

const requirePermission = (perm) => async (req, res, next) => {
  if (req.user?.role === 'admin') return next();
  const db = require('../config/db');
  if (!db._hasDB) return res.status(403).json({ message: 'Эрх байхгүй' });
  try {
    const { rows } = await db.query('SELECT 1 FROM role_permissions WHERE role=\$1 AND permission=\$2', [req.user.role, perm]);
    if (!rows.length) return res.status(403).json({ message: 'Эрх байхгүй: ' + perm });
    next();
  } catch { return res.status(403).json({ message: 'Эрх шалгахад алдаа' }); }
};

module.exports = { auth, requireRole, requirePermission };
