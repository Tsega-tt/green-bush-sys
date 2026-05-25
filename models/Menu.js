const db = require('../config/database');

class Menu {
  static async create(menuData) {
    const { name, description, price, category, type, is_available, image_url } = menuData;
    
    const query = `
      INSERT INTO menu_items (name, description, price, category, type, is_available, image_url, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await db.query(query, [name, description, price, category, type, is_available, image_url]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `SELECT * FROM menu_items WHERE id = $1`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findAll(filters = {}) {
    let query = `SELECT * FROM menu_items WHERE 1=1`;
    const params = [];
    let paramCount = 0;

    if (filters.type) {
      paramCount++;
      query += ` AND type = $${paramCount}`;
      params.push(filters.type);
    }

    if (filters.category) {
      paramCount++;
      query += ` AND category = $${paramCount}`;
      params.push(filters.category);
    }

    if (filters.is_available !== undefined) {
      paramCount++;
      query += ` AND is_available = $${paramCount}`;
      params.push(filters.is_available);
    }

    query += ` ORDER BY category, name`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async update(id, menuData) {
    const fields = [];
    const params = [];
    let paramCount = 0;

    Object.keys(menuData).forEach(key => {
      if (menuData[key] !== undefined && key !== 'id') {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        params.push(menuData[key]);
      }
    });

    if (fields.length === 0) {
      throw new Error('No fields to update');
    }

    paramCount++;
    params.push(id);

    const query = `
      UPDATE menu_items 
      SET ${fields.join(', ')}, updated_at = NOW()
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, params);
    return result.rows[0];
  }

  static async delete(id) {
    const query = `DELETE FROM menu_items WHERE id = $1 RETURNING id`;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async getBakeryMenu() {
    const query = `
      SELECT * FROM menu_items 
      WHERE type = 'bakery' AND is_available = true 
      ORDER BY category, name
    `;
    const result = await db.query(query);
    return result.rows;
  }

  static async getCafeMenu() {
    const query = `
      SELECT * FROM menu_items 
      WHERE type = 'cafe' AND is_available = true 
      ORDER BY category, name
    `;
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = Menu;
