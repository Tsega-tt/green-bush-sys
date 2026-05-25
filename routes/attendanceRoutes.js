const express = require('express');
const { body, param } = require('express-validator');
const AttendanceController = require('../controllers/attendanceController');

const router = express.Router();

// Validation middleware
const clockValidation = [
  body('user_id')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer')
];

const userIdValidation = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('User ID must be a positive integer')
];

// Routes
router.post('/clock-in', clockValidation, AttendanceController.clockIn);
router.post('/clock-out', clockValidation, AttendanceController.clockOut);
router.get('/', AttendanceController.getAllAttendance);
router.get('/today', AttendanceController.getTodayAttendance);
router.get('/weekly-report', AttendanceController.getWeeklyReport);
router.get('/summary', AttendanceController.getAttendanceSummary);
router.get('/user/:userId', userIdValidation, AttendanceController.getUserAttendance);
router.get('/user/:userId/status', userIdValidation, AttendanceController.getCurrentStatus);

module.exports = router;
