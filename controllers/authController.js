const { validationResult } = require('express-validator');

class AuthController {
  static async pinLogin(req, res) {
    try {
      console.log('🔍 PIN Login attempt:', req.body);
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { name, pin } = req.body;

      // Find user by name - using direct database query
      const db = require('../config/database');
      const query = `
        SELECT id, username, email, password_hash, pin_hash, role, first_name, last_name, phone, is_active
        FROM users 
        WHERE LOWER(TRIM(COALESCE(first_name, '') || ' ' || COALESCE(last_name, ''))) = LOWER(TRIM($1))
           OR LOWER(TRIM(COALESCE(first_name, ''))) = LOWER(TRIM($1))
           OR LOWER(TRIM(COALESCE(last_name, ''))) = LOWER(TRIM($1))
           OR LOWER(TRIM(username)) = LOWER(TRIM($1))
        LIMIT 1
      `;
      
      const result = await db.query(query, [name]);
      const user = result.rows[0];

      if (!user) {
        console.log('❌ User not found:', name);
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      console.log('✅ User found:', user.username);

      // Check if user is active
      if (!user.is_active) {
        return res.status(401).json({
          status: 'error',
          message: 'Account is deactivated'
        });
      }

      const pinHash = user.pin_hash || user.password_hash;
      if (!pinHash) {
        return res.status(401).json({
          status: 'error',
          message: 'PIN not set up for this user'
        });
      }

      // Verify PIN
      const bcrypt = require('bcryptjs');
      const isValidPin = await bcrypt.compare(pin, pinHash);
      
      if (!isValidPin) {
        console.log('❌ Invalid PIN for user:', user.username);
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      console.log('✅ PIN login successful for:', user.username);

      // Return user data
      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        first_name: user.first_name,
        last_name: user.last_name
      };

      res.json({
        status: 'success',
        message: 'Login successful',
        user: userData
      });

    } catch (error) {
      console.error('❌ PIN Login error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, password } = req.body;

      // Direct database query
      const db = require('../config/database');
      const query = `
        SELECT id, username, email, password_hash, role, first_name, last_name, phone, is_active
        FROM users WHERE username = $1
      `;
      
      const result = await db.query(query, [username]);
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      if (!user.is_active) {
        return res.status(401).json({
          status: 'error',
          message: 'Account is deactivated'
        });
      }

      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        first_name: user.first_name,
        last_name: user.last_name
      };

      res.json({
        status: 'success',
        message: 'Login successful',
        user: userData
      });

    } catch (error) {
      console.error('❌ Login error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // Staff login (same as regular login but with name instead of username)
  static async staffLogin(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { name, password } = req.body;

      // Find user by name
      const db = require('../config/database');
      const query = `
        SELECT id, username, email, password_hash, role, first_name, last_name, phone, is_active
        FROM users 
        WHERE LOWER(first_name || ' ' || last_name) = LOWER($1)
           OR LOWER(first_name) = LOWER($1)
           OR LOWER(last_name) = LOWER($1)
        LIMIT 1
      `;
      
      const result = await db.query(query, [name]);
      const user = result.rows[0];

      if (!user) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      if (!user.is_active) {
        return res.status(401).json({
          status: 'error',
          message: 'Account is deactivated'
        });
      }

      const bcrypt = require('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, user.password_hash);
      
      if (!isValidPassword) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid credentials'
        });
      }

      const userData = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
        first_name: user.first_name,
        last_name: user.last_name
      };

      res.json({
        status: 'success',
        message: 'Staff login successful',
        user: userData
      });

    } catch (error) {
      console.error('❌ Staff Login error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, email, password, role, full_name, first_name, last_name, phone } = req.body;

      // Handle full_name if provided instead of first_name/last_name
      let fname = first_name;
      let lname = last_name;
      
      if (full_name && !first_name && !last_name) {
        const nameParts = full_name.split(' ');
        fname = nameParts[0] || '';
        lname = nameParts.slice(1).join(' ') || '';
      }

      // Check if username exists
      const db = require('../config/database');
      const existingUser = await db.query('SELECT id FROM users WHERE username = $1', [username]);
      
      if (existingUser.rows.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Username already exists'
        });
      }

      // Check if email exists
      const existingEmail = await db.query('SELECT id FROM users WHERE email = $1', [email]);
      
      if (existingEmail.rows.length > 0) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already exists'
        });
      }

      // Hash password
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, parseInt(process.env.BCRYPT_SALT_ROUNDS || 10));

      // Create user
      const insertQuery = `
        INSERT INTO users (username, email, password_hash, role, first_name, last_name, phone, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, username, email, role, first_name, last_name, phone, created_at, is_active
      `;
      
      const result = await db.query(insertQuery, [
        username, 
        email, 
        hashedPassword, 
        role || 'employee', 
        fname, 
        lname, 
        phone
      ]);

      const newUser = result.rows[0];

      res.status(201).json({
        status: 'success',
        message: 'User created successfully',
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role,
          full_name: `${newUser.first_name || ''} ${newUser.last_name || ''}`.trim(),
          first_name: newUser.first_name,
          last_name: newUser.last_name
        }
      });

    } catch (error) {
      console.error('❌ Registration error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  static async logout(req, res) {
    try {
      res.json({
        status: 'success',
        message: 'Logout successful'
      });
    } catch (error) {
      console.error('❌ Logout error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getProfile(req, res) {
    try {
      const userId = req.params.userId || req.user?.id || req.body.user_id || req.query.user_id;
      
      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID is required'
        });
      }

      const db = require('../config/database');
      const query = `
        SELECT id, username, email, role, first_name, last_name, phone, created_at, is_active
        FROM users WHERE id = $1
      `;
      
      const result = await db.query(query, [userId]);
      const user = result.rows[0];

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.json({
        status: 'success',
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
          first_name: user.first_name,
          last_name: user.last_name,
          phone: user.phone,
          created_at: user.created_at,
          is_active: user.is_active
        }
      });

    } catch (error) {
      console.error('❌ Get profile error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async updateProfile(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const userId = req.params.userId;
      const { email, full_name, username, first_name, last_name, phone } = req.body;

      if (!userId) {
        return res.status(400).json({
          status: 'error',
          message: 'User ID is required'
        });
      }

      const db = require('../config/database');

      // Check if user exists
      const userCheck = await db.query('SELECT id FROM users WHERE id = $1', [userId]);
      if (userCheck.rows.length === 0) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      // Prepare update fields
      const fields = [];
      const params = [];
      let paramCount = 0;

      // Handle full_name by splitting it
      let fname = first_name;
      let lname = last_name;
      
      if (full_name && !first_name && !last_name) {
        const nameParts = full_name.split(' ');
        fname = nameParts[0] || '';
        lname = nameParts.slice(1).join(' ') || '';
      }

      if (email !== undefined) {
        paramCount++;
        fields.push(`email = $${paramCount}`);
        params.push(email);
      }

      if (username !== undefined) {
        paramCount++;
        fields.push(`username = $${paramCount}`);
        params.push(username);
      }

      if (fname !== undefined) {
        paramCount++;
        fields.push(`first_name = $${paramCount}`);
        params.push(fname);
      }

      if (lname !== undefined) {
        paramCount++;
        fields.push(`last_name = $${paramCount}`);
        params.push(lname);
      }

      if (phone !== undefined) {
        paramCount++;
        fields.push(`phone = $${paramCount}`);
        params.push(phone);
      }

      if (fields.length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No fields to update'
        });
      }

      paramCount++;
      params.push(userId);

      const query = `
        UPDATE users 
        SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${paramCount}
        RETURNING id, username, email, role, first_name, last_name, phone, updated_at, is_active
      `;

      const result = await db.query(query, params);
      const updatedUser = result.rows[0];

      res.json({
        status: 'success',
        message: 'Profile updated successfully',
        user: {
          id: updatedUser.id,
          username: updatedUser.username,
          email: updatedUser.email,
          role: updatedUser.role,
          full_name: `${updatedUser.first_name || ''} ${updatedUser.last_name || ''}`.trim(),
          first_name: updatedUser.first_name,
          last_name: updatedUser.last_name,
          phone: updatedUser.phone,
          updated_at: updatedUser.updated_at,
          is_active: updatedUser.is_active
        }
      });

    } catch (error) {
      console.error('❌ Update profile error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = AuthController;
