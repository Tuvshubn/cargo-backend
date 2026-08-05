const db = require('./db');

const migrate = async () => {
  if (!db._hasDB) { console.log('No DB — skipping migration'); return; }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'driver',
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS batches (
        id SERIAL PRIMARY KEY,
        batch_code VARCHAR(50) UNIQUE NOT NULL,
        status VARCHAR(30) DEFAULT 'preparing',
        notes TEXT,
        departure_date DATE,
        arrival_date DATE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS parcels (
        id SERIAL PRIMARY KEY,
        tracking_code VARCHAR(20) UNIQUE NOT NULL,
        batch_id INTEGER REFERENCES batches(id),
        kr_name VARCHAR(100),
        kr_phone VARCHAR(20),
        kr_address TEXT,
        mn_name VARCHAR(100),
        mn_phone VARCHAR(20),
        mn_address TEXT,
        cargo_type VARCHAR(50) DEFAULT 'express',
        weight NUMERIC(8,2),
        quantity INTEGER DEFAULT 1,
        description TEXT,
        paid_in_korea NUMERIC(12,2) DEFAULT 0,
        total_fee NUMERIC(12,2) DEFAULT 0,
        remaining_fee NUMERIC(12,2) DEFAULT 0,
        is_paid BOOLEAN DEFAULT false,
        is_fragile BOOLEAN DEFAULT false,
        status VARCHAR(30) DEFAULT 'incheon',
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS role_permissions (
        id SERIAL PRIMARY KEY,
        role VARCHAR(20) NOT NULL,
        permission VARCHAR(50) NOT NULL,
        UNIQUE(role, permission)
      );
    `);
    console.log('✅ Migration done');
  } catch (err) {
    console.error('Migration error:', err.message);
  }
};

module.exports = migrate;
