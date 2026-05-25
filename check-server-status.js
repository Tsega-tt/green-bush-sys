#!/usr/bin/env node

// Check Server Status - Diagnose why server isn't responding properly

console.log('🔍 CHECKING SERVER STATUS...');
console.log('=' .repeat(50));

const fs = require('fs');
const path = require('path');

// Check which server files exist
console.log('📁 Checking server files:');
const serverFiles = [
  'server-bulletproof.js',
  'server-frontend-compatible.js', 
  'server-simple.js',
  'startup.fixed.js',
  'app.js'
];

serverFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const stats = fs.statSync(file);
    console.log(`✅ ${file} - ${Math.round(stats.size/1024)}KB - Modified: ${stats.mtime.toISOString()}`);
  } else {
    console.log(`❌ ${file} - Not found`);
  }
});

// Check environment
console.log('\n🔧 Environment check:');
require('dotenv').config();
console.log('NODE_ENV:', process.env.NODE_ENV || 'not set');
console.log('PORT:', process.env.PORT || 'not set');

// Test if we can make HTTP requests
console.log('\n🌐 Testing HTTP connectivity...');

async function testEndpoints() {
  const endpoints = [
    'http://localhost:5000/health',
    'http://localhost:3000/health',
    'https://cafe.powergamings.com/health',
    'https://cafe.powergamings.com/api/users/waiters'
  ];
  
  for (const url of endpoints) {
    try {
      console.log(`Testing: ${url}`);
      
      // Use fetch if available, otherwise skip
      if (typeof fetch !== 'undefined') {
        const response = await fetch(url, { 
          method: 'GET',
          timeout: 5000 
        });
        console.log(`✅ ${url} - Status: ${response.status}`);
        
        if (url.includes('/waiters')) {
          const data = await response.json();
          console.log(`📦 Response:`, JSON.stringify(data, null, 2));
        }
      } else {
        console.log(`⚠️  Fetch not available, skipping ${url}`);
      }
    } catch (error) {
      console.log(`❌ ${url} - Error: ${error.message}`);
    }
  }
}

// Create a minimal test server to verify it works
console.log('\n🚀 Creating minimal test server...');

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5001; // Use different port to avoid conflicts

app.use(cors({ origin: '*' }));
app.use(express.json());

// Test endpoints that return exactly what frontend expects
app.get('/api/users/waiters', (req, res) => {
  console.log('📥 Waiters request received');
  const response = {
    users: [
      {
        id: 1,
        username: 'test_waiter',
        name: 'Test Waiter',
        role: 'cafe_waiter'
      }
    ]
  };
  console.log('📤 Sending response:', JSON.stringify(response));
  res.status(200).json(response);
});

app.post('/api/auth/pin-login', (req, res) => {
  console.log('📥 PIN login request received:', req.body);
  const response = {
    success: true,
    user: {
      id: 1,
      username: 'test_user',
      role: 'admin',
      name: 'Test User'
    }
  };
  console.log('📤 Sending response:', JSON.stringify(response));
  res.status(200).json(response);
});

app.get('/test-status', (req, res) => {
  res.json({
    status: 'Test server is working',
    timestamp: new Date().toISOString(),
    port: PORT
  });
});

// Start test server
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Test server started on port ${PORT}`);
  console.log(`🔗 Test at: http://localhost:${PORT}/test-status`);
  console.log(`🔗 Test waiters: http://localhost:${PORT}/api/users/waiters`);
  console.log(`🔗 Test login: POST http://localhost:${PORT}/api/auth/pin-login`);
  
  // Auto-test after 2 seconds
  setTimeout(async () => {
    console.log('\n🧪 Auto-testing endpoints...');
    await testEndpoints();
    
    console.log('\n📋 DIAGNOSIS COMPLETE');
    console.log('=' .repeat(50));
    console.log('If test server works but main server doesn\'t:');
    console.log('1. Check cPanel Node.js app is running');
    console.log('2. Check correct startup file is set');
    console.log('3. Check port configuration');
    console.log('4. Check error logs in cPanel');
    
    // Keep server running for manual testing
    console.log('\n⏰ Test server will keep running for manual testing...');
    console.log('Press Ctrl+C to stop');
  }, 2000);
});

server.on('error', (error) => {
  console.error('❌ Test server failed:', error.message);
  if (error.code === 'EADDRINUSE') {
    console.log(`Port ${PORT} is in use, trying ${PORT + 1}...`);
    // Could retry with different port here
  }
});

process.on('SIGINT', () => {
  console.log('\n🛑 Stopping test server...');
  server.close(() => {
    console.log('✅ Test server stopped');
    process.exit(0);
  });
});
