const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

const generateCode = () => {
  const prefix = 'MN';
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}${date}${rand}`;
};

const getAll = async (req, res) => {
  try {
    const { status, batch_id, search, from, to, page = 1, limit = 50 } = req.query;
    let where = ['1=1'];
    let params = [];
    let i = 1;

    if (status) { where.push(`p.status=$${i++}`); params.push(status); }
    if (batch_id) { where.push(`p.batch_id=$${i++}`); params.push(batch_id); }
    if (search) {
      where.push(`(p.tracking_code ILIKE $${i} OR p.mn_name ILIKE $${i} OR p.mn_phone ILIKE $${i} OR p.kr_name ILIKE $${i})`);
      params.push(`%${search}%`); i++;
    }
    if (from) { where.push(`p.created_at >= $${i++}`); params.push(from); }
    if (to) { where.push(`p.created_at <= $${i++}`); params.push(to); }

    // Driver can only see their own parcels
    if (req.user.role === 'driver') {
      where.push(`p.driver_id=$${i++}`); params.push(req.user.id);
    }

    const offset = (page - 1) * limit;
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM parcels p WHERE ${where.join(' AND ')}`, params
    );
    const total = parseInt(countResult.rows[0].count);

    const { rows } = await pool.query(
      `SELECT p.*, 
        b.batch_code, b.name as batch_name,
        u.name as driver_name,
        dd.name as delivery_driver_name
       FROM parcels p
       LEFT JOIN batches b ON p.batch_id = b.id
       LEFT JOIN users u ON p.driver_id = u.id
       LEFT JOIN users dd ON p.delivery_driver_id = dd.id
       WHERE ${where.join(' AND ')}
       ORDER BY p.created_at DESC
       LIMIT $${i} OFFSET $${i+1}`,
      [...params, limit, offset]
    );

    res.json({ data: rows, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, b.batch_code, b.name as batch_name
       FROM parcels p
       LEFT JOIN batches b ON p.batch_id = b.id
       WHERE p.id=$1`, [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Ачаа олдсонгүй' });

    const history = await pool.query(
      `SELECT psh.*, u.name as changed_by_name 
       FROM parcel_status_history psh
       LEFT JOIN users u ON psh.changed_by = u.id
       WHERE psh.parcel_id=$1 ORDER BY psh.created_at ASC`, [req.params.id]
    );
    res.json({ ...rows[0], history: history.rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

// Public tracking
const track = async (req, res) => {
  const { code, phone } = req.query;
  try {
    let query, params;
    if (code && phone) {
      query = `SELECT p.*, b.batch_code, b.name as batch_name FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id WHERE p.tracking_code=$1 AND p.mn_phone=$2`;
      params = [code, phone];
    } else if (code) {
      query = `SELECT p.*, b.batch_code, b.name as batch_name FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id WHERE p.tracking_code=$1`;
      params = [code];
    } else if (phone) {
      query = `SELECT p.*, b.batch_code, b.name as batch_name FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id WHERE p.mn_phone=$1 ORDER BY p.created_at DESC`;
      params = [phone];
    } else {
      return res.status(400).json({ message: 'Код эсвэл утасны дугаар оруулна уу' });
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) return res.status(404).json({ message: 'Ачаа олдсонгүй' });

    // Calculate storage fee
    const parcels = rows.map(p => {
      let storageFee = 0;
      if (p.status === 'warehouse' && p.arrived_at) {
        const arrDate = new Date(p.arrived_at);
        const now = new Date();
        const diffDays = Math.floor((now - arrDate) / (1000 * 60 * 60 * 24));
        if (diffDays > 7) {
          storageFee = (diffDays - 7) * p.quantity * 1000;
        }
      }
      return { ...p, current_storage_fee: storageFee };
    });

    const history = await pool.query(
      `SELECT status, note, created_at FROM parcel_status_history WHERE parcel_id=ANY($1) ORDER BY created_at ASC`,
      [rows.map(r => r.id)]
    );

    res.json({ parcels, history: history.rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  try {
    const {
      kr_name, kr_phone, kr_address,
      mn_name, mn_phone, mn_address,
      cargo_type, weight, quantity, description,
      paid_in_korea, total_fee, remaining_fee,
      notes, is_fragile, batch_id
    } = req.body;

    const tracking_code = generateCode();

    const { rows } = await pool.query(
      `INSERT INTO parcels (
        tracking_code, kr_name, kr_phone, kr_address,
        mn_name, mn_phone, mn_address,
        cargo_type, weight, quantity, description,
        paid_in_korea, total_fee, remaining_fee,
        notes, is_fragile, batch_id,
        driver_id, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [tracking_code, kr_name, kr_phone, kr_address,
       mn_name, mn_phone, mn_address,
       cargo_type, weight || 0, quantity || 1, description,
       paid_in_korea || 0, total_fee || 0, remaining_fee || 0,
       notes, is_fragile || false, batch_id,
       req.user.id, req.user.id]
    );

    await pool.query(
      `INSERT INTO parcel_status_history (parcel_id, status, note, changed_by) VALUES ($1,$2,$3,$4)`,
      [rows[0].id, 'incheon', 'Падан бүртгэгдлээ', req.user.id]
    );

    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { id } = req.params;
  try {
    const fields = req.body;
    const keys = Object.keys(fields).filter(k => k !== 'id');
    const values = keys.map(k => fields[k]);
    const setClause = keys.map((k, i) => `${k}=$${i + 1}`).join(', ');

    const { rows } = await pool.query(
      `UPDATE parcels SET ${setClause}, updated_at=NOW() WHERE id=$${keys.length + 1} RETURNING *`,
      [...values, id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status, note } = req.body;
  try {
    const extraFields = {};
    if (status === 'warehouse') extraFields.arrived_at = 'NOW()';
    if (status === 'delivered') extraFields.collected_at = 'NOW()';

    let setClause = `status=$1, updated_at=NOW()`;
    let params = [status, id];
    if (extraFields.arrived_at) setClause += ', arrived_at=NOW()';
    if (extraFields.collected_at) setClause += ', collected_at=NOW()';

    const { rows } = await pool.query(
      `UPDATE parcels SET ${setClause} WHERE id=$2 RETURNING *`, params
    );

    await pool.query(
      `INSERT INTO parcel_status_history (parcel_id, status, note, changed_by) VALUES ($1,$2,$3,$4)`,
      [id, status, note || '', req.user.id]
    );

    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await pool.query('DELETE FROM parcels WHERE id=$1', [req.params.id]);
    res.json({ message: 'Устгагдлаа' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const exportExcel = async (req, res) => {
  const xlsx = require('xlsx');
  try {
    const { rows } = await pool.query(
      `SELECT p.tracking_code, p.mn_name, p.mn_phone, p.mn_address,
              p.kr_name, p.kr_phone, p.cargo_type, p.quantity, p.weight,
              p.paid_in_korea, p.total_fee, p.remaining_fee, p.status, p.is_paid,
              p.created_at, b.batch_code
       FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id
       ORDER BY p.created_at DESC`
    );

    const ws = xlsx.utils.json_to_sheet(rows.map(r => ({
      'Tracking Code': r.tracking_code,
      'Монгол нэр': r.mn_name,
      'Монгол дугаар': r.mn_phone,
      'Монгол хаяг': r.mn_address,
      'Солонгос нэр': r.kr_name,
      'Солонгос дугаар': r.kr_phone,
      'Төрөл': r.cargo_type,
      'Тоо ширхэг': r.quantity,
      'Жин': r.weight,
      'Солонгосд төлсөн': r.paid_in_korea,
      'Нийт төлбөр': r.total_fee,
      'Үлдэгдэл': r.remaining_fee,
      'Төлөв': r.status,
      'Төлбөр': r.is_paid ? 'Төлсөн' : 'Төлөөгүй',
      'Багц': r.batch_code,
      'Огноо': r.created_at,
    })));

    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Parcels');
    const buf = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', 'attachment; filename=parcels.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, getOne, track, create, update, updateStatus, remove, exportExcel };
