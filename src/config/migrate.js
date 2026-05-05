const pool = require('./db');
require('dotenv').config();

const migrate = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        phone VARCHAR(50),
        role VARCHAR(20) NOT NULL DEFAULT 'driver' CHECK (role IN ('admin', 'driver', 'delivery')),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Role permissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        role VARCHAR(20) NOT NULL,
        permission VARCHAR(100) NOT NULL,
        UNIQUE(role, permission)
      );
    `);

    // Batches table
    await client.query(`
      CREATE TABLE IF NOT EXISTS batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        batch_code VARCHAR(50) UNIQUE NOT NULL,
        name VARCHAR(255),
        departure_date DATE,
        status VARCHAR(50) DEFAULT 'incheon' CHECK (status IN (
          'incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered'
        )),
        notes TEXT,
        driver_id UUID REFERENCES users(id),
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Parcels table
    await client.query(`
      CREATE TABLE IF NOT EXISTS parcels (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tracking_code VARCHAR(50) UNIQUE NOT NULL,
        
        -- Korean sender info
        kr_name VARCHAR(255),
        kr_phone VARCHAR(50),
        kr_address TEXT,
        
        -- Mongolian receiver info
        mn_name VARCHAR(255) NOT NULL,
        mn_phone VARCHAR(50) NOT NULL,
        mn_address TEXT,
        
        -- Cargo details
        cargo_type VARCHAR(50) DEFAULT 'express' CHECK (cargo_type IN ('express','normal','online','vehicle','oversized','wholesale')),
        weight DECIMAL(10,2),
        quantity INTEGER DEFAULT 1,
        description TEXT,
        
        -- Payment
        paid_in_korea DECIMAL(12,2) DEFAULT 0,
        total_fee DECIMAL(12,2) DEFAULT 0,
        remaining_fee DECIMAL(12,2) DEFAULT 0,
        is_paid BOOLEAN DEFAULT false,
        paid_at TIMESTAMP,
        payment_method VARCHAR(50),
        qpay_invoice_id VARCHAR(255),
        
        -- Status & tracking
        status VARCHAR(50) DEFAULT 'incheon' CHECK (status IN (
          'incheon','tianjin','erlian','zamiin_uud','customs','warehouse','delivering','delivered'
        )),
        batch_id UUID REFERENCES batches(id),
        driver_id UUID REFERENCES users(id),
        delivery_driver_id UUID REFERENCES users(id),
        
        -- Storage fee
        arrived_at TIMESTAMP,
        collected_at TIMESTAMP,
        storage_fee DECIMAL(12,2) DEFAULT 0,
        
        -- Notes
        notes TEXT,
        is_fragile BOOLEAN DEFAULT false,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Parcel status history
    await client.query(`
      CREATE TABLE IF NOT EXISTS parcel_status_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parcel_id UUID REFERENCES parcels(id) ON DELETE CASCADE,
        status VARCHAR(50) NOT NULL,
        note TEXT,
        changed_by UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        parcel_id UUID REFERENCES parcels(id),
        amount DECIMAL(12,2) NOT NULL,
        method VARCHAR(50) DEFAULT 'qpay',
        qpay_invoice_id VARCHAR(255),
        qpay_payment_id VARCHAR(255),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','cancelled')),
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Insert default role permissions
    const permissions = [
      // Admin permissions
      ['admin', 'users.view'], ['admin', 'users.create'], ['admin', 'users.edit'], ['admin', 'users.delete'],
      ['admin', 'parcels.view'], ['admin', 'parcels.create'], ['admin', 'parcels.edit'], ['admin', 'parcels.delete'],
      ['admin', 'batches.view'], ['admin', 'batches.create'], ['admin', 'batches.edit'], ['admin', 'batches.delete'],
      ['admin', 'reports.view'], ['admin', 'permissions.manage'], ['admin', 'payments.view'],
      // Driver permissions
      ['driver', 'parcels.view'], ['driver', 'parcels.create'], ['driver', 'parcels.edit'],
      ['driver', 'batches.view'],
      // Delivery permissions
      ['delivery', 'parcels.view'], ['delivery', 'deliveries.manage'],
    ];

    for (const [role, perm] of permissions) {
      await client.query(
        `INSERT INTO role_permissions (role, permission) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [role, perm]
      );
    }

    await client.query('COMMIT');
    console.log('✅ Migration completed successfully');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration error:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
};

migrate().catch(console.error);
