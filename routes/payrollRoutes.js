const express = require('express');
const router = express.Router();
const PayrollController = require('../controllers/payrollController');
const { body, param, query } = require('express-validator');

// Validation middleware
const validateSalary = [
  body('user_id').isInt().withMessage('User ID must be an integer'),
  body('payment_type').isIn(['hourly', 'fixed', 'commission', 'bonus'])
    .withMessage('Invalid payment type'),
  body('base_amount').isFloat({ min: 0 }).withMessage('Base amount must be a positive number'),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('effective_date').isISO8601().withMessage('Effective date must be a valid date'),
  body('end_date').optional().isISO8601().withMessage('End date must be a valid date')
];

const validatePayrollRecord = [
  body('user_id').isInt().withMessage('User ID must be an integer'),
  body('pay_period_start').isISO8601().withMessage('Pay period start must be a valid date'),
  body('pay_period_end').isISO8601().withMessage('Pay period end must be a valid date'),
  body('regular_hours').optional().isFloat({ min: 0 }).withMessage('Regular hours must be a positive number'),
  body('overtime_hours').optional().isFloat({ min: 0 }).withMessage('Overtime hours must be a positive number'),
  body('regular_pay').optional().isFloat({ min: 0 }).withMessage('Regular pay must be a positive number'),
  body('overtime_pay').optional().isFloat({ min: 0 }).withMessage('Overtime pay must be a positive number'),
  body('bonus_amount').optional().isFloat({ min: 0 }).withMessage('Bonus amount must be a positive number'),
  body('commission_amount').optional().isFloat({ min: 0 }).withMessage('Commission amount must be a positive number'),
  body('deductions').optional().isFloat({ min: 0 }).withMessage('Deductions must be a positive number'),
  body('gross_pay').isFloat({ min: 0 }).withMessage('Gross pay must be a positive number'),
  body('net_pay').isFloat({ min: 0 }).withMessage('Net pay must be a positive number')
];

const validateBenefit = [
  body('user_id').isInt().withMessage('User ID must be an integer'),
  body('benefit_type').isIn(['health_insurance', 'paid_time_off', 'employee_discount', 'training_allowance', 'performance_bonus'])
    .withMessage('Invalid benefit type'),
  body('benefit_name').isString().isLength({ min: 1, max: 100 }).withMessage('Benefit name must be 1-100 characters'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('value').optional().isFloat({ min: 0 }).withMessage('Value must be a positive number'),
  body('start_date').isISO8601().withMessage('Start date must be a valid date'),
  body('end_date').optional().isISO8601().withMessage('End date must be a valid date')
];

// Employee Salaries Routes
router.post('/salaries', validateSalary, PayrollController.createSalary);
router.get('/salaries/user/:userId',
  param('userId').isInt().withMessage('User ID must be an integer'),
  PayrollController.getSalaryByUser
);
router.get('/salaries', PayrollController.getAllSalaries);
router.put('/salaries/:salaryId',
  param('salaryId').isInt().withMessage('Salary ID must be an integer'),
  body('payment_type').optional().isIn(['hourly', 'fixed', 'commission', 'bonus'])
    .withMessage('Invalid payment type'),
  body('base_amount').optional().isFloat({ min: 0 }).withMessage('Base amount must be a positive number'),
  body('currency').optional().isString().isLength({ min: 3, max: 3 }).withMessage('Currency must be 3 characters'),
  body('end_date').optional().isISO8601().withMessage('End date must be a valid date'),
  PayrollController.updateSalary
);

// Payroll Records Routes
router.post('/records', validatePayrollRecord, PayrollController.createPayrollRecord);
router.get('/records/user/:userId',
  param('userId').isInt().withMessage('User ID must be an integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  PayrollController.getPayrollRecordsByUser
);
router.get('/records',
  query('status').optional().isIn(['draft', 'approved', 'paid']).withMessage('Invalid status'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  PayrollController.getAllPayrollRecords
);
router.put('/records/:recordId',
  param('recordId').isInt().withMessage('Record ID must be an integer'),
  body('status').isIn(['draft', 'approved', 'paid']).withMessage('Invalid status'),
  PayrollController.updatePayrollRecord
);
router.post('/calculate',
  body('userId').isInt().withMessage('User ID must be an integer'),
  body('payPeriodStart').isISO8601().withMessage('Pay period start must be a valid date'),
  body('payPeriodEnd').isISO8601().withMessage('Pay period end must be a valid date'),
  PayrollController.calculatePayroll
);

// Employee Benefits Routes
router.post('/benefits', validateBenefit, PayrollController.createBenefit);
router.get('/benefits/user/:userId',
  param('userId').isInt().withMessage('User ID must be an integer'),
  PayrollController.getBenefitsByUser
);
router.get('/benefits', PayrollController.getAllBenefits);
router.put('/benefits/:benefitId',
  param('benefitId').isInt().withMessage('Benefit ID must be an integer'),
  body('benefit_name').optional().isString().isLength({ min: 1, max: 100 }).withMessage('Benefit name must be 1-100 characters'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('value').optional().isFloat({ min: 0 }).withMessage('Value must be a positive number'),
  body('end_date').optional().isISO8601().withMessage('End date must be a valid date'),
  body('is_active').optional().isBoolean().withMessage('Is active must be a boolean'),
  PayrollController.updateBenefit
);
router.delete('/benefits/:benefitId',
  param('benefitId').isInt().withMessage('Benefit ID must be an integer'),
  PayrollController.deleteBenefit
);

// Payroll Analytics Routes
router.get('/analytics/summary',
  query('period').optional().isIn(['weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  PayrollController.getPayrollSummary
);
router.get('/analytics/department',
  query('period').optional().isIn(['weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  PayrollController.getPayrollByDepartment
);

module.exports = router;
