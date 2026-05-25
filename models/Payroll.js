const pool = require('../config/database');

class Payroll {
  // Employee Salaries Methods
  static async createSalary(salaryData) {
    const { user_id, payment_type, base_amount, currency, effective_date, end_date } = salaryData;
    
    // Deactivate previous salary records for this user
    await pool.query(
      'UPDATE employee_salaries SET is_active = false WHERE user_id = $1 AND is_active = true',
      [user_id]
    );
    
    const query = `
      INSERT INTO employee_salaries (user_id, payment_type, base_amount, currency, effective_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `;
    
    const result = await pool.query(query, [user_id, payment_type, base_amount, currency, effective_date, end_date]);
    return result.rows[0];
  }

  static async getSalaryByUser(userId) {
    const query = `
      SELECT es.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name
      FROM employee_salaries es
      JOIN users u ON es.user_id = u.id
      WHERE es.user_id = $1 AND es.is_active = true
      ORDER BY es.effective_date DESC
      LIMIT 1
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  static async getAllSalaries() {
    const query = `
      SELECT es.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name, u.role
      FROM employee_salaries es
      JOIN users u ON es.user_id = u.id
      WHERE es.is_active = true AND u.is_active = true
      ORDER BY u.first_name, u.last_name
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async updateSalary(salaryId, updateData) {
    const { payment_type, base_amount, currency, end_date } = updateData;
    
    const query = `
      UPDATE employee_salaries 
      SET payment_type = $1, base_amount = $2, currency = $3, end_date = $4, updated_at = CURRENT_TIMESTAMP
      WHERE id = $5
      RETURNING *
    `;
    
    const result = await pool.query(query, [payment_type, base_amount, currency, end_date, salaryId]);
    return result.rows[0];
  }

  // Payroll Records Methods
  static async createPayrollRecord(payrollData) {
    const {
      user_id, pay_period_start, pay_period_end, regular_hours, overtime_hours,
      regular_pay, overtime_pay, bonus_amount, commission_amount, deductions,
      gross_pay, net_pay, processed_by
    } = payrollData;
    
    const query = `
      INSERT INTO payroll_records 
      (user_id, pay_period_start, pay_period_end, regular_hours, overtime_hours,
       regular_pay, overtime_pay, bonus_amount, commission_amount, deductions,
       gross_pay, net_pay, processed_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `;
    
    const result = await pool.query(query, [
      user_id, pay_period_start, pay_period_end, regular_hours, overtime_hours,
      regular_pay, overtime_pay, bonus_amount, commission_amount, deductions,
      gross_pay, net_pay, processed_by
    ]);
    return result.rows[0];
  }

  static async getPayrollRecordsByUser(userId, limit = 12) {
    const query = `
      SELECT pr.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             TRIM(CONCAT(p.first_name, ' ', COALESCE(p.last_name, ''))) as processed_by_name
      FROM payroll_records pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users p ON pr.processed_by = p.id
      WHERE pr.user_id = $1
      ORDER BY pr.pay_period_end DESC
      LIMIT $2
    `;
    
    const result = await pool.query(query, [userId, limit]);
    return result.rows;
  }

  static async getAllPayrollRecords(status = null, limit = 50) {
    let query = `
      SELECT pr.*,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             u.role,
             TRIM(CONCAT(p.first_name, ' ', COALESCE(p.last_name, ''))) as processed_by_name
      FROM payroll_records pr
      JOIN users u ON pr.user_id = u.id
      LEFT JOIN users p ON pr.processed_by = p.id
    `;
    
    const params = [];
    if (status) {
      query += ` WHERE pr.status = $1`;
      params.push(status);
    }
    
    query += ` ORDER BY pr.pay_period_end DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async updatePayrollRecord(recordId, updateData) {
    const { status, processed_by } = updateData;
    
    const query = `
      UPDATE payroll_records 
      SET status = $1, processed_by = $2, processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await pool.query(query, [status, processed_by, recordId]);
    return result.rows[0];
  }

  static async calculatePayroll(userId, payPeriodStart, payPeriodEnd) {
    // Get employee salary information
    const salary = await this.getSalaryByUser(userId);
    if (!salary) {
      throw new Error('No salary information found for employee');
    }

    // Get attendance records for the pay period
    const attendanceQuery = `
      SELECT 
        SUM(hours_worked) as total_hours,
        COUNT(*) as days_worked
      FROM attendance 
      WHERE user_id = $1 AND date >= $2 AND date <= $3 AND clock_out_time IS NOT NULL
    `;
    
    const attendanceResult = await pool.query(attendanceQuery, [userId, payPeriodStart, payPeriodEnd]);
    const attendance = attendanceResult.rows[0];
    
    const totalHours = parseFloat(attendance.total_hours) || 0;
    const regularHours = Math.min(totalHours, 40); // Assuming 40 hours per week standard
    const overtimeHours = Math.max(totalHours - 40, 0);
    
    let regularPay = 0;
    let overtimePay = 0;
    
    if (salary.payment_type === 'hourly') {
      regularPay = regularHours * parseFloat(salary.base_amount);
      overtimePay = overtimeHours * parseFloat(salary.base_amount) * 1.5; // 1.5x overtime rate
    } else if (salary.payment_type === 'fixed') {
      regularPay = parseFloat(salary.base_amount);
    }
    
    const grossPay = regularPay + overtimePay;
    const deductions = grossPay * 0.15; // Assuming 15% total deductions (taxes, etc.)
    const netPay = grossPay - deductions;
    
    return {
      user_id: userId,
      pay_period_start: payPeriodStart,
      pay_period_end: payPeriodEnd,
      regular_hours: regularHours,
      overtime_hours: overtimeHours,
      regular_pay: regularPay.toFixed(2),
      overtime_pay: overtimePay.toFixed(2),
      bonus_amount: 0,
      commission_amount: 0,
      deductions: deductions.toFixed(2),
      gross_pay: grossPay.toFixed(2),
      net_pay: netPay.toFixed(2)
    };
  }

  // Employee Benefits Methods
  static async createBenefit(benefitData) {
    const { user_id, benefit_type, benefit_name, description, value, start_date, end_date } = benefitData;
    
    const query = `
      INSERT INTO employee_benefits (user_id, benefit_type, benefit_name, description, value, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;
    
    const result = await pool.query(query, [user_id, benefit_type, benefit_name, description, value, start_date, end_date]);
    return result.rows[0];
  }

  static async getBenefitsByUser(userId) {
    const query = `
      SELECT eb.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name
      FROM employee_benefits eb
      JOIN users u ON eb.user_id = u.id
      WHERE eb.user_id = $1 AND eb.is_active = true
      ORDER BY eb.start_date DESC
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows;
  }

  static async getAllBenefits() {
    const query = `
      SELECT eb.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name, u.role
      FROM employee_benefits eb
      JOIN users u ON eb.user_id = u.id
      WHERE eb.is_active = true AND u.is_active = true
      ORDER BY u.first_name, u.last_name, eb.benefit_type
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }

  static async updateBenefit(benefitId, updateData) {
    const { benefit_name, description, value, end_date, is_active } = updateData;
    
    const query = `
      UPDATE employee_benefits 
      SET benefit_name = $1, description = $2, value = $3, end_date = $4, is_active = $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
      RETURNING *
    `;
    
    const result = await pool.query(query, [benefit_name, description, value, end_date, is_active, benefitId]);
    return result.rows[0];
  }

  static async deleteBenefit(benefitId) {
    const query = `
      UPDATE employee_benefits 
      SET is_active = false, updated_at = CURRENT_TIMESTAMP
      WHERE id = $1
      RETURNING *
    `;
    
    const result = await pool.query(query, [benefitId]);
    return result.rows[0];
  }

  // Payroll Analytics Methods
  static async getPayrollSummary(period = 'monthly') {
    let dateFilter = '';
    switch (period) {
      case 'weekly':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'monthly':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'quarterly':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    const query = `
      SELECT 
        COUNT(DISTINCT pr.user_id) as total_employees,
        SUM(pr.gross_pay) as total_gross_pay,
        SUM(pr.net_pay) as total_net_pay,
        SUM(pr.deductions) as total_deductions,
        SUM(pr.regular_hours) as total_regular_hours,
        SUM(pr.overtime_hours) as total_overtime_hours,
        AVG(pr.gross_pay) as average_gross_pay,
        AVG(pr.net_pay) as average_net_pay
      FROM payroll_records pr
      WHERE pr.status = 'paid' ${dateFilter}
    `;
    
    const result = await pool.query(query);
    return result.rows[0];
  }

  static async getPayrollByDepartment(period = 'monthly') {
    let dateFilter = '';
    switch (period) {
      case 'weekly':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '7 days'";
        break;
      case 'monthly':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '30 days'";
        break;
      case 'quarterly':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '90 days'";
        break;
      case 'annual':
        dateFilter = "AND pr.pay_period_end >= CURRENT_DATE - INTERVAL '365 days'";
        break;
    }

    const query = `
      SELECT 
        u.role as department,
        COUNT(DISTINCT pr.user_id) as employee_count,
        SUM(pr.gross_pay) as total_gross_pay,
        SUM(pr.net_pay) as total_net_pay,
        AVG(pr.gross_pay) as average_gross_pay,
        SUM(pr.regular_hours) as total_hours
      FROM payroll_records pr
      JOIN users u ON pr.user_id = u.id
      WHERE pr.status = 'paid' ${dateFilter}
      GROUP BY u.role
      ORDER BY total_gross_pay DESC
    `;
    
    const result = await pool.query(query);
    return result.rows;
  }
}

module.exports = Payroll;
