const express = require('express');
const router = express.Router();
const PerformanceController = require('../controllers/performanceController');
const { body, param, query } = require('express-validator');

// Validation middleware
const validateMetric = [
  body('user_id').isInt().withMessage('User ID must be an integer'),
  body('metric_type').isIn(['punctuality', 'customer_feedback', 'task_completion', 'quality', 'teamwork'])
    .withMessage('Invalid metric type'),
  body('score').isFloat({ min: 0, max: 5 }).withMessage('Score must be between 0 and 5'),
  body('period_start').isISO8601().withMessage('Period start must be a valid date'),
  body('period_end').isISO8601().withMessage('Period end must be a valid date'),
  body('notes').optional().isString().withMessage('Notes must be a string')
];

const validateReview = [
  body('user_id').isInt().withMessage('User ID must be an integer'),
  body('review_type').isIn(['weekly', 'monthly', 'quarterly', 'annual'])
    .withMessage('Invalid review type'),
  body('review_date').isISO8601().withMessage('Review date must be a valid date'),
  body('overall_score').optional().isFloat({ min: 0, max: 5 }).withMessage('Overall score must be between 0 and 5'),
  body('strengths').optional().isString().withMessage('Strengths must be a string'),
  body('areas_for_improvement').optional().isString().withMessage('Areas for improvement must be a string'),
  body('goals').optional().isString().withMessage('Goals must be a string'),
  body('action_items').optional().isString().withMessage('Action items must be a string')
];

const validateGoal = [
  body('user_id').isInt().withMessage('User ID must be an integer'),
  body('title').isString().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('target_date').optional().isISO8601().withMessage('Target date must be a valid date')
];

// Performance Metrics Routes
router.post('/metrics', validateMetric, PerformanceController.createMetric);
router.get('/metrics/user/:userId', 
  param('userId').isInt().withMessage('User ID must be an integer'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid'),
  PerformanceController.getMetricsByUser
);
router.get('/metrics/type/:metricType',
  param('metricType').isIn(['punctuality', 'customer_feedback', 'task_completion', 'quality', 'teamwork'])
    .withMessage('Invalid metric type'),
  query('startDate').optional().isISO8601().withMessage('Start date must be valid'),
  query('endDate').optional().isISO8601().withMessage('End date must be valid'),
  PerformanceController.getMetricsByType
);
router.put('/metrics/:metricId',
  param('metricId').isInt().withMessage('Metric ID must be an integer'),
  body('score').isFloat({ min: 0, max: 5 }).withMessage('Score must be between 0 and 5'),
  body('notes').optional().isString().withMessage('Notes must be a string'),
  PerformanceController.updateMetric
);

// Performance Reviews Routes
router.post('/reviews', validateReview, PerformanceController.createReview);
router.get('/reviews/user/:userId',
  param('userId').isInt().withMessage('User ID must be an integer'),
  PerformanceController.getReviewsByUser
);
router.get('/reviews/:reviewId',
  param('reviewId').isInt().withMessage('Review ID must be an integer'),
  PerformanceController.getReviewById
);
router.put('/reviews/:reviewId',
  param('reviewId').isInt().withMessage('Review ID must be an integer'),
  body('overall_score').optional().isFloat({ min: 0, max: 5 }).withMessage('Overall score must be between 0 and 5'),
  body('strengths').optional().isString().withMessage('Strengths must be a string'),
  body('areas_for_improvement').optional().isString().withMessage('Areas for improvement must be a string'),
  body('goals').optional().isString().withMessage('Goals must be a string'),
  body('action_items').optional().isString().withMessage('Action items must be a string'),
  body('status').optional().isIn(['draft', 'completed', 'approved']).withMessage('Invalid status'),
  PerformanceController.updateReview
);
router.get('/reviews/upcoming/all', PerformanceController.getUpcomingReviews);

// Employee Goals Routes
router.post('/goals', validateGoal, PerformanceController.createGoal);
router.get('/goals/user/:userId',
  param('userId').isInt().withMessage('User ID must be an integer'),
  PerformanceController.getGoalsByUser
);
router.put('/goals/:goalId',
  param('goalId').isInt().withMessage('Goal ID must be an integer'),
  body('title').optional().isString().isLength({ min: 1, max: 200 }).withMessage('Title must be 1-200 characters'),
  body('description').optional().isString().withMessage('Description must be a string'),
  body('target_date').optional().isISO8601().withMessage('Target date must be a valid date'),
  body('status').optional().isIn(['active', 'completed', 'cancelled', 'overdue']).withMessage('Invalid status'),
  body('progress').optional().isInt({ min: 0, max: 100 }).withMessage('Progress must be between 0 and 100'),
  PerformanceController.updateGoal
);
router.delete('/goals/:goalId',
  param('goalId').isInt().withMessage('Goal ID must be an integer'),
  PerformanceController.deleteGoal
);

// Analytics Routes
router.get('/analytics/overview',
  query('userId').optional().isInt().withMessage('User ID must be an integer'),
  query('period').optional().isIn(['weekly', 'monthly', 'quarterly', 'annual']).withMessage('Invalid period'),
  PerformanceController.getPerformanceOverview
);
router.get('/analytics/top-performers',
  query('metricType').optional().isIn(['punctuality', 'customer_feedback', 'task_completion', 'quality', 'teamwork'])
    .withMessage('Invalid metric type'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  PerformanceController.getTopPerformers
);

module.exports = router;
