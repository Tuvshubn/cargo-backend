
const express = require('express');
const { auth, requireRole, requirePermission } = require('../middleware/auth');
const db = require('../config/db');
const router = express.Router();
const { login, me } = require('../controllers/auth.controller');

// DB шаардлагатай эсэхийг шалгах
const needDB = (fn) => async (req, res, next) => {
  if (!db._hasDB) return res.status(503).json({ message: 'DATABASE_URL тохируулагдаагүй. Vercel environment variables-д нэмнэ үү.' });
  try { await fn(req, res, next); } catch (err) { next(err); }
};

const c = (name) => {
  try { return require('../controllers/' + name + '.controller'); }
  catch (e) { return { [name]: (req, res) => res.status(501).json({ message: 'Not implemented' }) }; }
};

// ── Auth ──────────────────────────────────────────────────────────────────────
router.post('/auth/login', login);
router.get('/auth/me', auth, me);

// ── Parcels ───────────────────────────────────────────────────────────────────
router.get('/parcels/track', needDB((req, res) => c('parcels').track(req, res)));
router.get('/parcels/export', auth, requireRole('admin'), needDB((req, res) => c('parcels').exportExcel(req, res)));
router.get('/parcels', auth, requirePermission('parcels.view'), needDB((req, res) => c('parcels').getAll(req, res)));
router.get('/parcels/:id', auth, requirePermission('parcels.view'), needDB((req, res) => c('parcels').getOne(req, res)));
router.post('/parcels', auth, requirePermission('parcels.create'), needDB((req, res) => c('parcels').create(req, res)));
router.put('/parcels/:id', auth, requirePermission('parcels.edit'), needDB((req, res) => c('parcels').update(req, res)));
router.patch('/parcels/:id/status', auth, requirePermission('parcels.edit'), needDB((req, res) => c('parcels').updateStatus(req, res)));
router.delete('/parcels/:id', auth, requireRole('admin'), needDB((req, res) => c('parcels').remove(req, res)));

// ── Batches ───────────────────────────────────────────────────────────────────
router.get('/batches', auth, requirePermission('batches.view'), needDB((req, res) => c('batches').getAll(req, res)));
router.get('/batches/:id', auth, requirePermission('batches.view'), needDB((req, res) => c('batches').getOne(req, res)));
router.post('/batches', auth, requirePermission('batches.create'), needDB((req, res) => c('batches').create(req, res)));
router.put('/batches/:id', auth, requirePermission('batches.edit'), needDB((req, res) => c('batches').update(req, res)));
router.patch('/batches/:id/status', auth, requirePermission('batches.edit'), needDB((req, res) => c('batches').updateStatus(req, res)));
router.post('/batches/:id/parcels', auth, requirePermission('batches.edit'), needDB((req, res) => c('batches').addParcels(req, res)));
router.delete('/batches/:id', auth, requireRole('admin'), needDB((req, res) => c('batches').remove(req, res)));

// ── Deliveries ────────────────────────────────────────────────────────────────
router.get('/deliveries', auth, requirePermission('deliveries.manage'), needDB((req, res) => c('deliveries').getDeliveries(req, res)));
router.patch('/deliveries/:id/delivered', auth, requirePermission('deliveries.manage'), needDB((req, res) => c('deliveries').markDelivered(req, res)));

// ── Reports ───────────────────────────────────────────────────────────────────
router.get('/reports/summary', auth, requireRole('admin'), needDB((req, res) => c('reports').summary(req, res)));
router.get('/reports/status', auth, requireRole('admin'), needDB((req, res) => c('reports').byStatus(req, res)));
router.get('/reports/cargo-type', auth, requireRole('admin'), needDB((req, res) => c('reports').byCargoType(req, res)));
router.get('/reports/monthly', auth, requireRole('admin'), needDB((req, res) => c('reports').monthly(req, res)));
router.get('/reports/warehouse', auth, requireRole('admin'), needDB((req, res) => c('reports').warehouse(req, res)));

// ── Users ─────────────────────────────────────────────────────────────────────
router.get('/users', auth, requireRole('admin'), needDB((req, res) => c('users').getAll(req, res)));
router.post('/users', auth, requireRole('admin'), needDB((req, res) => c('users').create(req, res)));
router.put('/users/:id', auth, requireRole('admin'), needDB((req, res) => c('users').update(req, res)));
router.delete('/users/:id', auth, requireRole('admin'), needDB((req, res) => c('users').remove(req, res)));

// ── Permissions ───────────────────────────────────────────────────────────────
router.get('/permissions', auth, requireRole('admin'), needDB(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM role_permissions ORDER BY role,permission');
  res.json(rows);
}));
router.post('/permissions', auth, requireRole('admin'), needDB(async (req, res) => {
  const { role, permission } = req.body;
  await db.query('INSERT INTO role_permissions (role,permission) VALUES (\$1,\$2) ON CONFLICT DO NOTHING', [role, permission]);
  res.json({ success: true });
}));
router.delete('/permissions', auth, requireRole('admin'), needDB(async (req, res) => {
  const { role, permission } = req.body;
  await db.query('DELETE FROM role_permissions WHERE role=\$1 AND permission=\$2', [role, permission]);
  res.json({ success: true });
}));

// ── Payments ──────────────────────────────────────────────────────────────────
router.post('/payments/callback', needDB((req, res) => c('payments').callback(req, res)));
router.post('/payments/invoice', auth, needDB((req, res) => c('payments').createInvoice(req, res)));
router.get('/payments/check/:id', auth, needDB((req, res) => c('payments').checkPayment(req, res)));

module.exports = router;
