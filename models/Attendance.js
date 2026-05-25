const db = require('../config/database');

class Attendance {
  static async clockIn(userId) {
    // Check if user is already clocked in
    const existingQuery = `
      SELECT * FROM attendance 
      WHERE user_id = $1 AND clock_out_time IS NULL
      ORDER BY clock_in_time DESC LIMIT 1
    `;
    
    const existing = await db.query(existingQuery, [userId]);
    
    if (existing.rows.length > 0) {
      throw new Error('User is already clocked in');
    }
    
    const query = `
      INSERT INTO attendance (user_id, clock_in_time, date, created_at)
      VALUES ($1, NOW(), CURRENT_DATE, NOW())
      RETURNING *
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0];
  }

  static async clockOut(userId) {
    // Find the latest clock-in record without clock-out
    const findQuery = `
      SELECT * FROM attendance 
      WHERE user_id = $1 AND clock_out_time IS NULL
      ORDER BY clock_in_time DESC LIMIT 1
    `;
    
    const findResult = await db.query(findQuery, [userId]);
    
    if (findResult.rows.length === 0) {
      throw new Error('No active clock-in record found');
    }
    
    const attendance = findResult.rows[0];
    
    // Calculate hours worked
    const updateQuery = `
      UPDATE attendance 
      SET clock_out_time = NOW(),
          hours_worked = EXTRACT(EPOCH FROM (NOW() - clock_in_time)) / 3600,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await db.query(updateQuery, [attendance.id]);
    return result.rows[0];
  }

  static async getUserAttendance(userId, filters = {}) {
    let query = `
      SELECT a.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.username
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = $1
    `;
    const params = [userId];
    let paramCount = 1;

    if (filters.date_from) {
      paramCount++;
      query += ` AND a.date >= $${paramCount}`;
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      paramCount++;
      query += ` AND a.date <= $${paramCount}`;
      params.push(filters.date_to);
    }

    query += ` ORDER BY a.date DESC, a.clock_in_time DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async getAllAttendance(filters = {}) {
    let query = `
      SELECT a.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.username, u.role
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.user_id) {
      paramCount++;
      query += ` AND a.user_id = $${paramCount}`;
      params.push(filters.user_id);
    }

    if (filters.date_from) {
      paramCount++;
      query += ` AND a.date >= $${paramCount}`;
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      paramCount++;
      query += ` AND a.date <= $${paramCount}`;
      params.push(filters.date_to);
    }

    if (filters.role) {
      paramCount++;
      query += ` AND u.role = $${paramCount}`;
      params.push(filters.role);
    }

    query += ` ORDER BY a.date DESC, a.clock_in_time DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async getWeeklyReport(userId = null, weekStart = null) {
    let query = `
      SELECT 
        u.id as user_id,
        TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name,
        u.username,
        u.role,
        DATE_TRUNC('week', a.date) as week_start,
        SUM(COALESCE(a.hours_worked, 0)) as total_hours,
        COUNT(a.id) as days_worked,
        ARRAY_AGG(
          JSON_BUILD_OBJECT(
            'date', a.date,
            'clock_in', a.clock_in_time,
            'clock_out', a.clock_out_time,
            'hours', a.hours_worked
          ) ORDER BY a.date
        ) as daily_records
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id
    `;
    
    const params = [];
    let paramCount = 0;
    
    if (userId) {
      paramCount++;
      query += ` WHERE u.id = $${paramCount}`;
      params.push(userId);
    }
    
    if (weekStart) {
      const condition = userId ? ' AND' : ' WHERE';
      paramCount++;
      query += `${condition} DATE_TRUNC('week', a.date) = $${paramCount}`;
      params.push(weekStart);
    }
    
    query += `
      GROUP BY u.id, u.first_name, u.last_name, u.username, u.role, DATE_TRUNC('week', a.date)
      ORDER BY week_start DESC, u.first_name, u.last_name
    `;
    
    const result = await db.query(query, params);
    return result.rows;
  }

  static async getCurrentStatus(userId) {
    const query = `
      SELECT * FROM attendance 
      WHERE user_id = $1 AND clock_out_time IS NULL
      ORDER BY clock_in_time DESC LIMIT 1
    `;
    
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  static async getTodayAttendance() {
    const query = `
      SELECT a.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.username, u.role
      FROM attendance a
      JOIN users u ON a.user_id = u.id
      WHERE a.date = CURRENT_DATE
      ORDER BY a.clock_in_time DESC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = Attendance;
