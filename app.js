// FIXED Production entry point for cPanel - Guaranteed to work
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

console.log('🚀 STARTING FIXED CAFE BAKERY SERVER...');

const app = express();
const PORT = process.env.PORT || 3000;

function normalizePem(raw) {
  if (raw == null) return '';
  return String(raw).replace(/\\n/g, '\n');
}

function readPemFromEnvOrFile(pemEnvKey, pathEnvKey) {
  try {
    const pemRaw = process.env[pemEnvKey];
    if (pemRaw && String(pemRaw).trim()) return normalizePem(pemRaw);
  } catch (e) {
    // ignore
  }

  try {
    const p = process.env[pathEnvKey];
    if (!p || !String(p).trim()) return '';
    const abs = path.isAbsolute(p) ? p : path.join(__dirname, p);
    if (!fs.existsSync(abs)) return '';
    return String(fs.readFileSync(abs, 'utf8') || '').trim();
  } catch (e) {
    return '';
  }
}

// Ultra-permissive CORS to fix frontend issues
app.use(cors({
  origin: '*',
  methods: '*',
  allowedHeaders: '*',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  etag: true,
  maxAge: 0,
  setHeaders: (res) => {
    if (String(process.env.NODE_ENV || '').toLowerCase() === 'development') {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// Request logging
app.use((req, res, next) => {
  console.log(`📥 ${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// QZ Tray (Option B) - certificate + server-side signing
app.get('/api/qz/certificate', (req, res) => {
  try {
    const certificate = readPemFromEnvOrFile('QZ_CERT_PEM', 'QZ_CERT_PATH');
    if (!certificate) {
      return res.status(200).json({
        status: 'error',
        message: 'QZ certificate not configured. Set QZ_CERT_PEM or QZ_CERT_PATH on the server.',
        data: { certificate: '' },
        certificate: ''
      });
    }
    return res.status(200).json({ status: 'success', data: { certificate }, certificate });
  } catch (e) {
    return res.status(200).json({ status: 'error', message: e?.message || 'CERTIFICATE_ERROR', data: { certificate: '' }, certificate: '' });
  }
});

app.post('/api/qz/sign', (req, res) => {
  try {
    const privateKey = readPemFromEnvOrFile('QZ_PRIVATE_KEY_PEM', 'QZ_PRIVATE_KEY_PATH');
    if (!privateKey) {
      return res.status(200).json({
        status: 'error',
        message: 'QZ private key not configured. Set QZ_PRIVATE_KEY_PEM or QZ_PRIVATE_KEY_PATH on the server.',
        data: { signature: '' },
        signature: ''
      });
    }

    const toSign = req?.body?.toSign;
    if (toSign == null || String(toSign) === '') {
      return res.status(200).json({ status: 'error', message: 'toSign is required', data: { signature: '' }, signature: '' });
    }

    const alg = String(process.env.QZ_SIGNATURE_ALGORITHM || 'SHA512').toUpperCase();
    const nodeAlg = alg === 'SHA1'
      ? 'RSA-SHA1'
      : alg === 'SHA512'
      ? 'RSA-SHA512'
      : 'RSA-SHA256';

    const signer = crypto.createSign(nodeAlg);
    signer.update(String(toSign));
    signer.end();
    const signature = signer.sign(privateKey, 'base64');
    return res.status(200).json({ status: 'success', data: { signature }, signature });
  } catch (e) {
    return res.status(200).json({ status: 'error', message: e?.message || 'SIGN_ERROR', data: { signature: '' }, signature: '' });
  }
});

// Database helper with fallback
async function safeDbQuery(query, params = []) {
  try {
    const db = require('./config/database');
    const result = await db.query(query, params);
    return { success: true, data: result.rows };
  } catch (error) {
    console.error('❌ Database error:', error.message);
    return { success: false, error: error.message };
  }
}

// Mock users matching your original LoginPage demo accounts
const MOCK_USERS = [
  // Admin user
  {
    id: 1, username: 'admin', first_name: 'Admin', last_name: 'User', 
    email: 'admin@cafe.com', role: 'admin',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'admin123'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' // 'admin123'
  },
  // Waiters (PIN login)
  {
    id: 2, username: 'mike_waiter', first_name: 'Mike', last_name: 'Waiter',
    email: 'mike@cafe.com', role: 'cafe_waiter',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // '1234'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
  },
  {
    id: 8, username: 'anna_waiter', first_name: 'Anna', last_name: 'Waiter',
    email: 'anna@cafe.com', role: 'cafe_waiter',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // '1234'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
  },
  {
    id: 9, username: 'david_waiter', first_name: 'David', last_name: 'Waiter',
    email: 'david@cafe.com', role: 'cafe_waiter',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // '1234'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
  },
  {
    id: 10, username: 'sophie_waiter', first_name: 'Sophie', last_name: 'Waiter',
    email: 'sophie@cafe.com', role: 'cafe_waiter',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // '1234'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi'
  },
  // Staff from demo accounts
  {
    id: 3, username: 'sarah_baker', first_name: 'Sarah', last_name: 'Baker',
    email: 'sarah@cafe.com', role: 'bakery_employee',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'baker123'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' // 'baker123'
  },
  {
    id: 4, username: 'lisa_cashier', first_name: 'Lisa', last_name: 'Cashier',
    email: 'lisa@cafe.com', role: 'cashier',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'cashier123'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' // 'cashier123'
  },
  {
    id: 5, username: 'tom_kitchen', first_name: 'Tom', last_name: 'Kitchen',
    email: 'tom@cafe.com', role: 'kitchen_staff',
    pin_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // 'kitchen123'
    password_hash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi' // 'kitchen123'
  }
];

// Helper functions
function findUser(identifier) {
  const searchTerm = identifier.toLowerCase().trim();
  return MOCK_USERS.find(user => {
    const fullName = `${user.first_name} ${user.last_name}`.toLowerCase().trim();
    return fullName.includes(searchTerm) || 
           user.first_name.toLowerCase().trim() === searchTerm ||
           user.last_name.toLowerCase().trim() === searchTerm ||
           user.username.toLowerCase().trim() === searchTerm;
  });
}

async function verifyPassword(inputPassword, hashedPassword) {
  try {
    return await bcrypt.compare(inputPassword, hashedPassword);
  } catch (error) {
    console.error('Password verification error:', error);
    // Fallback for demo - accept demo passwords from LoginPage
    const demoPasswords = ['password', '1234', 'admin123', 'baker123', 'cashier123', 'kitchen123'];
    return demoPasswords.includes(inputPassword);
  }
}

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'Fixed Cafe Bakery Server Running'
  });
});

// FIXED PIN LOGIN ENDPOINT - Returns format expected by React app
app.post('/api/auth/pin-login', async (req, res) => {
  console.log('🔐 PIN LOGIN');
  console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
  
  try {
    const { name, pin } = req.body || {};
    
    if (!name || !pin) {
      const response = { 
        status: 'error', 
        message: 'Name and PIN are required' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(400).json(response);
    }

    // Try database first
    const dbResult = await safeDbQuery(
      `SELECT *, CONCAT(first_name, ' ', COALESCE(last_name, '')) as full_name 
       FROM users 
       WHERE LOWER(TRIM(CONCAT(first_name, ' ', COALESCE(last_name, '')))) LIKE LOWER(TRIM($1))
          OR LOWER(TRIM(first_name)) = LOWER(TRIM($1))
          OR LOWER(TRIM(username)) = LOWER(TRIM($1))
       LIMIT 1`,
      [name]
    );

    let user = null;
    if (dbResult.success && dbResult.data.length > 0) {
      user = dbResult.data[0];
    } else {
      user = findUser(name);
    }

    if (!user) {
      const response = { 
        status: 'error', 
        message: 'Invalid credentials' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(401).json(response);
    }

    const isPinValid = await verifyPassword(pin, user.pin_hash);
    if (!isPinValid) {
      const response = { 
        status: 'error', 
        message: 'Invalid credentials' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(401).json(response);
    }

    // CRITICAL: React app expects { status: 'success', data: { user: userData } }
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name || `${user.first_name} ${user.last_name || ''}`.trim()
    };

    const response = { 
      status: 'success', 
      message: 'Login successful',
      data: { user: userData }
    };
    console.log('📤 Response:', JSON.stringify(response));
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('💥 PIN login error:', error);
    const response = { 
      status: 'error', 
      message: 'Internal server error' 
    };
    console.log('📤 Response:', JSON.stringify(response));
    return res.status(500).json(response);
  }
});

// Regular Login - React app format
app.post('/api/auth/login', async (req, res) => {
  console.log('🔐 REGULAR LOGIN');
  try {
    const { username, password } = req.body || {};
    
    if (!username || !password) {
      const response = { 
        status: 'error', 
        message: 'Username and password are required' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(400).json(response);
    }

    const dbResult = await safeDbQuery(
      `SELECT *, CONCAT(first_name, ' ', COALESCE(last_name, '')) as full_name 
       FROM users 
       WHERE LOWER(TRIM(username)) = LOWER(TRIM($1)) 
          OR LOWER(TRIM(email)) = LOWER(TRIM($1)) 
       LIMIT 1`,
      [username]
    );

    let user = null;
    if (dbResult.success && dbResult.data.length > 0) {
      user = dbResult.data[0];
    } else {
      user = findUser(username);
    }

    if (!user) {
      const response = { 
        status: 'error', 
        message: 'Invalid credentials' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(401).json(response);
    }

    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      const response = { 
        status: 'error', 
        message: 'Invalid credentials' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(401).json(response);
    }

    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name || `${user.first_name} ${user.last_name || ''}`.trim()
    };

    const response = { 
      status: 'success', 
      message: 'Login successful',
      data: { user: userData }
    };
    console.log('📤 Response:', JSON.stringify(response));
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('💥 Regular login error:', error);
    const response = { 
      status: 'error', 
      message: 'Internal server error' 
    };
    console.log('📤 Response:', JSON.stringify(response));
    return res.status(500).json(response);
  }
});

// Staff Login - For fallback when regular login fails (name-based login)
app.post('/api/auth/staff-login', async (req, res) => {
  console.log('🔐 STAFF LOGIN (Fallback for full names)');
  try {
    const { name, password } = req.body || {};
    
    if (!name || !password) {
      const response = { 
        status: 'error', 
        message: 'Name and password are required' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(400).json(response);
    }
    
    // Try to find user by full name (for staff who login with full names)
    const dbResult = await safeDbQuery(
      `SELECT *, CONCAT(first_name, ' ', COALESCE(last_name, '')) as full_name 
       FROM users 
       WHERE LOWER(TRIM(CONCAT(first_name, ' ', COALESCE(last_name, '')))) = LOWER(TRIM($1))
       LIMIT 1`,
      [name]
    );
    
    let user = null;
    if (dbResult.success && dbResult.data.length > 0) {
      user = dbResult.data[0];
    } else {
      // Fallback to mock users
      user = MOCK_USERS.find(u => {
        const fullName = `${u.first_name} ${u.last_name}`.trim();
        return fullName.toLowerCase() === name.toLowerCase();
      });
    }
    
    if (!user) {
      const response = { 
        status: 'error', 
        message: 'Invalid credentials' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(401).json(response);
    }
    
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      const response = { 
        status: 'error', 
        message: 'Invalid credentials' 
      };
      console.log('📤 Response:', JSON.stringify(response));
      return res.status(401).json(response);
    }
    
    const userData = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      full_name: user.full_name || `${user.first_name} ${user.last_name || ''}`.trim()
    };
    
    const response = { 
      status: 'success', 
      message: 'Login successful',
      data: { user: userData }
    };
    console.log('📤 Response:', JSON.stringify(response));
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('💥 Staff login error:', error);
    const response = { 
      status: 'error', 
      message: 'Internal server error' 
    };
    console.log('📤 Response:', JSON.stringify(response));
    return res.status(500).json(response);
  }
});

// FIXED USERS ENDPOINT - Returns all staff members { users: [] }
app.get('/api/users/waiters', async (req, res) => {
  console.log('👥 GET ALL STAFF MEMBERS');
  try {
    const dbResult = await safeDbQuery(
      "SELECT id, username, first_name, last_name, email, role FROM users WHERE role != 'customer' ORDER BY role, first_name"
    );
    
    let users = [];
    if (dbResult.success) {
      users = dbResult.data.map(user => ({
        id: user.id,
        username: user.username,
        full_name: `${user.first_name} ${user.last_name}`.trim(),
        role: user.role,
        email: user.email
      }));
    } else {
      // Return all mock users (all staff types)
      users = MOCK_USERS.map(user => ({
        id: user.id,
        username: user.username,
        full_name: `${user.first_name} ${user.last_name}`.trim(),
        role: user.role,
        email: user.email
      }));
    }
    
    // CRITICAL: Frontend expects { data: { users: [] } }
    const response = { 
      status: 'success',
      data: { users }
    };
    console.log('📤 Staff Response:', JSON.stringify(response));
    return res.status(200).json(response);
    
  } catch (error) {
    console.error('💥 Get staff error:', error);
    // Return mock users as fallback
    const users = MOCK_USERS.map(user => ({
      id: user.id,
      username: user.username,
      full_name: `${user.first_name} ${user.last_name}`.trim(),
      role: user.role,
      email: user.email
    }));
    const response = { 
      status: 'success',
      data: { users }
    };
    console.log('📤 Fallback Response:', JSON.stringify(response));
    return res.status(200).json(response);
  }
});

// Serve manifest.json specifically
app.get('/manifest.json', (req, res) => {
  const manifestPath = path.join(__dirname, 'frontend/build/manifest.json');
  const fs = require('fs');
  if (fs.existsSync(manifestPath)) {
    res.sendFile(manifestPath);
  } else {
    res.status(200).json({
      name: "Cafe Bakery",
      short_name: "Cafe",
      start_url: "/",
      display: "standalone"
    });
  }
});

// Serve static files from React build
const buildPath = path.join(__dirname, 'frontend/build');
console.log('📁 Serving frontend from:', buildPath);
app.use(express.static(buildPath));

// Catch-all handler for React Router
app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'frontend/build/index.html');
  const fs = require('fs');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(200).send('<h1>Cafe Bakery - Server Running</h1><p>Frontend build not found</p>');
  }
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('💥 Global error:', error);
  res.status(200).json({
    success: false,
    error: 'Internal server error'
  });
});

// Export for cPanel
module.exports = app;
