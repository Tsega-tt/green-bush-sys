const fs = require('fs');
const path = require('path');

console.log('🚀 BULLETPROOF STARTUP SCRIPT');
console.log('📍 Current directory:', __dirname);

// Check if bulletproof server exists
const bulletproofServer = path.join(__dirname, 'bulletproof-server.js');

if (fs.existsSync(bulletproofServer)) {
  console.log('✅ Found bulletproof-server.js - Starting...');
  require('./bulletproof-server.js');
} else {
  console.log('❌ bulletproof-server.js not found!');
  console.log('📁 Available files:', fs.readdirSync(__dirname).filter(f => f.endsWith('.js')));
  
  // Try app.js as fallback
  const appServer = path.join(__dirname, 'app.js');
  if (fs.existsSync(appServer)) {
    console.log('📁 Using app.js as fallback...');
    require('./app.js');
  } else {
    console.error('💥 No server files found!');
    process.exit(1);
  }
}
