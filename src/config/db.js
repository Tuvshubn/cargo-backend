
const { Pool } = require('pg');
let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000,
  });
  pool.on('error', err => console.error('PG error:', err.message));
}
module.exports = {
  query: async (sql, params) => {
    if (!pool) return { rows: [], rowCount: 0 };
    return pool.query(sql, params);
  },
  _hasDB: !!pool,
};
