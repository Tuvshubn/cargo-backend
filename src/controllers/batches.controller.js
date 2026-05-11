const pool = require('../config/db');

const genBatchCode = () => {
  const d = new Date();
  const yy = String(d.getFullYear()).slice(2);
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  const rand = Math.random().toString(36).slice(2,5).toUpperCase();
  return `BCH${yy}${mm}${dd}${rand}`;
};

const getAll = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT b.*, COUNT(bp.parcel_id) as parcel_count,
        SUM(p.total_fee) as total_revenue,
        u.name as driver_name
      FROM batches b
      LEFT JOIN batch_parcels bp ON bp.batch_id = b.id
      LEFT JOIN parcels p ON p.id = bp.parcel_id
      LEFT JOIN users u ON u.id = b.driver_id
      GROUP BY b.id, u.name
      ORDER BY b.created_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const { rows: [b] } = await pool.query('SELECT * FROM batches WHERE id=$1', [req.params.id]);
    if (!b) return res.status(404).json({ message: 'Батч олдсонгүй' });
    const { rows: parcels } = await pool.query(
      'SELECT p.* FROM parcels p JOIN batch_parcels bp ON bp.parcel_id=p.id WHERE bp.batch_id=$1',
      [req.params.id]
    );
    res.json({ ...b, parcels });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  try {
    const { name, departure_date, driver_id, notes } = req.body;
    const code = genBatchCode();
    const { rows: [b] } = await pool.query(
      `INSERT INTO batches (code, name, departure_date, driver_id, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [code, name || code, departure_date, driver_id, notes]
    );
    res.status(201).json(b);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  try {
    const { name, departure_date, arrival_date, driver_id, notes } = req.body;
    const { rows: [b] } = await pool.query(
      `UPDATE batches SET name=COALESCE($1,name), departure_date=COALESCE($2,departure_date),
       arrival_date=COALESCE($3,arrival_date), driver_id=COALESCE($4,driver_id),
       notes=COALESCE($5,notes), updated_at=NOW() WHERE id=$6 RETURNING *`,
      [name, departure_date, arrival_date, driver_id, notes, req.params.id]
    );
    if (!b) return res.status(404).json({ message: 'Батч олдсонгүй' });
    res.json(b);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered'];
    if (!valid.includes(status)) return res.status(400).json({ message: 'Буруу статус' });

    const { rows: [b] } = await pool.query(
      `UPDATE batches SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [status, req.params.id]
    );
    if (!b) return res.status(404).json({ message: 'Батч олдсонгүй' });

    // Update all parcels in this batch
    await pool.query(
      `UPDATE parcels SET status=$1, updated_at=NOW(),
        arrived_at = CASE WHEN $1='warehouse' THEN COALESCE(arrived_at, NOW()) ELSE arrived_at END
       WHERE id IN (SELECT parcel_id FROM batch_parcels WHERE batch_id=$2)`,
      [status, req.params.id]
    );

    res.json(b);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const addParcels = async (req, res) => {
  try {
    const { parcel_ids } = req.body;
    if (!Array.isArray(parcel_ids)) return res.status(400).json({ message: 'parcel_ids [] шаардлагатай' });
    for (const pid of parcel_ids) {
      await pool.query(
        `INSERT INTO batch_parcels (batch_id, parcel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
        [req.params.id, pid]
      );
    }
    res.json({ success: true, added: parcel_ids.length });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await pool.query('DELETE FROM batches WHERE id=$1', [req.params.id]);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, getOne, create, update, updateStatus, addParcels, remove };
