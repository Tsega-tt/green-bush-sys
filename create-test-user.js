// Script to create a test user with PIN 1234
require('dotenv').config();

async function createTestUser() {
  console.log('👤 Creating test user...\n');

  try {
    const db = require('./config/database');
    const bcrypt = require('bcryptjs');
    
    // Hash PIN 1234
    const testPin = '1234';
    const hashedPin = await bcrypt.hash(testPin, 10);
    
    console.log(`🔐 Test PIN: ${testPin}`);
    console.log(`🔒 Hashed PIN: ${hashedPin}`);
    
    // Create test user
    const insertQuery = `
      INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
      ON CONFLICT (username) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        updated_at = NOW()
      RETURNING id, username, first_name, last_name, role
    `;
    
    const result = await db.query(insertQuery, [
      'test_waiter',
      'test@bakery.com',
      hashedPin,
      'employee',
      'Test',
      'Waiter',
      '1234567890',
      true
    ]);
    
    const user = result.rows[0];
    console.log('✅ Test user created/updated:');
    console.log(`   ID: ${user.id}`);
    console.log(`   Username: ${user.username}`);
    console.log(`   Name: ${user.first_name} ${user.last_name}`);
    console.log(`   Role: ${user.role}`);
    console.log(`   PIN: ${testPin} (for testing)`);
    
    // Test the PIN immediately
    console.log('\n🔍 Testing PIN validation...');
    const isValid = await bcrypt.compare(testPin, hashedPin);
    console.log(`PIN validation test: ${isValid ? '✅ PASS' : '❌ FAIL'}`);
    
    console.log('\n🎯 You can now test PIN login with:');
    console.log(`   Name: "Test Waiter" or "Test"`);
    console.log(`   PIN: ${testPin}`);
    
  } catch (error) {
    console.error('❌ Error creating test user:', error);
  }
  
  process.exit(0);
}

createTestUser();
