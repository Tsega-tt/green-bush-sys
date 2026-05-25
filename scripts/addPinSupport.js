require('dotenv').config();
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingEnvVars = requiredEnvVars.filter((k) => !process.env[k]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
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

const addPinSupport = async () => {
  const client = await pool.connect();
  
  try {
    console.log('🔄 Adding PIN support to users table...');

    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)
    `);

    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS first_name VARCHAR(50)
    `);

    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS last_name VARCHAR(50)
    `);

    // Add is_active column with default true
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true
    `);

    // Update existing users to be active
    await client.query(`
      UPDATE users SET is_active = true WHERE is_active IS NULL
    `);

    // Add phone and address columns for profile management
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
      ADD COLUMN IF NOT EXISTS address TEXT
    `);

    await client.query(`
      ALTER TABLE payments 
      ADD COLUMN IF NOT EXISTS description TEXT
    `);

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

    console.log('✅ PIN column added successfully!');

    // Create sample users with PINs for demo
    console.log('🔄 Creating sample users with PINs...');

    const samplePinUsers = [
      { full_name: 'Mike Waiter', role: 'cafe_waiter', pin: '1234' },
      { full_name: 'Anna Waiter', role: 'cafe_waiter', pin: '1234' },
      { full_name: 'David Waiter', role: 'cafe_waiter', pin: '1234' },
      { full_name: 'Sophie Waiter', role: 'cafe_waiter', pin: '1234' }
    ];

    const sampleStaffUsers = [
      { full_name: 'Sarah Baker', role: 'bakery_employee', password: 'baker123' },
      { full_name: 'Lisa Cashier', role: 'cashier', password: 'cashier123' },
      { full_name: 'Tom Kitchen', role: 'kitchen_staff', password: 'kitchen123' },
      { full_name: 'Emma Baker', role: 'bakery_employee', password: 'baker456' },
      { full_name: 'John Cashier', role: 'cashier', password: 'cashier456' },
      { full_name: 'Maria Kitchen', role: 'kitchen_staff', password: 'kitchen456' }
    ];

    const sampleAdminUsers = [
      { username: 'admin', full_name: 'Administrator', role: 'admin', password: 'admin123' }
    ];

    // Create PIN users (waiters)
    for (const user of samplePinUsers) {
      const hashedPin = await bcrypt.hash(user.pin, BCRYPT_SALT_ROUNDS);
      const username = user.full_name.toLowerCase().replace(/\s+/g, '_');
      const email = `${username}@bakeryCafe.com`;
      const parts = String(user.full_name || '').trim().split(/\s+/g);
      const first_name = parts.shift() || '';
      const last_name = parts.join(' ');
      
      await client.query(`
        INSERT INTO users (username, email, password_hash, role, first_name, last_name, pin_hash, is_active)
        VALUES ($1, $2, NULL, $3, $4, $5, $6, true)
        ON CONFLICT (username) DO UPDATE SET
          pin_hash = EXCLUDED.pin_hash,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          password_hash = NULL,
          is_active = true
      `, [username, email, user.role, first_name, last_name, hashedPin]);
    }

    // Create staff users (cashiers, bakers, kitchen staff) with passwords
    for (const user of sampleStaffUsers) {
      const hashedPassword = await bcrypt.hash(user.password, BCRYPT_SALT_ROUNDS);
      const username = user.full_name.toLowerCase().replace(/\s+/g, '_');
      const email = `${username}@bakeryCafe.com`;
      const parts = String(user.full_name || '').trim().split(/\s+/g);
      const first_name = parts.shift() || '';
      const last_name = parts.join(' ');
      
      await client.query(`
        INSERT INTO users (username, email, password_hash, role, first_name, last_name, pin_hash, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, true)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          pin_hash = NULL,
          is_active = true
      `, [username, email, hashedPassword, user.role, first_name, last_name]);
    }

    // Create admin users with traditional username/password
    for (const user of sampleAdminUsers) {
      const hashedPassword = await bcrypt.hash(user.password, BCRYPT_SALT_ROUNDS);
      const email = `${user.username}@bakeryCafe.com`;
      const parts = String(user.full_name || '').trim().split(/\s+/g);
      const first_name = parts.shift() || '';
      const last_name = parts.join(' ');
      
      await client.query(`
        INSERT INTO users (username, email, password_hash, role, first_name, last_name, pin_hash, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, NULL, true)
        ON CONFLICT (username) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          first_name = EXCLUDED.first_name,
          last_name = EXCLUDED.last_name,
          pin_hash = NULL,
          is_active = true
      `, [user.username, email, hashedPassword, user.role, first_name, last_name]);
    }

    console.log('✅ Sample users created successfully!');
    console.log('\n📋 Sample Waiter Users (PIN: 1234):');
    console.log('- Mike Waiter (Café Waiter)');
    console.log('- Anna Waiter (Café Waiter)');
    console.log('- David Waiter (Café Waiter)');
    console.log('- Sophie Waiter (Café Waiter)');
    console.log('\n📋 Sample Staff Users (Name + Password):');
    console.log('- Sarah Baker (baker123)');
    console.log('- Lisa Cashier (cashier123)');
    console.log('- Tom Kitchen (kitchen123)');
    console.log('- Emma Baker (baker456)');
    console.log('- John Cashier (cashier456)');
    console.log('- Maria Kitchen (kitchen456)');
    console.log('\n📋 Sample Admin Users (Username + Password):');
    console.log('- admin (admin123)');

  } catch (error) {
    console.error('❌ Error adding PIN support:', error);
    throw error;
  } finally {
    client.release();
  }
};

const runMigration = async () => {
  try {
    console.log('🚀 Running PIN support migration...');
    
    await addPinSupport();
    
    console.log('🎉 PIN support migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

// Run migration if this file is executed directly
if (require.main === module) {
  runMigration();
}

module.exports = { addPinSupport };
