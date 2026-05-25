const Attendance = require('../models/Attendance');
const { validationResult } = require('express-validator');

class AttendanceController {
  static async clockIn(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { user_id } = req.body;

      const attendance = await Attendance.clockIn(user_id);

      res.status(201).json({
        status: 'success',
        message: 'Clocked in successfully',
        data: {
          attendance
        }
      });

    } catch (error) {
      console.error('Clock in error:', error);
      
      if (error.message === 'User is already clocked in') {
        return res.status(409).json({
          status: 'error',
          message: error.message
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async clockOut(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { user_id } = req.body;

      const attendance = await Attendance.clockOut(user_id);

      res.status(200).json({
        status: 'success',
        message: 'Clocked out successfully',
        data: {
          attendance
        }
      });

    } catch (error) {
      console.error('Clock out error:', error);
      
      if (error.message === 'No active clock-in record found') {
        return res.status(404).json({
          status: 'error',
          message: error.message
        });
      }

      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getUserAttendance(req, res) {
    try {
      const { userId } = req.params;
      const { date_from, date_to } = req.query;
      
      const filters = {};
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;

      const attendance = await Attendance.getUserAttendance(userId, filters);

      res.status(200).json({
        status: 'success',
        data: {
          attendance,
          count: attendance.length
        }
      });

    } catch (error) {
      console.error('Get user attendance error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getAllAttendance(req, res) {
    try {
      const { user_id, date_from, date_to, role } = req.query;
      
      const filters = {};
      if (user_id) filters.user_id = user_id;
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;
      if (role) filters.role = role;

      const attendance = await Attendance.getAllAttendance(filters);

      res.status(200).json({
        status: 'success',
        data: {
          attendance,
          count: attendance.length
        }
      });

    } catch (error) {
      console.error('Get all attendance error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getWeeklyReport(req, res) {
    try {
      const { user_id, week_start } = req.query;
      
      const report = await Attendance.getWeeklyReport(user_id, week_start);

      res.status(200).json({
        status: 'success',
        data: {
          report,
          count: report.length
        }
      });

    } catch (error) {
      console.error('Get weekly report error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getCurrentStatus(req, res) {
    try {
      const { userId } = req.params;
      
      const status = await Attendance.getCurrentStatus(userId);

      res.status(200).json({
        status: 'success',
        data: {
          currentStatus: status,
          isActive: !!status
        }
      });

    } catch (error) {
      console.error('Get current status error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getTodayAttendance(req, res) {
    try {
      const attendance = await Attendance.getTodayAttendance();

      res.status(200).json({
        status: 'success',
        data: {
          attendance,
          count: attendance.length
        }
      });

    } catch (error) {
      console.error('Get today attendance error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getAttendanceSummary(req, res) {
    try {
      const { date_from, date_to } = req.query;
      
      const filters = {};
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;

      const attendance = await Attendance.getAllAttendance(filters);
      
      // Calculate summary statistics
      const summary = {
        total_records: attendance.length,
        total_hours: attendance.reduce((sum, record) => sum + (record.hours_worked || 0), 0),
        unique_employees: new Set(attendance.map(record => record.user_id)).size,
        average_hours_per_day: 0,
        by_role: {}
      };

      // Calculate average hours per day
      if (attendance.length > 0) {
        const uniqueDays = new Set(attendance.map(record => record.date)).size;
        summary.average_hours_per_day = summary.total_hours / uniqueDays;
      }

      // Group by role
      attendance.forEach(record => {
        if (!summary.by_role[record.role]) {
          summary.by_role[record.role] = {
            count: 0,
            total_hours: 0,
            employees: new Set()
          };
        }
        summary.by_role[record.role].count++;
        summary.by_role[record.role].total_hours += record.hours_worked || 0;
        summary.by_role[record.role].employees.add(record.user_id);
      });

      // Convert Sets to counts
      Object.keys(summary.by_role).forEach(role => {
        summary.by_role[role].unique_employees = summary.by_role[role].employees.size;
        delete summary.by_role[role].employees;
      });

      res.status(200).json({
        status: 'success',
        data: {
          summary,
          attendance
        }
      });

    } catch (error) {
      console.error('Get attendance summary error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

module.exports = AttendanceController;
