const express = require('express');
const { login, me } = require('../controllers/auth.controller');
const { getAll: getUsers, create: createUser, update: updateUser, remove: removeUser } = require('../controllers/users.controller');
const { getAll: getParcels, getOne, track, create: createParcel, update: updateParcel, updateStatus, remove: removeParcel, exportExcel } = require('../controllers/parcels.controller');
const { getAll: getBatches, getOne: getBatch, create: createBatch, update: updateBatch, updateStatus: updateBatchStatus, addParcels, remove: removeBatch } = require('../controllers/batches.controller');
const { summary, byStatus, byCargoType, monthly, warehouse, uncollectedKorea } = require('../controllers/reports.controller');
const { createInvoice, checkPayment, callback } = require('../controllers/payments.controller');
const { auth, requireRole } = require('../middleware/auth');

const router = express.Router();

// Auth
router.post('/auth/login', login);
router.get('/auth/me', auth, me);

// Public tracking
router.get('/parcels/track', track);

// Payment callback (public)
router.post('/payments/callback', callback);

// Users (admin only)
router.get('/users', auth, requireRole('admin'), getUsers);
router.post('/users', auth, requireRole('admin'), createUser);
router.put('/users/:id', auth, requireRole('admin'), updateUser);
router.delete('/users/:id', auth, requireRole('admin'), removeUser);

// Permissions
router.get('/permissions', auth, requireRole('admin'), async (req, res) => {
  const pool = require('../config/db');
  const { rows } = await pool.query('SELECT * FROM role_permissions ORDER BY role, permission');
  res.json(rows);
});
router.post('/permissions', auth, requireRole('admin'), async (req, res) => {
  const pool = require('../config/db');
  const { role, permission } = req.body;
  await pool.query('INSERT INTO role_permissions (role, permission) VALUES ($1,$2) ON CONFLICT DO NOTHING', [role, permission]);
  res.json({ success: true });
});
router.delete('/permissions', auth, requireRole('admin'), async (req, res) => {
  const pool = require('../config/db');
  const { role, permission } = req.body;
  await pool.query('DELETE FROM role_permissions WHERE role=$1 AND permission=$2', [role, permission]);
  res.json({ success: true });
});

// Parcels
router.get('/parcels', auth, getParcels);
router.get('/parcels/export', auth, requireRole('admin'), exportExcel);
router.get('/parcels/:id', auth, getOne);
router.post('/parcels', auth, requireRole('admin', 'driver'), createParcel);
router.put('/parcels/:id', auth, requireRole('admin', 'driver'), updateParcel);
router.patch('/parcels/:id/status', auth, updateStatus);
router.delete('/parcels/:id', auth, requireRole('admin'), removeParcel);

// Batches
router.get('/batches', auth, getBatches);
router.get('/batches/:id', auth, getBatch);
router.post('/batches', auth, requireRole('admin'), createBatch);
router.put('/batches/:id', auth, requireRole('admin'), updateBatch);
router.patch('/batches/:id/status', auth, requireRole('admin'), updateBatchStatus);
router.post('/batches/:id/parcels', auth, requireRole('admin'), addParcels);
router.delete('/batches/:id', auth, requireRole('admin'), removeBatch);

// Reports
router.get('/reports/summary', auth, requireRole('admin'), summary);
router.get('/reports/status', auth, requireRole('admin'), byStatus);
router.get('/reports/cargo-type', auth, requireRole('admin'), byCargoType);
router.get('/reports/monthly', auth, requireRole('admin'), monthly);
router.get('/reports/warehouse', auth, requireRole('admin'), warehouse);
router.get('/reports/uncollected-korea', auth, requireRole('admin'), uncollectedKorea);

// Payments
router.post('/payments/invoice', createInvoice);
router.get('/payments/check/:invoice_id', checkPayment);

// Delivery driver routes
router.get('/deliveries', auth, requireRole('admin', 'delivery'), async (req, res) => {
  const pool = require('../config/db');
  const where = req.user.role === 'delivery' ? 'WHERE p.delivery_driver_id=$1' : 'WHERE p.status IN (\'warehouse\',\'delivering\')';
  const params = req.user.role === 'delivery' ? [req.user.id] : [];
  const { rows } = await pool.query(
    `SELECT p.*, b.batch_code FROM parcels p LEFT JOIN batches b ON p.batch_id=b.id ${where} ORDER BY p.arrived_at ASC`,
    params
  );
  res.json(rows);
});

router.patch('/deliveries/:id/delivered', auth, requireRole('admin', 'delivery'), async (req, res) => {
  const pool = require('../config/db');
  await pool.query(
    `UPDATE parcels SET status='delivered', collected_at=NOW(), updated_at=NOW() WHERE id=$1`,
    [req.params.id]
  );
  await pool.query(
    `INSERT INTO parcel_status_history (parcel_id,status,note,changed_by) VALUES ($1,'delivered','Хүргэгдлээ',$2)`,
    [req.params.id, req.user.id]
  );
  res.json({ success: true });
});

module.exports = router;
