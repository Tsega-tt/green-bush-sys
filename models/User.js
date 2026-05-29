const db = require('../config/database');
const bcrypt = require('bcryptjs');

class User {
  static async create(userData) {
    const { username, email, password, pin, role, phone, store_id } = userData;

    // Accept either first/last name or a single full_name (the UI sends full_name).
    let { first_name, last_name } = userData;
    if ((!first_name && !last_name) && userData.full_name) {
      const parts = String(userData.full_name).trim().split(/\s+/);
      first_name = parts[0] || '';
      last_name = parts.slice(1).join(' ') || '';
    }

    const rounds = parseInt(process.env.BCRYPT_SALT_ROUNDS || 10);
    // Support PIN login (pin_hash) and/or password login (password_hash).
    const passwordHash = password ? await bcrypt.hash(String(password), rounds) : null;
    const pinHash = pin ? await bcrypt.hash(String(pin), rounds) : null;

    const query = `
      INSERT INTO users (username, email, password_hash, pin_hash, role, first_name, last_name, phone, store_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
      RETURNING id, username, email, role, first_name, last_name, phone, store_id, created_at, is_active
    `;

    const result = await db.query(query, [
      username,
      email || null,
      passwordHash,
      pinHash,
      role,
      first_name || null,
      last_name || null,
      phone || null,
      store_id != null && store_id !== '' ? store_id : null,
    ]);

    const user = result.rows[0];
    if (user) {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }

    return user;
  }

  static async findById(id) {
    const query = `
      SELECT id, username, email, role, first_name, last_name, phone, created_at, is_active
      FROM users WHERE id = $1
    `;
    const result = await db.query(query, [id]);
    const user = result.rows[0];
    if (user) {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user;
  }

  static async findByUsername(username) {
    const query = `
      SELECT id, username, email, password_hash, role, first_name, last_name, phone, created_at, is_active
      FROM users WHERE username = $1
    `;
    const result = await db.query(query, [username]);
    const user = result.rows[0];
    if (user) {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user;
  }

  static async findByName(full_name) {
    const query = `
      SELECT id, username, email, password_hash, role, first_name, last_name, phone, created_at, is_active
      FROM users 
      WHERE LOWER(first_name || ' ' || last_name) = LOWER($1)
         OR LOWER(first_name) = LOWER($1)
         OR LOWER(last_name) = LOWER($1)
    `;
    const result = await db.query(query, [full_name]);
    const user = result.rows[0];
    if (user) {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user;
  }

  static async findByEmail(email) {
    const query = `
      SELECT id, username, email, role, first_name, last_name, phone, created_at, is_active
      FROM users WHERE email = $1
    `;
    const result = await db.query(query, [email]);
    const user = result.rows[0];
    if (user) {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user;
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT id, username, email, role, first_name, last_name, phone, created_at, is_active
      FROM users WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.role) {
      paramCount++;
      query += ` AND role = $${paramCount}`;
      params.push(filters.role);
    }

    if (filters.is_active !== undefined) {
      paramCount++;
      query += ` AND is_active = $${paramCount}`;
      params.push(filters.is_active);
    }

    query += ` ORDER BY created_at DESC`;
    
    const result = await db.query(query, params);
    
    // Add full_name to each user
    return result.rows.map(user => {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
      return user;
    });
  }

  static async update(id, userData) {
    const fields = [];
    const params = [];
    let paramCount = 0;

    // Handle password hashing
    if (userData.password) {
      userData.password_hash = await bcrypt.hash(userData.password, parseInt(process.env.BCRYPT_SALT_ROUNDS || 10));
      delete userData.password;
    }

    // Handle full_name by splitting it
    if (userData.full_name) {
      const nameParts = userData.full_name.split(' ');
      userData.first_name = nameParts[0] || '';
      userData.last_name = nameParts.slice(1).join(' ') || '';
      delete userData.full_name;
    }

    Object.keys(userData).forEach(key => {
      if (userData[key] !== undefined && key !== 'id') {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        params.push(userData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    paramCount++;
    params.push(id);

    const query = `
      UPDATE users 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING id, username, email, role, first_name, last_name, phone, updated_at, is_active
    `;

    const result = await db.query(query, params);
    const user = result.rows[0];
    if (user) {
      user.full_name = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    }
    return user;
  }

  static async delete(id) {
    const query = `DELETE FROM users WHERE id = $1 RETURNING id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async validatePassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async validatePin(plainPin, hashedPin) {
    return await bcrypt.compare(plainPin, hashedPin);
  }
}

module.exports = User;
