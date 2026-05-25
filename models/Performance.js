const pool = require('../config/database');

class Performance {
  // Performance Metrics Methods
  static async createMetric(metricData) {
    const { user_id, metric_type, score, period_start, period_end, notes, recorded_by } = metricData;
    
    const query = `
      INSERT INTO performance_metrics (user_id, metric_type, score, period_start, period_end, notes, recorded_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await pool.query(query, [user_id, metric_type, score, period_start, period_end, notes, recorded_by]);
    return result.rows[0];
  }

  static async getMetricsByUser(userId, startDate = null, endDate = null) {
    let query = `
      SELECT pm.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             TRIM(CONCAT(r.first_name, ' ', COALESCE(r.last_name, ''))) as recorded_by_name
      FROM performance_metrics pm
      JOIN users u ON pm.user_id = u.id
      LEFT JOIN users r ON pm.recorded_by = r.id
      WHERE pm.user_id = $1
    `;
    
    const params = [userId];
    
    if (startDate && endDate) {
      query += ` AND pm.period_start >= $2 AND pm.period_end <= $3`;
      params.push(startDate, endDate);
    }
    
    query += ` ORDER BY pm.period_start DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async getMetricsByType(metricType, startDate = null, endDate = null) {
    let query = `
      SELECT pm.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             TRIM(CONCAT(r.first_name, ' ', COALESCE(r.last_name, ''))) as recorded_by_name
      FROM performance_metrics pm
      JOIN users u ON pm.user_id = u.id
      LEFT JOIN users r ON pm.recorded_by = r.id
      WHERE pm.metric_type = $1
    `;
    
    const params = [metricType];
    
    if (startDate && endDate) {
      query += ` AND pm.period_start >= $2 AND pm.period_end <= $3`;
      params.push(startDate, endDate);
    }
    
    query += ` ORDER BY pm.period_start DESC`;
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async updateMetric(metricId, updateData) {
    const { score, notes } = updateData;
    
    const query = `
      UPDATE performance_metrics 
      SET score = $1, notes = $2, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [score, notes, metricId]);
    return result.rows[0];
  }

  // Performance Reviews Methods
  static async createReview(reviewData) {
    const { 
      user_id, reviewer_id, review_type, review_date, overall_score, 
      strengths, areas_for_improvement, goals, action_items 
    } = reviewData;
    
    const query = `
      INSERT INTO performance_reviews 
      (user_id, reviewer_id, review_type, review_date, overall_score, strengths, areas_for_improvement, goals, action_items)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      user_id, reviewer_id, review_type, review_date, overall_score,
      strengths, areas_for_improvement, goals, action_items
    ]);
    return result.rows[0];
  }

