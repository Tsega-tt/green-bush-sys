const pool = require('../config/database');

class HRAnalytics {
  // Staff Analytics Methods
  static async getEmployeeProductivity(period = 'monthly', userId = null) {
    let dateFilter = '';
    switch (period) {
      case 'daily':
        dateFilter = "AND o.created_at >= CURRENT_DATE";
        break;
      case 'weekly':
        dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'monthly':
        dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'quarterly':
        dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND o.created_at >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    let userFilter = userId ? `AND o.employee_id = ${userId}` : '';

    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        COUNT(o.id) as total_orders,
        SUM(o.total_amount) as total_sales,
        AVG(o.total_amount) as average_order_value,
        COUNT(CASE WHEN o.status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN o.status = 'cancelled' THEN 1 END) as cancelled_orders,
        ROUND(
          COUNT(CASE WHEN o.status = 'completed' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(o.id), 0), 2
        ) as completion_rate
      FROM users u
      LEFT JOIN orders o ON u.id = o.employee_id ${dateFilter}
      WHERE u.role != 'admin' AND u.is_active = true ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY total_sales DESC NULLS LAST
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getAttendancePatterns(period = 'monthly', userId = null) {
    let dateFilter = '';
    switch (period) {
      case 'weekly':
        dateFilter = "AND a.date >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'monthly':
        dateFilter = "AND a.date >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'quarterly':
        dateFilter = "AND a.date >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND a.date >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    let userFilter = userId ? `AND a.user_id = ${userId}` : '';

    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        COUNT(a.id) as total_days_worked,
        SUM(a.hours_worked) as total_hours_worked,
        AVG(a.hours_worked) as average_hours_per_day,
        COUNT(CASE WHEN a.clock_in_time::time > '09:00:00' THEN 1 END) as late_arrivals,
        COUNT(CASE WHEN a.hours_worked < 8 THEN 1 END) as short_days,
        ROUND(
          COUNT(CASE WHEN a.clock_in_time::time <= '09:00:00' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(a.id), 0), 2
        ) as punctuality_rate
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id ${dateFilter}
      WHERE u.role != 'admin' AND u.is_active = true ${userFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY total_hours_worked DESC NULLS LAST
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getTurnoverRates(period = 'annual') {
    let dateFilter = '';
    switch (period) {
      case 'quarterly':
        dateFilter = "AND u.created_at >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND u.created_at >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    const query = `
      SELECT 
        u.role as department,
        COUNT(*) as total_employees,
        COUNT(CASE WHEN u.is_active = false THEN 1 END) as inactive_employees,
        ROUND(
          COUNT(CASE WHEN u.is_active = false THEN 1 END) * 100.0 / 
          NULLIF(COUNT(*), 0), 2
        ) as turnover_rate
      FROM users u
      WHERE u.role != 'admin' ${dateFilter}
      GROUP BY u.role
      ORDER BY turnover_rate DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getTrainingEffectiveness() {
    const query = `
      SELECT 
        tr.training_type,
        COUNT(*) as total_participants,
        COUNT(CASE WHEN tr.status = 'completed' THEN 1 END) as completed_count,
        AVG(CASE WHEN tr.score IS NOT NULL THEN tr.score END) as average_score,
        ROUND(
          COUNT(CASE WHEN tr.status = 'completed' THEN 1 END) * 100.0 / 
          NULLIF(COUNT(*), 0), 2
        ) as completion_rate
      FROM training_records tr
      GROUP BY tr.training_type
      ORDER BY completion_rate DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async getCustomerSatisfactionScores(period = 'monthly', employeeId = null) {
    let dateFilter = '';
    switch (period) {
      case 'weekly':
        dateFilter = "AND cf.submitted_at >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'monthly':
        dateFilter = "AND cf.submitted_at >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'quarterly':
        dateFilter = "AND cf.submitted_at >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND cf.submitted_at >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    let employeeFilter = employeeId ? `AND cf.employee_id = ${employeeId}` : '';

    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        COUNT(cf.id) as total_feedback,
        AVG(cf.rating) as average_rating,
        COUNT(CASE WHEN cf.rating >= 4 THEN 1 END) as positive_feedback,
        COUNT(CASE WHEN cf.rating <= 2 THEN 1 END) as negative_feedback,
        ROUND(
          COUNT(CASE WHEN cf.rating >= 4 THEN 1 END) * 100.0 / 
          NULLIF(COUNT(cf.id), 0), 2
        ) as satisfaction_rate
      FROM users u
      LEFT JOIN customer_feedback cf ON u.id = cf.employee_id ${dateFilter}
      WHERE u.role != 'admin' AND u.is_active = true ${employeeFilter}
      GROUP BY u.id, u.first_name, u.last_name, u.role
      HAVING COUNT(cf.id) > 0
      ORDER BY average_rating DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  // Reports Generation Methods
  static async generateDailyAttendanceReport(date = null) {
    const targetDate = date || new Date().toISOString().split('T')[0];
    
    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        a.clock_in_time,
        a.clock_out_time,
        a.hours_worked,
        CASE 
          WHEN a.clock_in_time IS NULL THEN 'Absent'
          WHEN a.clock_out_time IS NULL THEN 'Clocked In'
          ELSE 'Completed'
        END as status
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date = $1
      WHERE u.role != 'admin' AND u.is_active = true
      ORDER BY u.role, u.first_name, u.last_name
    `;
    
    const result = await pool.query(query, [targetDate]);
    return result.rows;
  }

  static async generateWeeklyPerformanceReport(startDate = null) {
    const weekStart = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        COUNT(DISTINCT a.date) as days_worked,
        SUM(a.hours_worked) as total_hours,
        COUNT(o.id) as orders_handled,
        SUM(o.total_amount) as total_sales,
        AVG(pm.score) as average_performance_score
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id AND a.date BETWEEN $1 AND $2
      LEFT JOIN orders o ON u.id = o.employee_id AND o.created_at::date BETWEEN $1 AND $2
      LEFT JOIN performance_metrics pm ON u.id = pm.user_id 
        AND pm.period_start <= $2 AND pm.period_end >= $1
      WHERE u.role != 'admin' AND u.is_active = true
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY u.role, total_sales DESC NULLS LAST
    `;
    
    const result = await pool.query(query, [weekStart, weekEnd]);
    return result.rows;
  }

  static async generateMonthlyPayrollReport(month = null, year = null) {
    const currentDate = new Date();
    const targetMonth = month || currentDate.getMonth() + 1;
    const targetYear = year || currentDate.getFullYear();
    
    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        pr.pay_period_start,
        pr.pay_period_end,
        pr.regular_hours,
        pr.overtime_hours,
        pr.gross_pay,
        pr.deductions,
        pr.net_pay,
        pr.status
      FROM users u
      JOIN payroll_records pr ON u.id = pr.user_id
      WHERE EXTRACT(MONTH FROM pr.pay_period_end) = $1 
        AND EXTRACT(YEAR FROM pr.pay_period_end) = $2
        AND u.role != 'admin'
      ORDER BY u.role, u.first_name, u.last_name, pr.pay_period_end DESC
    `;
    
    const result = await pool.query(query, [targetMonth, targetYear]);
    return result.rows;
  }

  static async generateQuarterlyReviewReport(quarter = null, year = null) {
    const currentDate = new Date();
    const targetYear = year || currentDate.getFullYear();
    const targetQuarter = quarter || Math.ceil((currentDate.getMonth() + 1) / 3);
    
    const startMonth = (targetQuarter - 1) * 3 + 1;
    const endMonth = targetQuarter * 3;
    
    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        COUNT(pr.id) as total_reviews,
        AVG(pr.overall_score) as average_score,
        COUNT(eg.id) as active_goals,
        AVG(eg.progress) as average_goal_progress,
        STRING_AGG(DISTINCT pr.review_type, ', ') as review_types
      FROM users u
      LEFT JOIN performance_reviews pr ON u.id = pr.user_id 
        AND EXTRACT(MONTH FROM pr.review_date) BETWEEN $1 AND $2
        AND EXTRACT(YEAR FROM pr.review_date) = $3
      LEFT JOIN employee_goals eg ON u.id = eg.user_id 
        AND eg.status = 'active'
      WHERE u.role != 'admin' AND u.is_active = true
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY u.role, average_score DESC NULLS LAST
    `;
    
    const result = await pool.query(query, [startMonth, endMonth, targetYear]);
    return result.rows;
  }

  static async generateAnnualAssessmentReport(year = null) {
    const targetYear = year || new Date().getFullYear();
    
    const query = `
      SELECT 
        u.id, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as full_name, u.role,
        COUNT(DISTINCT a.date) as total_days_worked,
        SUM(a.hours_worked) as total_hours_worked,
        COUNT(o.id) as total_orders_handled,
        SUM(o.total_amount) as total_sales_generated,
        AVG(pm.score) as average_performance_score,
        COUNT(pr.id) as total_reviews_completed,
        COUNT(eg.id) as total_goals_set,
        COUNT(CASE WHEN eg.status = 'completed' THEN 1 END) as goals_completed,
        AVG(cf.rating) as average_customer_rating
      FROM users u
      LEFT JOIN attendance a ON u.id = a.user_id 
        AND EXTRACT(YEAR FROM a.date) = $1
      LEFT JOIN orders o ON u.id = o.employee_id 
        AND EXTRACT(YEAR FROM o.created_at) = $1
      LEFT JOIN performance_metrics pm ON u.id = pm.user_id 
        AND EXTRACT(YEAR FROM pm.period_start) = $1
      LEFT JOIN performance_reviews pr ON u.id = pr.user_id 
        AND EXTRACT(YEAR FROM pr.review_date) = $1
      LEFT JOIN employee_goals eg ON u.id = eg.user_id 
        AND EXTRACT(YEAR FROM eg.created_at) = $1
      LEFT JOIN customer_feedback cf ON u.id = cf.employee_id 
        AND EXTRACT(YEAR FROM cf.submitted_at) = $1
      WHERE u.role != 'admin' AND u.is_active = true
      GROUP BY u.id, u.first_name, u.last_name, u.role
      ORDER BY u.role, total_sales_generated DESC NULLS LAST
    `;
    
    const result = await pool.query(query, [targetYear]);
    return result.rows;
  }

  // Cache Management for Performance
  static async cacheAnalytics(metricName, metricValue, periodType, periodDate) {
    const query = `
      INSERT INTO hr_analytics_cache (metric_name, metric_value, period_type, period_date)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (metric_name, period_type, period_date)
      DO UPDATE SET metric_value = $2, calculated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    
    const result = await pool.query(query, [metricName, JSON.stringify(metricValue), periodType, periodDate]);
    return result.rows[0];
  }

  static async getCachedAnalytics(metricName, periodType, periodDate) {
    const query = `
      SELECT metric_value, calculated_at
      FROM hr_analytics_cache
      WHERE metric_name = $1 AND period_type = $2 AND period_date = $3
        AND calculated_at > CURRENT_TIMESTAMP - INTERVAL '1 hour'
    `;
    
    const result = await pool.query(query, [metricName, periodType, periodDate]);
    return result.rows[0] ? JSON.parse(result.rows[0].metric_value) : null;
  }
}

module.exports = HRAnalytics;
