const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Generate tracking code: MN + YYMMDD + 4 random chars
const genCode = () => {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).slice(2,6).toUpperCase();
  return `MN${yy}${mm}${dd}${rand}`;
};

const getAll = async (req, res) => {
  try {
    const { search='', status='', cargo_type='', page=1, limit=25, from, to } = req.query;
    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit)));
    const offset = (p-1)*l;
    const params = [];
    const where = [];
    let i = 1;

    if (search) { where.push(`(tracking_code ILIKE $${i} OR mn_name ILIKE $${i} OR mn_phone ILIKE $${i})`); params.push(`%${search}%`); i++; }
    if (status)     { where.push(`status = $${i}`); params.push(status); i++; }
    if (cargo_type) { where.push(`cargo_type = $${i}`); params.push(cargo_type); i++; }
    if (from) { where.push(`created_at >= $${i}`); params.push(from); i++; }
    if (to)   { where.push(`created_at <= $${i}::date + interval '1 day'`); params.push(to); i++; }

    const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const [countR, dataR] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM parcels ${w}`, params),
      pool.query(`
        SELECT p.*,
          b.code as batch_code,
          GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - p.arrived_at))/86400) - 7) * p.quantity * 1000 AS current_storage_fee
        FROM parcels p
        LEFT JOIN batch_parcels bp ON bp.parcel_id = p.id
        LEFT JOIN batches b ON b.id = bp.batch_id
        ${w}
        ORDER BY p.created_at DESC
        LIMIT $${i} OFFSET $${i+1}
      `, [...params, l, offset])
    ]);

    res.json({ data: dataR.rows, total: parseInt(countR.rows[0].count), page: p, limit: l });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const { rows: [p] } = await pool.query(`
      SELECT p.*, b.code as batch_code,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW()-p.arrived_at))/86400)-7)*p.quantity*1000 AS current_storage_fee
      FROM parcels p
      LEFT JOIN batch_parcels bp ON bp.parcel_id=p.id
      LEFT JOIN batches b ON b.id=bp.batch_id
      WHERE p.id=$1
    `, [req.params.id]);
    if (!p) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const track = async (req, res) => {
  try {
    const { code, phone } = req.query;
    if (!code && !phone) return res.status(400).json({ message: 'Код эсвэл дугаар шаардлагатай' });

    const where = [];
    const params = [];
    if (code)  { where.push(`p.tracking_code = $${params.length+1}`); params.push(code.toUpperCase()); }
    if (phone) { where.push(`p.mn_phone = $${params.length+1}`); params.push(phone); }

    const { rows: parcels } = await pool.query(`
      SELECT p.id, p.tracking_code, p.mn_name, p.mn_phone, p.cargo_type,
        p.quantity, p.status, p.paid_in_korea, p.total_fee, p.remaining_fee,
        p.is_paid, p.arrived_at, p.collected_at, b.code as batch_code,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW()-p.arrived_at))/86400)-7)*p.quantity*1000 AS current_storage_fee
      FROM parcels p
      LEFT JOIN batch_parcels bp ON bp.parcel_id=p.id
      LEFT JOIN batches b ON b.id=bp.batch_id
      WHERE ${where.join(' OR ')}
      ORDER BY p.created_at DESC LIMIT 10
    `, params);

    if (!parcels.length) return res.status(404).json({ message: 'Ачаа олдсонгүй' });

    const { rows: history } = await pool.query(
      `SELECT parcel_id, status, note, created_at FROM parcel_history WHERE parcel_id = ANY($1) ORDER BY created_at ASC`,
      [parcels.map(p => p.id)]
    );

    res.json({ parcels, history });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  try {
    const {
      kr_name, kr_phone, kr_address,
      mn_name, mn_phone, mn_address,
      cargo_type='express', weight, quantity=1,
      description, paid_in_korea=0, total_fee=0,
      notes, is_fragile=false,
    } = req.body;

    if (!mn_name || !mn_phone) return res.status(400).json({ message: 'Монгол нэр, дугаар шаардлагатай' });

    const remaining_fee = Math.max(0, parseFloat(total_fee) - parseFloat(paid_in_korea));
    const tracking_code = genCode();

    const { rows: [p] } = await pool.query(`
      INSERT INTO parcels (tracking_code, kr_name, kr_phone, kr_address, mn_name, mn_phone, mn_address,
        cargo_type, weight, quantity, description, paid_in_korea, total_fee, remaining_fee,
        is_paid, is_fragile, notes, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      RETURNING *
    `, [tracking_code, kr_name, kr_phone, kr_address, mn_name, mn_phone, mn_address,
        cargo_type, weight, quantity, description, paid_in_korea, total_fee, remaining_fee,
        remaining_fee <= 0, is_fragile, notes, req.user.id]);

    await pool.query(
      `INSERT INTO parcel_history (parcel_id, status, note, created_by) VALUES ($1,'incheon','Падан бүртгэгдлээ',$2)`,
      [p.id, req.user.id]
    );

    res.status(201).json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const fields = ['kr_name','kr_phone','kr_address','mn_name','mn_phone','mn_address',
                    'cargo_type','weight','quantity','description','paid_in_korea','total_fee',
                    'remaining_fee','is_paid','is_fragile','notes'];
    const updates = [];
    const params = [];
    let i = 1;

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        updates.push(`${f}=$${i}`); params.push(req.body[f]); i++;
      }
    }
    if (!updates.length) return res.status(400).json({ message: 'Өөрчлөх зүйл байхгүй' });

    updates.push(`updated_at=NOW()`);
    params.push(id);

    const { rows: [p] } = await pool.query(
      `UPDATE parcels SET ${updates.join(',')} WHERE id=$${i} RETURNING *`,
      params
    );
    if (!p) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered'];
    if (!validStatuses.includes(status)) return res.status(400).json({ message: 'Буруу статус' });

    const extra = status === 'warehouse' ? `, arrived_at = COALESCE(arrived_at, NOW())` : '';
    const { rows: [p] } = await pool.query(
      `UPDATE parcels SET status=$1, updated_at=NOW()${extra} WHERE id=$2 RETURNING *`,
      [status, id]
    );
    if (!p) return res.status(404).json({ message: 'Ачаа олдсонгүй' });

    await pool.query(
      `INSERT INTO parcel_history (parcel_id, status, created_by) VALUES ($1,$2,$3)`,
      [id, status, req.user.id]
    );

    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    const { rows: [p] } = await pool.query('DELETE FROM parcels WHERE id=$1 RETURNING id', [req.params.id]);
    if (!p) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const exportExcel = async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM parcels ORDER BY created_at DESC');
    // Simple CSV export (xlsx needs extra package)
    const headers = ['tracking_code','mn_name','mn_phone','cargo_type','quantity','status','total_fee','remaining_fee','is_paid','created_at'];
    const csv = [
      headers.join(','),
      ...rows.map(r => headers.map(h => `"${r[h] ?? ''}"`).join(','))
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="parcels.csv"');
    res.send('\uFEFF' + csv); // BOM for Excel
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, getOne, track, create, update, updateStatus, remove, exportExcel };
