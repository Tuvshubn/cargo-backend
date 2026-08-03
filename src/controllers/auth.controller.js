
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'montotrade_2024_super_secret_key';

const FALLBACK_USERS = [
  { id:'admin-001', name:'Super Admin', email:'admin@cargo.mn', password:'$2a$10$4RpgspYezSvgSi3jvy6J/.IXF134TIi9pMoYNnvbuyH6aX6omslOm', role:'admin', phone:'7500-5747' },
  { id:'driver-001', name:'Жолооч', email:'driver@cargo.mn', password:'$2a$10$4RpgspYezSvgSi3jvy6J/.IXF134TIi9pMoYNnvbuyH6aX6omslOm', role:'driver', phone:'' },
];

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: 'Имэйл болон нууц үг шаардлагатай' });

    const db = require('../config/db');
    let user = null;

    if (db._hasDB) {
      try {
        const { rows } = await db.query('SELECT * FROM users WHERE email=\$1 AND is_active=true', [email.toLowerCase().trim()]);
        user = rows[0] || null;
      } catch (e) { console.error('DB error:', e.message); }
    }

    if (!user) user = FALLBACK_USERS.find(u => u.email === email.toLowerCase().trim()) || null;
    if (!user) return res.status(401).json({ message: 'Имэйл буруу байна' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: 'Нууц үг буруу байна' });

    const token = jwt.sign({ id:user.id, email:user.email, role:user.role, name:user.name }, JWT_SECRET, { expiresIn:'7d' });
    res.json({ token, user: { id:user.id, name:user.name, email:user.email, role:user.role, phone:user.phone } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Серверийн алдаа: ' + err.message });
  }
};

const me = async (req, res) => {
  res.json({ id:req.user.id, name:req.user.name, email:req.user.email, role:req.user.role, phone:req.user.phone||'' });
};

module.exports = { login, me };
