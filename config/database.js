require('dotenv').config();
const { Pool } = require('pg');

// Only create pool if database credentials are provided
let pool = null;

if (process.env.DB_HOST && process.env.DB_NAME && process.env.DB_USER && process.env.DB_PASSWORD) {
  pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  // Test database connection
  pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
  });

  pool.on('error', (err) => {
    console.error('❌ Database connection error:', err);
  });
  
  console.log('🗄️ PostgreSQL pool created');
} else {
  console.log('⚠️ No database credentials - using mock data only');
}

module.exports = {
  query: async (text, params) => {
    if (!pool) {
      throw new Error('Database not configured - using mock data');
    }
    return pool.query(text, params);
  },
  pool
};
