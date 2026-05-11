const pool = require('../config/db');

const createInvoice = async (req, res) => {
  try {
    const { parcel_id } = req.body;
    const { rows: [p] } = await pool.query('SELECT * FROM parcels WHERE id=$1', [parcel_id]);
    if (!p) return res.status(404).json({ message: 'Ачаа олдсонгүй' });

    const storageFee = Math.max(0, Math.floor((Date.now() - new Date(p.arrived_at||Date.now()).getTime()) / 86400000 - 7)) * p.quantity * 1000;
    const amount = p.remaining_fee + storageFee;

    if (amount <= 0) return res.status(400).json({ message: 'Төлбөр байхгүй' });

    // QPay integration placeholder
    const invoiceId = `INV-${Date.now()}`;
    const qrText = `https://qpay.mn/q/${invoiceId}`;

    const { rows: [inv] } = await pool.query(
      `INSERT INTO payments (parcel_id, amount, qpay_invoice_id, qpay_qr_text) VALUES ($1,$2,$3,$4) RETURNING *`,
      [parcel_id, amount, invoiceId, qrText]
    );

    res.json({ invoice_id: invoiceId, qr_text: qrText, amount, payment_id: inv.id });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const checkPayment = async (req, res) => {
  try {
    const { rows: [p] } = await pool.query('SELECT * FROM payments WHERE id=$1', [req.params.id]);
    if (!p) return res.status(404).json({ message: 'Төлбөр олдсонгүй' });
    res.json(p);
  } catch (err) { res.status(500).json({ message: err.message }); }
};

const callback = async (req, res) => {
  try {
    const { invoice_id } = req.body;
    await pool.query(
      `UPDATE payments SET status='paid', paid_at=NOW() WHERE qpay_invoice_id=$1`,
      [invoice_id]
    );
    const { rows: [pay] } = await pool.query(
      `SELECT * FROM payments WHERE qpay_invoice_id=$1`, [invoice_id]
    );
    if (pay) {
      await pool.query(
        `UPDATE parcels SET is_paid=true, remaining_fee=0, updated_at=NOW() WHERE id=$1`,
        [pay.parcel_id]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { createInvoice, checkPayment, callback };
