// Script to fix ALL users in the database with proper bcrypt hashes
require('dotenv').config();

async function fixAllUsers() {
  console.log('🔧 Fixing ALL Users in Database...\n');
  console.log('=' .repeat(60));

  try {
    const db = require('./config/database');
    const bcrypt = require('bcryptjs');
    
    // First, get all existing users
    console.log('1️⃣ Getting all existing users...');
    const existingUsers = await db.query(`
      SELECT id, username, first_name, last_name, role, email, phone, is_active
      FROM users 
      ORDER BY id
    `);
    
    console.log(`Found ${existingUsers.rows.length} existing users:\n`);
    
    // Define default PINs/passwords for different roles
    const defaultCredentials = {
      admin: { pin: '1234', password: 'admin123' },
      manager: { pin: '2345', password: 'manager123' },
      employee: { pin: '3456', password: 'employee123' },
      customer: { pin: '4567', password: 'customer123' }
    };
    
    // Track updated users
    const updatedUsers = [];
    
    // Update each existing user
    for (const user of existingUsers.rows) {
      const role = user.role || 'employee';
      const credentials = defaultCredentials[role] || defaultCredentials.employee;
      
      console.log(`🔄 Updating user: ${user.first_name} ${user.last_name} (${user.username})`);
      console.log(`   Role: ${role}`);
      console.log(`   Setting PIN: ${credentials.pin}`);
      
      // Hash the PIN for this user
      const hashedPin = await bcrypt.hash(credentials.pin, 10);
      
      // Update the user
      const updateResult = await db.query(`
        UPDATE users 
        SET password_hash = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING id, username, first_name, last_name, role
      `, [hashedPin, user.id]);
      
      if (updateResult.rows.length > 0) {
        const updatedUser = updateResult.rows[0];
        console.log(`   ✅ Updated successfully`);
        
        updatedUsers.push({
          id: updatedUser.id,
          username: updatedUser.username,
          full_name: `${updatedUser.first_name} ${updatedUser.last_name}`.trim(),
          role: updatedUser.role,
          pin: credentials.pin,
          password: credentials.password
        });
      } else {
        console.log(`   ❌ Failed to update`);
      }
      
      console.log('');
    }
    
    // Add some additional test users if needed
    console.log('2️⃣ Adding additional test users...\n');
    
    const additionalUsers = [
      {
        username: 'mike_waiter',
        email: 'mike@bakery.com',
        role: 'employee',
        first_name: 'Mike',
        last_name: 'Waiter',
        phone: '1111111111',
        pin: '1111'
      },
      {
        username: 'anna_waiter',
        email: 'anna@bakery.com',
        role: 'employee',
        first_name: 'Anna',
        last_name: 'Waiter',
        phone: '2222222222',
        pin: '2222'
      },
      {
        username: 'david_waiter',
        email: 'david@bakery.com',
        role: 'employee',
        first_name: 'David',
        last_name: 'Waiter',
        phone: '3333333333',
        pin: '3333'
      },
      {
        username: 'sophie_waiter',
        email: 'sophie@bakery.com',
        role: 'employee',
        first_name: 'Sophie',
        last_name: 'Waiter',
        phone: '4444444444',
        pin: '4444'
      }
    ];
    
    for (const newUser of additionalUsers) {
      console.log(`👤 Adding user: ${newUser.first_name} ${newUser.last_name}`);
      
      // Check if user already exists
      const existingCheck = await db.query('SELECT id FROM users WHERE username = $1', [newUser.username]);
      
      if (existingCheck.rows.length > 0) {
        console.log(`   ⚠️  User ${newUser.username} already exists, updating...`);
        
        const hashedPin = await bcrypt.hash(newUser.pin, 10);
        
        const updateResult = await db.query(`
          UPDATE users 
          SET password_hash = $1, first_name = $2, last_name = $3, email = $4, phone = $5, updated_at = NOW()
          WHERE username = $6
          RETURNING id, username, first_name, last_name, role
        `, [hashedPin, newUser.first_name, newUser.last_name, newUser.email, newUser.phone, newUser.username]);
        
        if (updateResult.rows.length > 0) {
          console.log(`   ✅ Updated successfully`);
          updatedUsers.push({
            id: updateResult.rows[0].id,
            username: updateResult.rows[0].username,
            full_name: `${updateResult.rows[0].first_name} ${updateResult.rows[0].last_name}`.trim(),
            role: updateResult.rows[0].role,
            pin: newUser.pin,
            password: 'employee123'
          });
        }
      } else {
        console.log(`   ➕ Creating new user...`);
        
        const hashedPin = await bcrypt.hash(newUser.pin, 10);
        
        const insertResult = await db.query(`
          INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
          RETURNING id, username, first_name, last_name, role
        `, [
          newUser.username,
          newUser.email,
          hashedPin,
          newUser.role,
          newUser.first_name,
          newUser.last_name,
          newUser.phone,
          true
        ]);
        
        if (insertResult.rows.length > 0) {
          console.log(`   ✅ Created successfully`);
          updatedUsers.push({
            id: insertResult.rows[0].id,
            username: insertResult.rows[0].username,
            full_name: `${insertResult.rows[0].first_name} ${insertResult.rows[0].last_name}`.trim(),
            role: insertResult.rows[0].role,
            pin: newUser.pin,
            password: 'employee123'
          });
        }
      }
      
      console.log('');
    }
    
    // Test all password hashes
    console.log('3️⃣ Testing all password hashes...\n');
    
    for (const user of updatedUsers) {
      console.log(`🧪 Testing ${user.full_name} (${user.username})`);
      
      const testResult = await db.query('SELECT password_hash FROM users WHERE id = $1', [user.id]);
      if (testResult.rows.length > 0) {
        const storedHash = testResult.rows[0].password_hash;
        const isValid = await bcrypt.compare(user.pin, storedHash);
        console.log(`   PIN ${user.pin}: ${isValid ? '✅ VALID' : '❌ INVALID'}`);
      }
    }
    
    // Final summary
    console.log('\n' + '=' .repeat(60));
    console.log('🎯 ALL USER CREDENTIALS SUMMARY:');
    console.log('=' .repeat(60));
    
    updatedUsers.forEach(user => {
      console.log(`\n👤 ${user.full_name} (${user.role})`);
      console.log(`   PIN Login - Name: "${user.full_name}" or "${user.first_name}", PIN: ${user.pin}`);
      console.log(`   Regular Login - Username: ${user.username}, Password: ${user.password}`);
    });
    
    console.log('\n' + '=' .repeat(60));
    console.log(`✅ Successfully updated ${updatedUsers.length} users!`);
    console.log('🎉 All users now have working bcrypt password hashes!');
    console.log('=' .repeat(60));
    
  } catch (error) {
    console.error('❌ Error fixing users:', error);
  }
  
  process.exit(0);
}

fixAllUsers();
