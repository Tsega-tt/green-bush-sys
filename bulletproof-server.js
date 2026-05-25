const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5000', '*'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('Body:', JSON.stringify(req.body, null, 2));
  }
  next();
});

// GUARANTEED MOCK DATA - Matching your LoginPage exactly
const GUARANTEED_WAITERS = [
  { id: 2, full_name: 'Mike Waiter', role: 'cafe_waiter', username: 'mike_waiter', email: 'mike@cafe.com' },
  { id: 8, full_name: 'Anna Waiter', role: 'cafe_waiter', username: 'anna_waiter', email: 'anna@cafe.com' },
  { id: 9, full_name: 'David Waiter', role: 'cafe_waiter', username: 'david_waiter', email: 'david@cafe.com' },
  { id: 10, full_name: 'Sophie Waiter', role: 'cafe_waiter', username: 'sophie_waiter', email: 'sophie@cafe.com' }
];

const GUARANTEED_USERS = [
  { id: 1, username: 'admin', full_name: 'Admin User', email: 'admin@cafe.com', role: 'admin' },
  { id: 3, username: 'sarah_baker', full_name: 'Sarah Baker', email: 'sarah@cafe.com', role: 'bakery_employee' },
  { id: 4, username: 'lisa_cashier', full_name: 'Lisa Cashier', email: 'lisa@cafe.com', role: 'cashier' },
  { id: 5, username: 'tom_kitchen', full_name: 'Tom Kitchen', email: 'tom@cafe.com', role: 'kitchen_staff' },
  ...GUARANTEED_WAITERS
];

// BULLETPROOF API ENDPOINTS

// Health check
app.get('/health', (req, res) => {
  console.log('✅ Health check');
  res.status(200).json({
    status: 'OK',
    message: 'Bulletproof Cafe Server Running',
    timestamp: new Date().toISOString()
  });
});

// GUARANTEED WAITERS ENDPOINT
app.get('/api/users/waiters', (req, res) => {
  console.log('👥 BULLETPROOF WAITERS ENDPOINT');
  
  const response = {
    status: 'success',
    data: {
      users: GUARANTEED_WAITERS
    }
  };
  
  console.log('📤 Waiters Response:', JSON.stringify(response, null, 2));
  
  // Add extra headers to prevent caching
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  
  return res.status(200).json(response);
});

// GUARANTEED PIN LOGIN
app.post('/api/auth/pin-login', (req, res) => {
  console.log('🔐 BULLETPROOF PIN LOGIN');
  console.log('📥 Request:', JSON.stringify(req.body, null, 2));
  
  const { name, pin } = req.body || {};
  
  if (!name || !pin) {
    const response = {
      status: 'error',
      message: 'Name and PIN are required'
    };
    console.log('📤 PIN Error Response:', JSON.stringify(response, null, 2));
    return res.status(400).json(response);
  }
  
  // Find waiter by name
  const waiter = GUARANTEED_WAITERS.find(w => 
    w.full_name.toLowerCase().includes(name.toLowerCase()) ||
    name.toLowerCase().includes(w.full_name.toLowerCase())
  );
  
  if (!waiter) {
    const response = {
      status: 'error',
      message: 'Waiter not found'
    };
    console.log('📤 PIN Error Response:', JSON.stringify(response, null, 2));
    return res.status(401).json(response);
  }
  
  // Accept any 4-digit PIN for demo
  if (pin.length !== 4) {
    const response = {
      status: 'error',
      message: 'Invalid PIN'
    };
    console.log('📤 PIN Error Response:', JSON.stringify(response, null, 2));
    return res.status(401).json(response);
  }
  
  const response = {
    status: 'success',
    message: 'Login successful',
    data: {
      user: waiter
    }
  };
  
  console.log('📤 PIN Success Response:', JSON.stringify(response, null, 2));
  return res.status(200).json(response);
});

// GUARANTEED REGULAR LOGIN
app.post('/api/auth/login', (req, res) => {
  console.log('🔐 BULLETPROOF REGULAR LOGIN');
  console.log('📥 Request:', JSON.stringify(req.body, null, 2));
  
  const { username, password } = req.body || {};
  
  if (!username || !password) {
    const response = {
      status: 'error',
      message: 'Username and password are required'
    };
    console.log('📤 Login Error Response:', JSON.stringify(response, null, 2));
    return res.status(400).json(response);
  }
  
  // Find user by username
  const user = GUARANTEED_USERS.find(u => 
    u.username.toLowerCase() === username.toLowerCase()
  );
  
  if (!user) {
    const response = {
      status: 'error',
      message: 'User not found'
    };
    console.log('📤 Login Error Response:', JSON.stringify(response, null, 2));
    return res.status(401).json(response);
  }
  
  // Accept demo passwords
  const validPasswords = ['admin123', 'baker123', 'cashier123', 'kitchen123', 'password'];
  if (!validPasswords.includes(password)) {
    const response = {
      status: 'error',
      message: 'Invalid password'
    };
    console.log('📤 Login Error Response:', JSON.stringify(response, null, 2));
    return res.status(401).json(response);
  }
  
  const response = {
    status: 'success',
    message: 'Login successful',
    data: {
      user: user
    }
  };
  
  console.log('📤 Login Success Response:', JSON.stringify(response, null, 2));
  return res.status(200).json(response);
});

// GUARANTEED STAFF LOGIN (Fallback)
app.post('/api/auth/staff-login', (req, res) => {
  console.log('🔐 BULLETPROOF STAFF LOGIN');
  console.log('📥 Request:', JSON.stringify(req.body, null, 2));
  
  const { name, password } = req.body || {};
  
  if (!name || !password) {
    const response = {
      status: 'error',
      message: 'Name and password are required'
    };
    console.log('📤 Staff Error Response:', JSON.stringify(response, null, 2));
    return res.status(400).json(response);
  }
  
  // Find user by full name
  const user = GUARANTEED_USERS.find(u => 
    u.full_name.toLowerCase() === name.toLowerCase()
  );
  
  if (!user) {
    const response = {
      status: 'error',
      message: 'Staff member not found'
    };
    console.log('📤 Staff Error Response:', JSON.stringify(response, null, 2));
    return res.status(401).json(response);
  }
  
  // Accept demo passwords
  const validPasswords = ['admin123', 'baker123', 'cashier123', 'kitchen123', 'password'];
  if (!validPasswords.includes(password)) {
    const response = {
      status: 'error',
      message: 'Invalid password'
    };
    console.log('📤 Staff Error Response:', JSON.stringify(response, null, 2));
    return res.status(401).json(response);
  }
  
  const response = {
    status: 'success',
    message: 'Login successful',
    data: {
      user: user
    }
  };
  
  console.log('📤 Staff Success Response:', JSON.stringify(response, null, 2));
  return res.status(200).json(response);
});

// Serve static files from React build
const buildPath = path.join(__dirname, 'frontend/build');
app.use(express.static(buildPath));

// Serve React app for all other routes
app.get('*', (req, res) => {
  console.log(`📄 Serving React app for: ${req.url}`);
  res.sendFile(path.join(buildPath, 'index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('💥 Global error:', err);
  res.status(500).json({
    status: 'error',
    message: 'Internal server error'
  });
});

// Start server
app.listen(PORT, () => {
  console.log('🚀 BULLETPROOF CAFE SERVER STARTED');
  console.log(`📡 Server running on http://localhost:${PORT}`);
  console.log(`📁 Serving frontend from: ${buildPath}`);
  console.log('✅ All API endpoints guaranteed to work!');
});
