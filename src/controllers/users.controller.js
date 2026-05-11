const pool = require('../config/db');
const bcrypt = require('bcryptjs');

const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id,name,email,role,phone,is_active,created_at FROM users ORDER BY created_at DESC'
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  try {
    const { name, email, password, role='driver', phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: 'Нэр, имэйл, нууц үг шаардлагатай' });
    const hash = await bcrypt.hash(password, 12);
    const { rows: [u] } = await pool.query(
      `INSERT INTO users (name,email,password,role,phone) VALUES ($1,$2,$3,$4,$5) RETURNING id,name,email,role,phone`,
      [name, email.toLowerCase(), hash, role, phone]
    );
    res.status(201).json(u);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Имэйл аль хэдийн бүртгэлтэй' });
    res.status(500).json({ message: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { name, role, phone, is_active, password } = req.body;
    let hash = null;
    if (password) hash = await bcrypt.hash(password, 12);

    const { rows: [u] } = await pool.query(`
      UPDATE users SET
        name=COALESCE($1,name), role=COALESCE($2,role), phone=COALESCE($3,phone),
        is_active=COALESCE($4,is_active), password=COALESCE($5,password), updated_at=NOW()
      WHERE id=$6 RETURNING id,name,email,role,phone,is_active
    `, [name, role, phone, is_active, hash, req.params.id]);
    if (!u) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });
    res.json(u);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ message: 'Өөрийгөө устгах боломжгүй' });
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, create, update, remove };
