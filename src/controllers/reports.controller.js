const pool = require('../config/db');

const summary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const dateFilter = from && to ? `AND created_at BETWEEN '${from}' AND '${to}'::date+1` : '';

    const [p, b] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='delivered') as delivered,
          COUNT(*) FILTER (WHERE status='warehouse') as in_warehouse,
          COUNT(*) FILTER (WHERE status='warehouse' AND is_paid=false) as unpaid_warehouse,
          SUM(total_fee) as total_revenue,
          SUM(remaining_fee) as total_remaining
        FROM parcels WHERE 1=1 ${dateFilter}
      `),
      pool.query(`
        SELECT COUNT(*) as total,
          COUNT(*) FILTER (WHERE status='delivered') as delivered
        FROM batches WHERE 1=1 ${dateFilter}
      `)
    ]);

    res.json({ parcels: p.rows[0], batches: b.rows[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const byStatus = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT status, COUNT(*) as count FROM parcels GROUP BY status ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const byCargoType = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT cargo_type, COUNT(*) as count, SUM(total_fee) as revenue
      FROM parcels GROUP BY cargo_type ORDER BY count DESC
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const monthly = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        TO_CHAR(created_at, 'MM') as month,
        EXTRACT(YEAR FROM created_at) as year,
        COUNT(*) as count,
        SUM(total_fee) as revenue
      FROM parcels
      WHERE created_at >= NOW() - INTERVAL '12 months'
      GROUP BY month, year
      ORDER BY year, month
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const warehouse = async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, tracking_code, mn_name, mn_phone, quantity, arrived_at,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW()-arrived_at))/86400)-7)*quantity*1000 AS current_storage_fee
      FROM parcels
      WHERE status='warehouse'
      ORDER BY arrived_at ASC NULLS LAST
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { summary, byStatus, byCargoType, monthly, warehouse };
