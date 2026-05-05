const axios = require('axios');
const pool = require('../config/db');

const getQPayToken = async () => {
  const res = await axios.post(`${process.env.QPAY_URL}/auth/token`, {}, {
    auth: { username: process.env.QPAY_USERNAME, password: process.env.QPAY_PASSWORD }
  });
  return res.data.access_token;
};

const createInvoice = async (req, res) => {
  const { parcel_id } = req.body;
  try {
    const { rows } = await pool.query('SELECT * FROM parcels WHERE id=$1', [parcel_id]);
    const parcel = rows[0];
    if (!parcel) return res.status(404).json({ message: 'Ачаа олдсонгүй' });
    if (parcel.is_paid) return res.status(400).json({ message: 'Аль хэдийн төлөгдсөн' });

    // Calculate storage fee
    let storageFee = 0;
    if (parcel.arrived_at) {
      const days = Math.floor((new Date() - new Date(parcel.arrived_at)) / 86400000);
      if (days > 7) storageFee = (days - 7) * parcel.quantity * 1000;
    }

    const totalAmount = parseFloat(parcel.remaining_fee) + storageFee;

    const token = await getQPayToken();
    const invoice = await axios.post(`${process.env.QPAY_URL}/invoice`, {
      invoice_code: process.env.QPAY_INVOICE_CODE,
      sender_invoice_no: parcel.tracking_code,
      invoice_receiver_code: parcel.mn_phone,
      invoice_description: `Ачааны төлбөр: ${parcel.tracking_code}`,
      amount: totalAmount,
      callback_url: `${process.env.API_URL || 'http://localhost:5000'}/api/payments/callback`
    }, { headers: { Authorization: `Bearer ${token}` } });

    // Save to DB
    await pool.query(
      `INSERT INTO payments (parcel_id, amount, qpay_invoice_id, status) VALUES ($1,$2,$3,'pending')`,
      [parcel_id, totalAmount, invoice.data.invoice_id]
    );
    await pool.query(
      `UPDATE parcels SET qpay_invoice_id=$1 WHERE id=$2`,
      [invoice.data.invoice_id, parcel_id]
    );

    res.json({
      invoice_id: invoice.data.invoice_id,
      qr_text: invoice.data.qr_text,
      qr_image: invoice.data.qr_image,
      qPay_shortUrl: invoice.data.qPay_shortUrl,
      urls: invoice.data.urls,
      amount: totalAmount,
      storage_fee: storageFee,
    });
  } catch (err) {
    console.error('QPay error:', err.response?.data || err.message);
    res.status(500).json({ message: 'QPay холболт амжилтгүй. Дараа дахин оролдоно уу.' });
  }
};

const checkPayment = async (req, res) => {
  const { invoice_id } = req.params;
  try {
    const token = await getQPayToken();
    const check = await axios.get(`${process.env.QPAY_URL}/payment/check`, {
      params: { invoice_id },
      headers: { Authorization: `Bearer ${token}` }
    });

    if (check.data.paid) {
      await pool.query(
        `UPDATE payments SET status='paid', paid_at=NOW(), qpay_payment_id=$1 WHERE qpay_invoice_id=$2`,
        [check.data.payment_id, invoice_id]
      );
      const { rows } = await pool.query('SELECT parcel_id FROM payments WHERE qpay_invoice_id=$1', [invoice_id]);
      if (rows[0]) {
        await pool.query(
          `UPDATE parcels SET is_paid=true, paid_at=NOW(), remaining_fee=0, payment_method='qpay' WHERE id=$1`,
          [rows[0].parcel_id]
        );
      }
    }
    res.json(check.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const callback = async (req, res) => {
  const { invoice_id, payment_id } = req.body;
  try {
    await pool.query(
      `UPDATE payments SET status='paid', paid_at=NOW(), qpay_payment_id=$1 WHERE qpay_invoice_id=$2`,
      [payment_id, invoice_id]
    );
    const { rows } = await pool.query('SELECT parcel_id FROM payments WHERE qpay_invoice_id=$1', [invoice_id]);
    if (rows[0]) {
      await pool.query(
        `UPDATE parcels SET is_paid=true, paid_at=NOW(), remaining_fee=0, payment_method='qpay' WHERE id=$1`,
        [rows[0].parcel_id]
      );
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: err.message }); }
};

module.exports = { createInvoice, checkPayment, callback };
