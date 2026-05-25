const express = require('express');
const router = express.Router();
const HRAnalyticsController = require('../controllers/hrAnalyticsController');
const { query } = require('express-validator');

// Staff Analytics Routes
router.get('/productivity',
  query('period').optional().isIn(['daily', 'weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  query('userId').optional().isInt().withMessage('User ID must be an integer'),
  HRAnalyticsController.getEmployeeProductivity
);

router.get('/attendance-patterns',
  query('period').optional().isIn(['weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  query('userId').optional().isInt().withMessage('User ID must be an integer'),
  HRAnalyticsController.getAttendancePatterns
);

router.get('/turnover-rates',
  query('period').optional().isIn(['quarterly', 'annual']).withMessage('Invalid period'),
  HRAnalyticsController.getTurnoverRates
);

router.get('/training-effectiveness',
  HRAnalyticsController.getTrainingEffectiveness
);

router.get('/customer-satisfaction',
  query('period').optional().isIn(['weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  query('employeeId').optional().isInt().withMessage('Employee ID must be an integer'),
  HRAnalyticsController.getCustomerSatisfactionScores
);

// Reports Generation Routes
router.get('/reports/daily-attendance',
  query('date').optional().isISO8601().withMessage('Date must be a valid date'),
  HRAnalyticsController.generateDailyAttendanceReport
);

router.get('/reports/weekly-performance',
  query('startDate').optional().isISO8601().withMessage('Start date must be a valid date'),
  HRAnalyticsController.generateWeeklyPerformanceReport
);

router.get('/reports/monthly-payroll',
  query('month').optional().isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  query('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  HRAnalyticsController.generateMonthlyPayrollReport
);

router.get('/reports/quarterly-review',
  query('quarter').optional().isInt({ min: 1, max: 4 }).withMessage('Quarter must be between 1 and 4'),
  query('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  HRAnalyticsController.generateQuarterlyReviewReport
);

router.get('/reports/annual-assessment',
  query('year').optional().isInt({ min: 2020, max: 2030 }).withMessage('Year must be between 2020 and 2030'),
  HRAnalyticsController.generateAnnualAssessmentReport
);

// Dashboard Analytics Route
router.get('/dashboard',
  query('period').optional().isIn(['weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  HRAnalyticsController.getHRDashboardData
);

// Cache Management Routes
router.post('/cache',
  HRAnalyticsController.cacheAnalytics
);

router.get('/cache',
  query('metricName').isString().withMessage('Metric name is required'),
  query('periodType').isIn(['daily', 'weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period type'),
  query('periodDate').isISO8601().withMessage('Period date must be a valid date'),
  HRAnalyticsController.getCachedAnalytics
);

module.exports = router;
