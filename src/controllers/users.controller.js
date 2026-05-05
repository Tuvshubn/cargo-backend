const bcrypt = require('bcryptjs');
const pool = require('../config/db');

const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, email, phone, role, is_active, created_at FROM users ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, email, password, phone, role } = req.body;
  try {
    const hash = await bcrypt.hash(password, 12);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password, phone, role) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, email, phone, role, is_active, created_at`,
      [name, email, hash, phone, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ message: 'Имэйл аль хэдийн бүртгэлтэй' });
    res.status(500).json({ message: err.message });
  }
};

const update = async (req, res) => {
  const { id } = req.params;
  const { name, email, phone, role, is_active, password } = req.body;
  try {
    let query, params;
    if (password) {
      const hash = await bcrypt.hash(password, 12);
      query = `UPDATE users SET name=$1,email=$2,phone=$3,role=$4,is_active=$5,password=$6,updated_at=NOW() WHERE id=$7 RETURNING id,name,email,phone,role,is_active`;
      params = [name, email, phone, role, is_active, hash, id];
    } else {
      query = `UPDATE users SET name=$1,email=$2,phone=$3,role=$4,is_active=$5,updated_at=NOW() WHERE id=$6 RETURNING id,name,email,phone,role,is_active`;
      params = [name, email, phone, role, is_active, id];
    }
    const { rows } = await pool.query(query, params);
    if (!rows[0]) return res.status(404).json({ message: 'Хэрэглэгч олдсонгүй' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  const { id } = req.params;
  try {
    if (req.user.id === id) return res.status(400).json({ message: 'Өөрийгөө устгах боломжгүй' });
    await pool.query('UPDATE users SET is_active=false WHERE id=$1', [id]);
    res.json({ message: 'Хэрэглэгч идэвхгүй болгогдлоо' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, create, update, remove };
