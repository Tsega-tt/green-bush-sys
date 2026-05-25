const Payroll = require('../models/Payroll');
const { validationResult } = require('express-validator');

class PayrollController {
  // Employee Salaries Controllers
  static async createSalary(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const salary = await Payroll.createSalary(req.body);
      res.status(201).json({
        success: true,
        message: 'Employee salary created successfully',
        data: salary
      });
    } catch (error) {
      console.error('Error creating employee salary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create employee salary',
        error: error.message
      });
    }
  }

  static async getSalaryByUser(req, res) {
    try {
      const { userId } = req.params;
      const salary = await Payroll.getSalaryByUser(userId);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'No salary information found for this employee'
        });
      }

      res.json({
        success: true,
        data: salary
      });
    } catch (error) {
      console.error('Error fetching employee salary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch employee salary',
        error: error.message
      });
    }
  }

  static async getAllSalaries(req, res) {
    try {
      const salaries = await Payroll.getAllSalaries();
      res.json({
        success: true,
        data: salaries
      });
    } catch (error) {
      console.error('Error fetching all salaries:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch employee salaries',
        error: error.message
      });
    }
  }

  static async updateSalary(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { salaryId } = req.params;
      const salary = await Payroll.updateSalary(salaryId, req.body);

      if (!salary) {
        return res.status(404).json({
          success: false,
          message: 'Salary record not found'
        });
      }

      res.json({
        success: true,
        message: 'Employee salary updated successfully',
        data: salary
      });
    } catch (error) {
      console.error('Error updating employee salary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update employee salary',
        error: error.message
      });
    }
  }

  // Payroll Records Controllers
  static async createPayrollRecord(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const payrollData = {
        ...req.body,
        processed_by: req.user?.id || 1 // Default to admin if no user context
      };

      const payrollRecord = await Payroll.createPayrollRecord(payrollData);
      res.status(201).json({
        success: true,
        message: 'Payroll record created successfully',
        data: payrollRecord
      });
    } catch (error) {
      console.error('Error creating payroll record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create payroll record',
        error: error.message
      });
    }
  }

  static async getPayrollRecordsByUser(req, res) {
    try {
      const { userId } = req.params;
      const { limit } = req.query;
      
      const payrollRecords = await Payroll.getPayrollRecordsByUser(userId, limit);
      res.json({
        success: true,
        data: payrollRecords
      });
    } catch (error) {
      console.error('Error fetching user payroll records:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payroll records',
        error: error.message
      });
    }
  }

  static async getAllPayrollRecords(req, res) {
    try {
      const { status, limit } = req.query;
      const payrollRecords = await Payroll.getAllPayrollRecords(status, limit);
      
      res.json({
        success: true,
        data: payrollRecords
      });
    } catch (error) {
      console.error('Error fetching all payroll records:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payroll records',
        error: error.message
      });
    }
  }

  static async updatePayrollRecord(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { recordId } = req.params;
      const updateData = {
        ...req.body,
        processed_by: req.user?.id || 1
      };

      const payrollRecord = await Payroll.updatePayrollRecord(recordId, updateData);

      if (!payrollRecord) {
        return res.status(404).json({
          success: false,
          message: 'Payroll record not found'
        });
      }

      res.json({
        success: true,
        message: 'Payroll record updated successfully',
        data: payrollRecord
      });
    } catch (error) {
      console.error('Error updating payroll record:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update payroll record',
        error: error.message
      });
    }
  }

  static async calculatePayroll(req, res) {
    try {
      const { userId, payPeriodStart, payPeriodEnd } = req.body;

      if (!userId || !payPeriodStart || !payPeriodEnd) {
        return res.status(400).json({
          success: false,
          message: 'User ID, pay period start, and pay period end are required'
        });
      }

      const calculatedPayroll = await Payroll.calculatePayroll(userId, payPeriodStart, payPeriodEnd);
      
      res.json({
        success: true,
        message: 'Payroll calculated successfully',
        data: calculatedPayroll
      });
    } catch (error) {
      console.error('Error calculating payroll:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to calculate payroll',
        error: error.message
      });
    }
  }

  // Employee Benefits Controllers
  static async createBenefit(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const benefit = await Payroll.createBenefit(req.body);
      res.status(201).json({
        success: true,
        message: 'Employee benefit created successfully',
        data: benefit
      });
    } catch (error) {
      console.error('Error creating employee benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create employee benefit',
        error: error.message
      });
    }
  }

  static async getBenefitsByUser(req, res) {
    try {
      const { userId } = req.params;
      const benefits = await Payroll.getBenefitsByUser(userId);
      
      res.json({
        success: true,
        data: benefits
      });
    } catch (error) {
      console.error('Error fetching user benefits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch employee benefits',
        error: error.message
      });
    }
  }

  static async getAllBenefits(req, res) {
    try {
      const benefits = await Payroll.getAllBenefits();
      res.json({
        success: true,
        data: benefits
      });
    } catch (error) {
      console.error('Error fetching all benefits:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch employee benefits',
        error: error.message
      });
    }
  }

  static async updateBenefit(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { benefitId } = req.params;
      const benefit = await Payroll.updateBenefit(benefitId, req.body);

      if (!benefit) {
        return res.status(404).json({
          success: false,
          message: 'Employee benefit not found'
        });
      }

      res.json({
        success: true,
        message: 'Employee benefit updated successfully',
        data: benefit
      });
    } catch (error) {
      console.error('Error updating employee benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update employee benefit',
        error: error.message
      });
    }
  }

  static async deleteBenefit(req, res) {
    try {
      const { benefitId } = req.params;
      const benefit = await Payroll.deleteBenefit(benefitId);

      if (!benefit) {
        return res.status(404).json({
          success: false,
          message: 'Employee benefit not found'
        });
      }

      res.json({
        success: true,
        message: 'Employee benefit deleted successfully',
        data: benefit
      });
    } catch (error) {
      console.error('Error deleting employee benefit:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete employee benefit',
        error: error.message
      });
    }
  }

  // Payroll Analytics Controllers
  static async getPayrollSummary(req, res) {
    try {
      const { period } = req.query;
      const summary = await Payroll.getPayrollSummary(period);
      
      res.json({
        success: true,
        data: summary
      });
    } catch (error) {
      console.error('Error fetching payroll summary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payroll summary',
        error: error.message
      });
    }
  }

  static async getPayrollByDepartment(req, res) {
    try {
      const { period } = req.query;
      const departmentPayroll = await Payroll.getPayrollByDepartment(period);
      
      res.json({
        success: true,
        data: departmentPayroll
      });
    } catch (error) {
      console.error('Error fetching payroll by department:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch payroll by department',
        error: error.message
      });
    }
  }
}

module.exports = PayrollController;
