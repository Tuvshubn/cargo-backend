const pool = require('../config/db');

const summary = async (req, res) => {
  try {
    const { from, to } = req.query;
    let dateFilter = '', params = [];
    if (from && to) { dateFilter = `WHERE created_at BETWEEN $1 AND $2`; params = [from, to]; }
    else if (from) { dateFilter = `WHERE created_at >= $1`; params = [from]; }
    else if (to) { dateFilter = `WHERE created_at <= $1`; params = [to]; }

    const [parcels, payments, batches, storage] = await Promise.all([
      pool.query(`SELECT 
        COUNT(*) as total, 
        COUNT(*) FILTER (WHERE status='delivered') as delivered,
        COUNT(*) FILTER (WHERE status='warehouse') as in_warehouse,
        COUNT(*) FILTER (WHERE is_paid=false AND status='warehouse') as unpaid_warehouse,
        SUM(total_fee) as total_revenue,
        SUM(remaining_fee) as total_remaining,
        SUM(paid_in_korea) as total_paid_korea
        FROM parcels ${dateFilter}`, params),
      pool.query(`SELECT COUNT(*) as total, SUM(amount) as total_amount FROM payments WHERE status='paid' ${from ? `AND created_at >= '${from}'` : ''}`),
      pool.query(`SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='delivered') as delivered FROM batches ${dateFilter}`, params),
      pool.query(`SELECT SUM(storage_fee) as total FROM parcels WHERE storage_fee > 0 ${dateFilter.replace('WHERE','AND')}`, params),
    ]);

    res.json({
      parcels: parcels.rows[0],
      payments: payments.rows[0],
      batches: batches.rows[0],
      storage: storage.rows[0],
    });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const byStatus = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT status, COUNT(*) as count, SUM(total_fee) as total_fee
       FROM parcels GROUP BY status ORDER BY count DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const byCargoType = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT cargo_type, COUNT(*) as count, SUM(total_fee) as total_fee
       FROM parcels GROUP BY cargo_type ORDER BY count DESC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const monthly = async (req, res) => {
  try {
    const { year = new Date().getFullYear() } = req.query;
    const { rows } = await pool.query(
      `SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        COUNT(*) as count,
        SUM(total_fee) as revenue,
        SUM(remaining_fee) as remaining
       FROM parcels
       WHERE EXTRACT(YEAR FROM created_at) = $1
       GROUP BY month ORDER BY month`,
      [year]
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const warehouse = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, 
        CASE WHEN p.arrived_at IS NOT NULL THEN 
          GREATEST(0, EXTRACT(DAY FROM NOW() - p.arrived_at) - 7) * p.quantity * 1000
        ELSE 0 END as current_storage_fee
       FROM parcels p
       WHERE p.status = 'warehouse'
       ORDER BY p.arrived_at ASC NULLS LAST`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const uncollectedKorea = async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM parcels WHERE batch_id IS NULL AND status='incheon' ORDER BY created_at ASC`
    );
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { summary, byStatus, byCargoType, monthly, warehouse, uncollectedKorea };
