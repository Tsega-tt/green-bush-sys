require('dotenv').config();
const { Pool } = require('pg');

const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter((k) => !process.env[k]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  process.exit(1);
}

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

const cleanOrdersTable = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Cleaning orders table...');

    // Start fresh - drop and recreate the orders table
    await client.query('BEGIN');
    
    console.log('🗑️  Dropping existing orders table and related tables...');
    await client.query('DROP TABLE IF EXISTS order_status_logs CASCADE');
    await client.query('DROP TABLE IF EXISTS order_items CASCADE');
    await client.query('DROP TABLE IF EXISTS orders CASCADE');
    
    console.log('🔨 Creating clean orders table...');
    await client.query(`
      CREATE TABLE orders (
        id SERIAL PRIMARY KEY,
        customer_id UUID NOT NULL,
        employee_id INTEGER REFERENCES users(id),
        table_number INTEGER,
        type VARCHAR(10) NOT NULL CHECK (type IN ('bakery', 'cafe')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'preparing', 'ready', 'completed', 'cancelled', 'paid')),
        total_amount DECIMAL(10, 2) NOT NULL,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('🔨 Creating order_items table...');
    await client.query(`
      CREATE TABLE order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES menu_items(id),
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL
      )
    `);

    console.log('🔨 Creating order_status_logs table...');
    await client.query(`
      CREATE TABLE order_status_logs (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        changed_by INTEGER REFERENCES users(id),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    console.log('📊 Creating indexes...');
    await client.query(`CREATE INDEX idx_orders_status ON orders(status)`);
    await client.query(`CREATE INDEX idx_orders_type ON orders(type)`);
    await client.query(`CREATE INDEX idx_orders_employee ON orders(employee_id)`);
    await client.query(`CREATE INDEX idx_orders_created_at ON orders(created_at)`);

    await client.query('COMMIT');
    console.log('✅ Orders table cleaned and recreated successfully!');
    console.log('💡 You can now create new orders through the application.');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error cleaning orders table:', error);
    throw error;
  } finally {
    client.release();
  }
};

const runClean = async () => {
  try {
    console.log('🚀 Running orders table cleanup...');
    
    await cleanOrdersTable();
    
    console.log('🎉 Orders table cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run cleanup if this file is executed directly
if (require.main === module) {
  runClean();
}

module.exports = { cleanOrdersTable };
