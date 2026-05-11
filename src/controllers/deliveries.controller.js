const pool = require('../config/db');

const getDeliveries = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT p.*, b.code as batch_code
      FROM parcels p
      LEFT JOIN batch_parcels bp ON bp.parcel_id = p.id
      LEFT JOIN batches b ON b.id = bp.batch_id
      WHERE p.status IN ('delivering', 'warehouse')
      ORDER BY p.updated_at DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const markDelivered = async (req, res) => {
  try {
    const { id } = req.params;
    const { collected_by_phone } = req.body;

    // Verify parcel exists
    const { rows: [parcel] } = await pool.query('SELECT * FROM parcels WHERE id=$1', [id]);
    if (!parcel) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    if (parcel.status === 'delivered') return res.status(400).json({ message: 'Аль хэдийн хүргэгдсэн' });

    await pool.query(`
      UPDATE parcels
      SET status='delivered', collected_at=NOW(), collected_by_phone=$1, updated_at=NOW()
      WHERE id=$2
    `, [collected_by_phone || null, id]);

    // History log
    await pool.query(
      'INSERT INTO parcel_history (parcel_id, status, note) VALUES ($1,$2,$3)',
      [id, 'delivered', `Хүргэгдсэн — ${req.user.name}`]
    ).catch(() => {});

    res.json({ success: true, message: 'Хүргэгдсэн гэж тэмдэглэлээ' });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { getDeliveries, markDelivered };
