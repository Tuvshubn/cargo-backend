const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Нэвтрэх шаардлагатай. Authorization header байхгүй.' });
    }
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1 AND is_active = true', [decoded.id]);
    if (!rows[0]) return res.status(401).json({ message: 'Хэрэглэгч олдсонгүй эсвэл идэвхгүй болсон.' });
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Токен хугацаа дууссан. Дахин нэвтэрнэ үү.' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Токен буруу байна.' });
    }
    return res.status(401).json({ message: 'Нэвтрэлт амжилтгүй: ' + err.message });
  }
};

const requireRole = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Нэвтрэх шаардлагатай.' });
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ 
      message: `Эрх хүрэлцэхгүй. Шаардлагатай эрх: ${roles.join(' эсвэл ')}. Таны эрх: ${req.user.role}` 
    });
  }
  next();
};

module.exports = { auth, requireRole };
