const db = require('../config/db');
const genCode = () => {
  const d = new Date();
  return `MN${String(d.getFullYear()).slice(2)}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}${Math.random().toString(36).slice(2,6).toUpperCase()}`;
};

const VALID_STATUSES = ['incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered'];

const getAll = async (req, res) => {
  try {
    const { status, search, page=1, limit=25, batch_id } = req.query;
    let w = [], p = [], i = 1;
    if (status) { w.push(`p.status=$${i++}`); p.push(status); }
    if (search) { w.push(`(p.tracking_code ILIKE $${i} OR p.mn_name ILIKE $${i} OR p.mn_phone ILIKE $${i} OR p.kr_name ILIKE $${i})`); p.push('%'+search+'%'); i++; }
    if (batch_id) { w.push(`p.batch_id=$${i++}`); p.push(batch_id); }
    const ws = w.length ? 'WHERE '+w.join(' AND ') : '';
    const off = (parseInt(page)-1)*parseInt(limit);
    const { rows } = await db.query(
      `SELECT p.*,b.batch_code FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id ${ws} ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i+1}`,
      [...p, parseInt(limit), off]
    );
    const { rows: cnt } = await db.query(`SELECT COUNT(*) FROM parcels p ${ws}`, p);
    res.json({ data: rows, total: parseInt(cnt[0].count), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT p.*,b.batch_code FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id WHERE p.id=$1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const track = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ message: 'code required' });
    const { rows } = await db.query('SELECT tracking_code,status,mn_name,kr_name,created_at,updated_at,notes FROM parcels WHERE tracking_code=$1', [code.toUpperCase()]);
    if (!rows[0]) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  try {
    const { kr_name,kr_phone,kr_address,mn_name,mn_phone,mn_address,cargo_type,weight,quantity,description,paid_in_korea,total_fee,remaining_fee,is_fragile,notes } = req.body;
    const tc = genCode();
    const { rows } = await db.query(
      'INSERT INTO parcels (tracking_code,kr_name,kr_phone,kr_address,mn_name,mn_phone,mn_address,cargo_type,weight,quantity,description,paid_in_korea,total_fee,remaining_fee,is_fragile,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *',
      [tc,kr_name,kr_phone,kr_address,mn_name,mn_phone,mn_address,cargo_type||'express',weight||0,quantity||1,description,paid_in_korea||0,total_fee||0,remaining_fee||0,is_fragile||false,notes,req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  try {
    const fields = ['kr_name','kr_phone','kr_address','mn_name','mn_phone','mn_address','cargo_type','weight','quantity','description','paid_in_korea','total_fee','remaining_fee','is_fragile','is_paid','notes'];
    const upd = [], vals = []; let i = 1;
    for (const f of fields) { if (req.body[f] !== undefined) { upd.push(`${f}=$${i++}`); vals.push(req.body[f]); } }
    if (!upd.length) return res.status(400).json({ message: 'Nothing to update' });
    upd.push(`updated_at=NOW()`);
    vals.push(req.params.id);
    const { rows } = await db.query(`UPDATE parcels SET ${upd.join(',')} WHERE id=$${i} RETURNING *`, vals);
    if (!rows[0]) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!VALID_STATUSES.includes(status)) return res.status(400).json({ message: 'Invalid status: '+status });
    const { rows } = await db.query('UPDATE parcels SET status=$1,notes=COALESCE($2,notes),updated_at=NOW() WHERE id=$3 RETURNING *', [status,notes,req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    const { rows } = await db.query('DELETE FROM parcels WHERE id=$1 RETURNING id', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ message: 'Not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const exportExcel = async (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { rows } = await db.query('SELECT * FROM parcels ORDER BY created_at DESC');
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Parcels');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=parcels.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, getOne, track, create, update, updateStatus, remove, exportExcel };
