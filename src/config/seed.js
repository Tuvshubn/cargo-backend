const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const seed = async () => {
  const client = await pool.connect();
  try {
    const hash = await bcrypt.hash('admin123!', 12);
    await client.query(`
      INSERT INTO users (name, email, password, role, phone)
      VALUES ('Super Admin', 'admin@cargo.mn', $1, 'admin', '75005747')
      ON CONFLICT (email) DO NOTHING
    `, [hash]);
    console.log('✅ Seed completed. Admin: admin@cargo.mn / admin123!');
  } finally {
    client.release();
    pool.end();
  }
};

seed().catch(console.error);
