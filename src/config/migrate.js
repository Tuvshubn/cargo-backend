require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});

const migrate = async () => {
  console.log('🔄 Running migrations...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'driver' CHECK (role IN ('admin','driver','delivery')),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(200),
        status VARCHAR(30) DEFAULT 'incheon' CHECK (status IN ('incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered')),
        departure_date DATE,
        arrival_date DATE,
        driver_id UUID REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parcels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_code VARCHAR(30) UNIQUE NOT NULL,
        kr_name VARCHAR(100),
        kr_phone VARCHAR(30),
        kr_address TEXT,
        mn_name VARCHAR(100) NOT NULL,
        mn_phone VARCHAR(20) NOT NULL,
        mn_address TEXT,
        cargo_type VARCHAR(30) DEFAULT 'express' CHECK (cargo_type IN ('express','normal','online','vehicle','oversized','wholesale')),
        weight DECIMAL(10,2),
        quantity INTEGER DEFAULT 1,
        description TEXT,
        status VARCHAR(30) DEFAULT 'incheon' CHECK (status IN ('incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered')),
        paid_in_korea DECIMAL(12,2) DEFAULT 0,
        total_fee DECIMAL(12,2) DEFAULT 0,
        remaining_fee DECIMAL(12,2) DEFAULT 0,
        is_paid BOOLEAN DEFAULT false,
        is_fragile BOOLEAN DEFAULT false,
        notes TEXT,
        arrived_at TIMESTAMP,
        collected_at TIMESTAMP,
        collected_by_phone VARCHAR(20),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS batch_parcels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
        parcel_id UUID REFERENCES parcels(id) ON DELETE CASCADE,
        UNIQUE(batch_id, parcel_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS parcel_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parcel_id UUID REFERENCES parcels(id) ON DELETE CASCADE,
        status VARCHAR(30),
        note TEXT,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role VARCHAR(20) NOT NULL,
        permission VARCHAR(50) NOT NULL,
        UNIQUE(role, permission)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parcel_id UUID REFERENCES parcels(id),
        amount DECIMAL(12,2) NOT NULL,
        qpay_invoice_id VARCHAR(100),
        qpay_qr_text TEXT,
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','failed')),
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parcels_tracking ON parcels(tracking_code);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parcels_status ON parcels(status);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parcels_mn_phone ON parcels(mn_phone);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_parcel_history_parcel ON parcel_history(parcel_id);`);

    await client.query('COMMIT');
    console.log('✅ Migration complete!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
};

migrate().catch(console.error);
