const db = require('../config/db');

const summary = async (req, res) => {
  try {
    const { rows: p } = await db.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status='delivered') as delivered,
        COUNT(*) FILTER (WHERE status IN ('warehouse','customs')) as in_warehouse,
        COUNT(*) FILTER (WHERE status IN ('warehouse','customs') AND is_paid=false) as unpaid_warehouse,
        SUM(total_fee) as total_revenue,
        SUM(remaining_fee) as total_remaining
      FROM parcels
    `);
    const { rows: b } = await db.query(`
      SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE status='completed') as delivered FROM batches
    `);
    res.json({ parcels: p[0], batches: b[0] });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const byStatus = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT status, COUNT(*) as count FROM parcels GROUP BY status ORDER BY count DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const byCargoType = async (req, res) => {
  try {
    const { rows } = await db.query('SELECT cargo_type, COUNT(*) as count FROM parcels GROUP BY cargo_type ORDER BY count DESC');
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const monthly = async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        to_char(DATE_TRUNC('month', created_at), 'YYYY-MM') as month,
        COUNT(*) as count,
        SUM(total_fee) as revenue
      FROM parcels
      GROUP BY month ORDER BY month DESC LIMIT 12
    `);
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const warehouse = async (req, res) => {
  try {
    const { rows } = await db.query("SELECT * FROM parcels WHERE status IN ('warehouse','customs') ORDER BY created_at");
    res.json(rows);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { summary, byStatus, byCargoType, monthly, warehouse };