  static async getReviewsByUser(userId) {
    const query = `
      SELECT pr.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             TRIM(CONCAT(r.first_name, ' ', COALESCE(r.last_name, ''))) as reviewer_name
      FROM performance_reviews pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users r ON pr.reviewer_id = r.id
      WHERE pr.user_id = $1
      ORDER BY pr.review_date DESC
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async getReviewById(reviewId) {
    const query = `
      SELECT pr.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             TRIM(CONCAT(r.first_name, ' ', COALESCE(r.last_name, ''))) as reviewer_name
      FROM performance_reviews pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users r ON pr.reviewer_id = r.id
      WHERE pr.id = $1
    `;
    
    const result = await pool.query(query, [reviewId]);
    return result.rows[0];
  }

  static async updateReview(reviewId, updateData) {
    const { 
      overall_score, strengths, areas_for_improvement, 
      goals, action_items, status 
    } = updateData;
    
    const query = `
      UPDATE performance_reviews 
      SET overall_score = $1, strengths = $2, areas_for_improvement = $3, 
          goals = $4, action_items = $5, status = $6, updated_at = CURRENT_TIMESTAMP
      WHERE id = $7
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      overall_score, strengths, areas_for_improvement,
      goals, action_items, status, reviewId
    ]);
    return result.rows[0];
  }

  static async getUpcomingReviews() {
    const query = `
      SELECT * FROM (
        SELECT u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
               CASE 
                 WHEN pr_weekly.last_review IS NULL OR pr_weekly.last_review < CURRENT_DATE - INTERVAL '7 days' THEN 'weekly'
                 WHEN pr_monthly.last_review IS NULL OR pr_monthly.last_review < CURRENT_DATE - INTERVAL '30 days' THEN 'monthly'
                 WHEN pr_quarterly.last_review IS NULL OR pr_quarterly.last_review < CURRENT_DATE - INTERVAL '90 days' THEN 'quarterly'
                 WHEN pr_annual.last_review IS NULL OR pr_annual.last_review < CURRENT_DATE - INTERVAL '365 days' THEN 'annual'
               END as review_type_due
        FROM users u
        LEFT JOIN (
          SELECT user_id, MAX(review_date) as last_review 
          FROM performance_reviews 
          WHERE review_type = 'weekly' 
          GROUP BY user_id
        ) pr_weekly ON u.id = pr_weekly.user_id
        LEFT JOIN (
          SELECT user_id, MAX(review_date) as last_review 
          FROM performance_reviews 
          WHERE review_type = 'monthly' 
          GROUP BY user_id
        ) pr_monthly ON u.id = pr_monthly.user_id
        LEFT JOIN (
          SELECT user_id, MAX(review_date) as last_review 
          FROM performance_reviews 
          WHERE review_type = 'quarterly' 
          GROUP BY user_id
        ) pr_quarterly ON u.id = pr_quarterly.user_id
        LEFT JOIN (
          SELECT user_id, MAX(review_date) as last_review 
          FROM performance_reviews 
          WHERE review_type = 'annual' 
          GROUP BY user_id
        ) pr_annual ON u.id = pr_annual.user_id
        WHERE u.role != 'admin' AND u.is_active = true
      ) reviews
      WHERE review_type_due IS NOT NULL
      ORDER BY full_name
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  // Employee Goals Methods
  static async createGoal(goalData) {
    const { user_id, title, description, target_date, set_by } = goalData;
    
    const query = `
      INSERT INTO employee_goals (user_id, title, description, target_date, set_by)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    
    const result = await pool.query(query, [user_id, title, description, target_date, set_by]);
    return result.rows[0];
  }

  static async getGoalsByUser(userId) {
    const query = `
      SELECT eg.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             TRIM(CONCAT(s.first_name, ' ', COALESCE(s.last_name, ''))) as set_by_name
      FROM employee_goals eg
      JOIN users u ON eg.user_id = u.id
      LEFT JOIN users s ON eg.set_by = s.id
      WHERE eg.user_id = $1
      ORDER BY eg.created_at DESC
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async updateGoal(goalId, updateData) {
    const { title, description, target_date, status, progress } = updateData;
    
    const query = `
      UPDATE employee_goals 
      SET title = $1, description = $2, target_date = $3, status = $4, progress = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    
    const result = await pool.query(query, [title, description, target_date, status, progress, goalId]);
    return result.rows[0];
  }

  static async deleteGoal(goalId) {
    const query = `DELETE FROM employee_goals WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [goalId]);
    return result.rows[0];
  }

  // Analytics Methods
  static async getPerformanceOverview(userId = null, period = 'monthly') {
    let dateFilter = '';
    switch (period) {
      case 'weekly':
        dateFilter = "AND pm.period_start >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'monthly':
        dateFilter = "AND pm.period_start >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'quarterly':
        dateFilter = "AND pm.period_start >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND pm.period_start >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    let userFilter = userId ? `AND pm.user_id = ${userId}` : '';

    const query = `
      SELECT 
        pm.metric_type,
        AVG(pm.score) as average_score,
        COUNT(*) as total_records,
        MIN(pm.score) as min_score,
        MAX(pm.score) as max_score
      FROM performance_metrics pm
      WHERE 1=1 ${dateFilter} ${userFilter}
      GROUP BY pm.metric_type
      ORDER BY pm.metric_type
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getTopPerformers(metricType = null, limit = 10) {
    let metricFilter = metricType ? `AND pm.metric_type = '${metricType}'` : '';

    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        AVG(pm.score) as average_score,
        COUNT(pm.id) as total_metrics
      FROM users u
      JOIN performance_metrics pm ON u.id = pm.user_id
      WHERE u.role != 'admin' AND u.is_active = true ${metricFilter}
        AND pm.period_start >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY u.id, u.first_name, u.last_name, u.role
      HAVING COUNT(pm.id) >= 3
      ORDER BY average_score DESC
      LIMIT $1
    `;
    
    const result = await pool.query(query, [limit]);
    return result.rows;
  }
}

module.exports = Performance;
