const pool = require('../config/db');

const generateBatchCode = () => {
  const date = new Date().toISOString().slice(2,10).replace(/-/g,'');
  const rand = Math.random().toString(36).substring(2,5).toUpperCase();
  return `BCH${date}${rand}`;
};

const getAll = async (req, res) => {
  try {
    const { status, from, to, search } = req.query;
    let where = ['1=1'], params = [], i = 1;
    if (status) { where.push(`b.status=$${i++}`); params.push(status); }
    if (from) { where.push(`b.created_at>=$${i++}`); params.push(from); }
    if (to) { where.push(`b.created_at<=$${i++}`); params.push(to); }
    if (search) { where.push(`(b.batch_code ILIKE $${i} OR b.name ILIKE $${i})`); params.push(`%${search}%`); i++; }

    const { rows } = await pool.query(
      `SELECT b.*, 
        u.name as driver_name,
        COUNT(p.id) as parcel_count,
        SUM(p.total_fee) as total_fees,
        SUM(p.remaining_fee) as total_remaining
       FROM batches b
       LEFT JOIN users u ON b.driver_id=u.id
       LEFT JOIN parcels p ON b.id=p.batch_id
       WHERE ${where.join(' AND ')}
       GROUP BY b.id, u.name
       ORDER BY b.created_at DESC`,
      params
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const getOne = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT b.*, u.name as driver_name FROM batches b LEFT JOIN users u ON b.driver_id=u.id WHERE b.id=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Багц олдсонгүй' });

    const parcels = await pool.query(`SELECT * FROM parcels WHERE batch_id=$1`, [req.params.id]);
    res.json({ ...rows[0], parcels: parcels.rows });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const create = async (req, res) => {
  const { name, departure_date, driver_id, notes } = req.body;
  try {
    const batch_code = generateBatchCode();
    const { rows } = await pool.query(
      `INSERT INTO batches (batch_code, name, departure_date, driver_id, notes, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [batch_code, name, departure_date, driver_id, notes, req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const update = async (req, res) => {
  const { name, departure_date, driver_id, notes, status } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE batches SET name=$1,departure_date=$2,driver_id=$3,notes=$4,status=$5,updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, departure_date, driver_id, notes, status, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ message: 'Багц олдсонгүй' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const updateStatus = async (req, res) => {
  const { status, parcel_ids } = req.body;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE batches SET status=$1,updated_at=NOW() WHERE id=$2`, [status, req.params.id]);

    const targetIds = parcel_ids?.length
      ? parcel_ids
      : (await client.query(`SELECT id FROM parcels WHERE batch_id=$1`, [req.params.id])).rows.map(r => r.id);

    for (const pid of targetIds) {
      await client.query(`UPDATE parcels SET status=$1,updated_at=NOW() WHERE id=$2`, [status, pid]);
      await client.query(
        `INSERT INTO parcel_status_history (parcel_id,status,note,changed_by) VALUES ($1,$2,$3,$4)`,
        [pid, status, `Багцын статус шинэчлэгдлээ: ${status}`, req.user.id]
      );
      if (status === 'warehouse') {
        await client.query(`UPDATE parcels SET arrived_at=NOW() WHERE id=$1`, [pid]);
      }
    }
    await client.query('COMMIT');
    res.json({ message: 'Статус шинэчлэгдлээ', updated: targetIds.length });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ message: err.message });
  } finally { client.release(); }
};

const addParcels = async (req, res) => {
  const { parcel_ids } = req.body;
  try {
    await pool.query(
      `UPDATE parcels SET batch_id=$1 WHERE id=ANY($2)`,
      [req.params.id, parcel_ids]
    );
    res.json({ message: `${parcel_ids.length} ачаа нэмэгдлээ` });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const remove = async (req, res) => {
  try {
    await pool.query('UPDATE parcels SET batch_id=NULL WHERE batch_id=$1', [req.params.id]);
    await pool.query('DELETE FROM batches WHERE id=$1', [req.params.id]);
    res.json({ message: 'Устгагдлаа' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getAll, getOne, create, update, updateStatus, addParcels, remove };
