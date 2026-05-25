const fs = require('fs');
const path = require('path');

console.log('🚀 COMPLETE BULLETPROOF STARTUP');
console.log('📍 Current directory:', __dirname);

// Load the main server.js file
const mainServer = path.join(__dirname, 'server.js');

if (fs.existsSync(mainServer)) {
  console.log('✅ Found server.js - Starting main application...');
  require('./server.js');
} else {
  console.error('💥 server.js not found!');
  console.error('📍 Looking in:', __dirname);
  process.exit(1);
}
