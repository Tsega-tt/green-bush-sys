require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter((k) => !process.env[k]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('   Create a .env file (copy env.example -> .env) and fill these values.');
  process.exit(1);
}

const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: String(process.env.DB_PASSWORD),
});

const createTables = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Creating database tables...');

    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        pin_hash VARCHAR(255),
        role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'bakery_employee', 'cafe_waiter', 'cashier', 'kitchen_staff')),
        first_name VARCHAR(50),
        last_name VARCHAR(50),
        phone VARCHAR(20),
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(50)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`);
    await client.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true`);

    await client.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name='users' AND column_name='password'
        ) THEN
          EXECUTE 'ALTER TABLE users ALTER COLUMN password DROP NOT NULL';
        END IF;
      END $$;
    `);

    // Create menu_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS menu_items (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        price DECIMAL(10, 2) NOT NULL,
        category VARCHAR(50) NOT NULL,
        type VARCHAR(10) NOT NULL CHECK (type IN ('bakery', 'cafe')),
        is_available BOOLEAN DEFAULT true,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create orders table
    await client.query(`
      CREATE TABLE IF NOT EXISTS orders (
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

    // Create order_items table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        menu_item_id INTEGER REFERENCES menu_items(id),
        item_type VARCHAR(20) DEFAULT 'food',
        quantity INTEGER NOT NULL,
        unit_price DECIMAL(10, 2) NOT NULL,
        subtotal DECIMAL(10, 2) NOT NULL
      )
    `);

    await client.query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'food'`);

    // Create order_status_logs table
    await client.query(`
      CREATE TABLE IF NOT EXISTS order_status_logs (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
        status VARCHAR(20) NOT NULL,
        changed_by INTEGER REFERENCES users(id),
        changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create payments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        order_id INTEGER REFERENCES orders(id),
        amount DECIMAL(10, 2) NOT NULL,
        payment_method VARCHAR(20) NOT NULL CHECK (payment_method IN ('cash', 'card', 'qr_code', 'mobile_payment')),
        status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
        qr_code TEXT,
        processed_by INTEGER REFERENCES users(id),
        description TEXT,
        paid_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`ALTER TABLE payments ADD COLUMN IF NOT EXISTS description TEXT`);

    // Create attendance table
    await client.query(`
      CREATE TABLE IF NOT EXISTS attendance (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        date DATE NOT NULL,
        clock_in_time TIMESTAMP NOT NULL,
        clock_out_time TIMESTAMP,
        hours_worked DECIMAL(5, 2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes for better performance
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_type ON orders(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_employee ON orders(employee_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_menu_items_type ON menu_items(type)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_menu_items_available ON menu_items(is_available)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_active ON users(is_active)`);

    console.log('✅ Database tables created successfully!');

  } catch (error) {
    console.error('❌ Error creating tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

const seedData = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Seeding initial data...');

    // Create admin user
    const hashedPassword = await bcrypt.hash('admin123', BCRYPT_SALT_ROUNDS);
    
    await client.query(`
      INSERT INTO users (username, email, password_hash, role, first_name, last_name, is_active)
      VALUES ('admin', 'admin@bakeryCafe.com', $1, 'admin', 'System', 'Administrator', true)
      ON CONFLICT (username) DO NOTHING
    `, [hashedPassword]);

    // Create sample employees
    const sampleUsers = [
      { username: 'baker1', email: 'baker1@bakeryCafe.com', role: 'bakery_employee', first_name: 'John', last_name: 'Baker' },
      { username: 'waiter1', email: 'waiter1@bakeryCafe.com', role: 'cafe_waiter', first_name: 'Sarah', last_name: 'Waiter' },
      { username: 'cashier1', email: 'cashier1@bakeryCafe.com', role: 'cashier', first_name: 'Mike', last_name: 'Cashier' },
      { username: 'kitchen1', email: 'kitchen1@bakeryCafe.com', role: 'kitchen_staff', first_name: 'Anna', last_name: 'Chef' }
    ];

    for (const user of sampleUsers) {
      const userPassword = await bcrypt.hash('password123', BCRYPT_SALT_ROUNDS);
      await client.query(`
        INSERT INTO users (username, email, password_hash, role, first_name, last_name, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, true)
        ON CONFLICT (username) DO NOTHING
      `, [user.username, user.email, userPassword, user.role, user.first_name, user.last_name]);
    }

    // Create sample menu items
    const bakeryItems = [
      { name: 'Croissant', description: 'Buttery, flaky pastry', price: 3.50, category: 'Pastries' },
      { name: 'Chocolate Muffin', description: 'Rich chocolate muffin with chocolate chips', price: 4.00, category: 'Muffins' },
      { name: 'Sourdough Bread', description: 'Fresh baked sourdough loaf', price: 6.00, category: 'Breads' },
      { name: 'Apple Pie', description: 'Classic apple pie with cinnamon', price: 18.00, category: 'Pies' },
      { name: 'Bagel', description: 'Fresh baked bagel', price: 2.50, category: 'Breads' }
    ];

    const cafeItems = [
      { name: 'Espresso', description: 'Strong Italian coffee', price: 3.00, category: 'Coffee' },
      { name: 'Cappuccino', description: 'Espresso with steamed milk and foam', price: 4.50, category: 'Coffee' },
      { name: 'Caesar Salad', description: 'Fresh romaine lettuce with caesar dressing', price: 12.00, category: 'Salads' },
      { name: 'Grilled Sandwich', description: 'Grilled chicken and cheese sandwich', price: 8.50, category: 'Sandwiches' },
      { name: 'Fruit Smoothie', description: 'Mixed fruit smoothie', price: 6.00, category: 'Beverages' }
    ];

    for (const item of bakeryItems) {
      await client.query(`
        INSERT INTO menu_items (name, description, price, category, type)
        VALUES ($1, $2, $3, $4, 'bakery')
        ON CONFLICT DO NOTHING
      `, [item.name, item.description, item.price, item.category]);
    }

    for (const item of cafeItems) {
      await client.query(`
        INSERT INTO menu_items (name, description, price, category, type)
        VALUES ($1, $2, $3, $4, 'cafe')
        ON CONFLICT DO NOTHING
      `, [item.name, item.description, item.price, item.category]);
    }

    console.log('✅ Initial data seeded successfully!');

  } catch (error) {
    console.error('❌ Error seeding data:', error);
    throw error;
  } finally {
    client.release();
  }
};

const initializeDatabase = async () => {
  try {
    console.log('🚀 Initializing Bakery Café Database...');
    
    await createTables();
    await seedData();
    
    console.log('🎉 Database initialization completed successfully!');
    console.log('\n📋 Default Admin Credentials:');
    console.log('Username: admin');
    console.log('Password: admin123');
    console.log('\n📋 Sample Employee Credentials:');
    console.log('Username: baker1, waiter1, cashier1, kitchen1');
    console.log('Password: password123');
    
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run initialization if this file is executed directly
if (require.main === module) {
  initializeDatabase();
}

module.exports = { initializeDatabase, createTables, seedData };
