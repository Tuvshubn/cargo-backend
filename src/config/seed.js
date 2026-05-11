require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

const seed = async () => {
  console.log('🌱 Seeding database...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── Users ─────────────────────────────────────────────────────────────────
    const adminPass    = await bcrypt.hash('admin123!', 12);
    const driverPass   = await bcrypt.hash('driver123!', 12);
    const delivPass    = await bcrypt.hash('delivery123!', 12);

    await client.query(`
      INSERT INTO users (name, email, password, role, phone)
      VALUES
        ('Super Admin',      'admin@cargo.mn',    $1, 'admin',    '7500-5747'),
        ('Батжаргал Жолооч', 'driver@cargo.mn',   $2, 'driver',   '9911-1234'),
        ('Сүхбаатар Хүргэлт','delivery@cargo.mn', $3, 'delivery', '9922-5678')
      ON CONFLICT (email) DO NOTHING
    `, [adminPass, driverPass, delivPass]);

    // ── Default permissions ───────────────────────────────────────────────────
    await client.query(`
      INSERT INTO role_permissions (role, permission) VALUES
        ('driver',   'parcels.view'),
        ('driver',   'parcels.create'),
        ('driver',   'parcels.edit'),
        ('driver',   'batches.view'),
        ('driver',   'batches.create'),
        ('driver',   'batches.edit'),
        ('delivery', 'parcels.view'),
        ('delivery', 'deliveries.manage')
      ON CONFLICT DO NOTHING
    `);

    // ── Sample batch ──────────────────────────────────────────────────────────
    const { rows: [admin] } = await client.query("SELECT id FROM users WHERE email='admin@cargo.mn'");

    const { rows: [batch] } = await client.query(`
      INSERT INTO batches (code, name, status, departure_date, driver_id)
      VALUES ('BCH240501XYZ', '2024 5-р сарын 1-р ачаа', 'warehouse', '2024-05-01', $1)
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [admin.id]);

    // ── Sample parcels ────────────────────────────────────────────────────────
    const parcels = [
      { code:'MN240501AB12', mn_name:'Батболд Д.',     mn_phone:'9911-2233', type:'express', qty:3,  status:'warehouse', paid:50000, total:130000, remaining:80000, arrived: new Date(Date.now()-10*86400000) },
      { code:'MN240430CD34', mn_name:'Сарангэрэл О.',  mn_phone:'9922-4455', type:'wholesale',qty:10, status:'delivering',paid:200000,total:200000,remaining:0,     arrived: new Date(Date.now()-5*86400000) },
      { code:'MN240428EF56', mn_name:'Энхбаяр Ц.',     mn_phone:'9933-6677', type:'online',  qty:1,  status:'customs',  paid:0,     total:45000, remaining:45000,   arrived: null },
      { code:'MN240425GH78', mn_name:'Мөнхзул Б.',     mn_phone:'9944-8899', type:'vehicle', qty:1,  status:'erlian',   paid:0,     total:1200000,remaining:1200000,arrived: null },
      { code:'MN240420IJ90', mn_name:'Дорж Г.',        mn_phone:'9955-1122', type:'express', qty:5,  status:'delivered',paid:150000,total:150000,remaining:0,       arrived: new Date(Date.now()-20*86400000) },
      { code:'MN240415KL12', mn_name:'Номинчимэг Э.',  mn_phone:'9977-5544', type:'express', qty:2,  status:'warehouse',paid:40000, total:75000, remaining:35000,   arrived: new Date(Date.now()-15*86400000) },
      { code:'MN240410MN34', mn_name:'Гантулга Б.',    mn_phone:'9988-6655', type:'wholesale',qty:6, status:'warehouse',paid:100000,total:100000,remaining:0,       arrived: new Date(Date.now()-25*86400000) },
    ];

    for (const p of parcels) {
      const isPaid = p.remaining === 0;
      const arrivedAt = p.arrived ? `'${p.arrived.toISOString()}'` : 'NULL';
      const { rows: [inserted] } = await client.query(`
        INSERT INTO parcels (tracking_code, mn_name, mn_phone, cargo_type, quantity, status,
          paid_in_korea, total_fee, remaining_fee, is_paid, arrived_at, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,${arrivedAt},$11)
        ON CONFLICT (tracking_code) DO UPDATE SET status = EXCLUDED.status
        RETURNING id
      `, [p.code, p.mn_name, p.mn_phone, p.type, p.qty, p.status,
          p.paid, p.total, p.remaining, isPaid, admin.id]);

      // Add to batch
      await client.query(`
        INSERT INTO batch_parcels (batch_id, parcel_id) VALUES ($1,$2) ON CONFLICT DO NOTHING
      `, [batch.id, inserted.id]);

      // Add history
      const histSteps = ['incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered'];
      const curIdx = histSteps.indexOf(p.status);
      for (let i = 0; i <= curIdx; i++) {
        await client.query(`
          INSERT INTO parcel_history (parcel_id, status, note, created_by)
          VALUES ($1,$2,$3,$4)
        `, [inserted.id, histSteps[i],
            i === 0 ? 'Падан бүртгэгдлээ' : i === curIdx ? 'Шинэчлэгдлээ' : null,
            admin.id]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seed complete! Users:');
    console.log('  admin@cargo.mn    / admin123!');
    console.log('  driver@cargo.mn   / driver123!');
    console.log('  delivery@cargo.mn / delivery123!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

seed().catch(console.error);
