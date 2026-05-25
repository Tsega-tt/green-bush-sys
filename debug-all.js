// Comprehensive debug script to check everything
require('dotenv').config();

async function debugEverything() {
  console.log('🔍 COMPREHENSIVE DEBUG CHECK\n');
  console.log('=' .repeat(50));

  try {
    // 1. Environment Variables
    console.log('\n1️⃣ ENVIRONMENT VARIABLES:');
    console.log('NODE_ENV:', process.env.NODE_ENV || 'NOT SET');
    console.log('DB_HOST:', process.env.DB_HOST || 'NOT SET');
    console.log('DB_PORT:', process.env.DB_PORT || 'NOT SET');
    console.log('DB_NAME:', process.env.DB_NAME || 'NOT SET');
    console.log('DB_USER:', process.env.DB_USER || 'NOT SET');
    console.log('DB_PASSWORD:', process.env.DB_PASSWORD ? '***SET***' : 'NOT SET');

    // 2. Database Connection
    console.log('\n2️⃣ DATABASE CONNECTION:');
    const db = require('./config/database');
    
    try {
      const result = await db.query('SELECT NOW() as current_time, version() as pg_version');
      console.log('✅ Database connected successfully');
      console.log('Current time:', result.rows[0].current_time);
      console.log('PostgreSQL version:', result.rows[0].pg_version);
    } catch (dbError) {
      console.error('❌ Database connection failed:', dbError.message);
      return;
    }

    // 3. Check Users Table
    console.log('\n3️⃣ USERS TABLE CHECK:');
    try {
      const usersResult = await db.query(`
        SELECT id, username, first_name, last_name, role, is_active,
               CASE WHEN password_hash IS NOT NULL THEN 'SET' ELSE 'NOT SET' END as password_status,
               LENGTH(password_hash) as hash_length
        FROM users 
        ORDER BY id
      `);
      
      console.log(`Found ${usersResult.rows.length} users:`);
      usersResult.rows.forEach(user => {
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
        console.log(`  - ID: ${user.id}`);
        console.log(`    Username: ${user.username}`);
        console.log(`    Full Name: "${fullName}"`);
        console.log(`    Role: ${user.role}`);
        console.log(`    Active: ${user.is_active}`);
        console.log(`    Password: ${user.password_status} (${user.hash_length} chars)`);
        console.log('');
      });
    } catch (tableError) {
      console.error('❌ Users table error:', tableError.message);
    }

    // 4. Test PIN Login Logic
    console.log('\n4️⃣ PIN LOGIN LOGIC TEST:');
    const testNames = ['Admin User', 'Test Waiter', 'Admin', 'Test'];
    
    for (const testName of testNames) {
      console.log(`\nTesting name: "${testName}"`);
      
      const query = `
        SELECT id, username, email, password_hash, role, first_name, last_name, phone, is_active
        FROM users 
        WHERE LOWER(first_name || ' ' || last_name) = LOWER($1)
           OR LOWER(first_name) = LOWER($1)
           OR LOWER(last_name) = LOWER($1)
        LIMIT 1
      `;
      
      try {
        const result = await db.query(query, [testName]);
        
        if (result.rows.length > 0) {
          const user = result.rows[0];
          console.log(`  ✅ Found: ${user.username} (${user.first_name} ${user.last_name})`);
          console.log(`  Role: ${user.role}, Active: ${user.is_active}`);
          
          // Test common PINs
          if (user.password_hash) {
            const bcrypt = require('bcryptjs');
            const testPins = ['1234', '0000', '1111', '2222'];
            
            for (const pin of testPins) {
              try {
                const isValid = await bcrypt.compare(pin, user.password_hash);
                if (isValid) {
                  console.log(`  🔐 PIN ${pin} is VALID!`);
                  break;
                }
              } catch (pinError) {
                console.log(`  ❌ PIN test error: ${pinError.message}`);
              }
            }
          }
        } else {
          console.log(`  ❌ No user found for "${testName}"`);
        }
      } catch (queryError) {
        console.error(`  ❌ Query error: ${queryError.message}`);
      }
    }

    // 5. Create Test User
    console.log('\n5️⃣ CREATING TEST USER:');
    try {
      const bcrypt = require('bcryptjs');
      const testPin = '1234';
      const hashedPin = await bcrypt.hash(testPin, 10);
      
      // Delete existing test user
      await db.query('DELETE FROM users WHERE username = $1', ['test_user']);
      
      // Create new test user
      const insertResult = await db.query(`
        INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone, is_active, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
        RETURNING id, username, first_name, last_name
      `, [
        'test_user',
        'test@example.com',
        hashedPin,
        'employee',
        'Test',
        'User',
        '1234567890',
        true
      ]);
      
      const newUser = insertResult.rows[0];
      console.log('✅ Test user created:');
      console.log(`  Username: ${newUser.username}`);
      console.log(`  Name: ${newUser.first_name} ${newUser.last_name}`);
      console.log(`  PIN: ${testPin}`);
      
      // Verify PIN works
      const verifyResult = await db.query('SELECT password_hash FROM users WHERE username = $1', ['test_user']);
      const storedHash = verifyResult.rows[0].password_hash;
      const isValid = await bcrypt.compare(testPin, storedHash);
      console.log(`  PIN Verification: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      
    } catch (createError) {
      console.error('❌ Error creating test user:', createError.message);
    }

    console.log('\n' + '=' .repeat(50));
    console.log('🎯 TEST CREDENTIALS:');
    console.log('Name: "Test User" or "Test"');
    console.log('PIN: 1234');
    console.log('=' .repeat(50));

  } catch (error) {
    console.error('❌ Debug script error:', error);
  }
  
  process.exit(0);
}

debugEverything();
