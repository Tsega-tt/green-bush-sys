const HRAnalytics = require('../models/HRAnalytics');
const { validationResult } = require('express-validator');

class HRAnalyticsController {
  // Staff Analytics Controllers
  static async getEmployeeProductivity(req, res) {
    try {
      const { period, userId } = req.query;
      const productivity = await HRAnalytics.getEmployeeProductivity(period, userId);
      
      res.json({
        success: true,
        data: productivity
      });
    } catch (error) {
      console.error('Error fetching employee productivity:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch employee productivity data',
        error: error.message
      });
    }
  }

  static async getAttendancePatterns(req, res) {
    try {
      const { period, userId } = req.query;
      const attendancePatterns = await HRAnalytics.getAttendancePatterns(period, userId);
      
      res.json({
        success: true,
        data: attendancePatterns
      });
    } catch (error) {
      console.error('Error fetching attendance patterns:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch attendance patterns',
        error: error.message
      });
    }
  }

  static async getTurnoverRates(req, res) {
    try {
      const { period } = req.query;
      const turnoverRates = await HRAnalytics.getTurnoverRates(period);
      
      res.json({
        success: true,
        data: turnoverRates
      });
    } catch (error) {
      console.error('Error fetching turnover rates:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch turnover rates',
        error: error.message
      });
    }
  }

  static async getTrainingEffectiveness(req, res) {
    try {
      const trainingEffectiveness = await HRAnalytics.getTrainingEffectiveness();
      
      res.json({
        success: true,
        data: trainingEffectiveness
      });
    } catch (error) {
      console.error('Error fetching training effectiveness:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch training effectiveness data',
        error: error.message
      });
    }
  }

  static async getCustomerSatisfactionScores(req, res) {
    try {
      const { period, employeeId } = req.query;
      const satisfactionScores = await HRAnalytics.getCustomerSatisfactionScores(period, employeeId);
      
      res.json({
        success: true,
        data: satisfactionScores
      });
    } catch (error) {
      console.error('Error fetching customer satisfaction scores:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch customer satisfaction scores',
        error: error.message
      });
    }
  }

  // Reports Generation Controllers
  static async generateDailyAttendanceReport(req, res) {
    try {
      const { date } = req.query;
      const report = await HRAnalytics.generateDailyAttendanceReport(date);
      
      res.json({
        success: true,
        message: 'Daily attendance report generated successfully',
        data: {
          report_type: 'daily_attendance',
          report_date: date || new Date().toISOString().split('T')[0],
          data: report
        }
      });
    } catch (error) {
      console.error('Error generating daily attendance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate daily attendance report',
        error: error.message
      });
    }
  }

  static async generateWeeklyPerformanceReport(req, res) {
    try {
      const { startDate } = req.query;
      const report = await HRAnalytics.generateWeeklyPerformanceReport(startDate);
      
      const weekStart = startDate || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const weekEnd = new Date(new Date(weekStart).getTime() + 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      res.json({
        success: true,
        message: 'Weekly performance report generated successfully',
        data: {
          report_type: 'weekly_performance',
          week_start: weekStart,
          week_end: weekEnd,
          data: report
        }
      });
    } catch (error) {
      console.error('Error generating weekly performance report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate weekly performance report',
        error: error.message
      });
    }
  }

  static async generateMonthlyPayrollReport(req, res) {
    try {
      const { month, year } = req.query;
      const report = await HRAnalytics.generateMonthlyPayrollReport(month, year);
      
      const currentDate = new Date();
      const targetMonth = month || currentDate.getMonth() + 1;
      const targetYear = year || currentDate.getFullYear();
      
      res.json({
        success: true,
        message: 'Monthly payroll report generated successfully',
        data: {
          report_type: 'monthly_payroll',
          month: targetMonth,
          year: targetYear,
          data: report
        }
      });
    } catch (error) {
      console.error('Error generating monthly payroll report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate monthly payroll report',
        error: error.message
      });
    }
  }

  static async generateQuarterlyReviewReport(req, res) {
    try {
      const { quarter, year } = req.query;
      const report = await HRAnalytics.generateQuarterlyReviewReport(quarter, year);
      
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetQuarter = quarter || Math.ceil((currentDate.getMonth() + 1) / 3);
      
      res.json({
        success: true,
        message: 'Quarterly review report generated successfully',
        data: {
          report_type: 'quarterly_review',
          quarter: targetQuarter,
          year: targetYear,
          data: report
        }
      });
    } catch (error) {
      console.error('Error generating quarterly review report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate quarterly review report',
        error: error.message
      });
    }
  }

  static async generateAnnualAssessmentReport(req, res) {
    try {
      const { year } = req.query;
      const report = await HRAnalytics.generateAnnualAssessmentReport(year);
      
      const targetYear = year || new Date().getFullYear();
      
      res.json({
        success: true,
        message: 'Annual assessment report generated successfully',
        data: {
          report_type: 'annual_assessment',
          year: targetYear,
          data: report
        }
      });
    } catch (error) {
      console.error('Error generating annual assessment report:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate annual assessment report',
        error: error.message
      });
    }
  }

  // Dashboard Analytics Controller
  static async getHRDashboardData(req, res) {
    try {
      const { period } = req.query || 'monthly';

      // Fetch multiple analytics in parallel for dashboard
      const [
        productivity,
        attendancePatterns,
        turnoverRates,
        trainingEffectiveness,
        satisfactionScores
      ] = await Promise.all([
        HRAnalytics.getEmployeeProductivity(period),
        HRAnalytics.getAttendancePatterns(period),
        HRAnalytics.getTurnoverRates(period),
        HRAnalytics.getTrainingEffectiveness(),
        HRAnalytics.getCustomerSatisfactionScores(period)
      ]);

      // Calculate summary statistics
      const totalEmployees = productivity.length;
      const avgProductivity = productivity.reduce((sum, emp) => sum + (emp.total_orders || 0), 0) / totalEmployees || 0;
      const avgAttendanceRate = attendancePatterns.reduce((sum, emp) => sum + (emp.punctuality_rate || 0), 0) / totalEmployees || 0;
      const avgSatisfactionRate = satisfactionScores.reduce((sum, emp) => sum + (emp.satisfaction_rate || 0), 0) / satisfactionScores.length || 0;

      res.json({
        success: true,
        data: {
          summary: {
            total_employees: totalEmployees,
            average_productivity: Math.round(avgProductivity * 100) / 100,
            average_attendance_rate: Math.round(avgAttendanceRate * 100) / 100,
            average_satisfaction_rate: Math.round(avgSatisfactionRate * 100) / 100,
            period: period
          },
          productivity,
          attendance_patterns: attendancePatterns,
          turnover_rates: turnoverRates,
          training_effectiveness: trainingEffectiveness,
          satisfaction_scores: satisfactionScores
        }
      });
    } catch (error) {
      console.error('Error fetching HR dashboard data:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch HR dashboard data',
        error: error.message
      });
    }
  }

  // Cache Management Controllers
  static async cacheAnalytics(req, res) {
    try {
      const { metricName, metricValue, periodType, periodDate } = req.body;

      if (!metricName || !metricValue || !periodType || !periodDate) {
        return res.status(400).json({
          success: false,
          message: 'Metric name, value, period type, and period date are required'
        });
      }

      const cachedData = await HRAnalytics.cacheAnalytics(metricName, metricValue, periodType, periodDate);
      
      res.json({
        success: true,
        message: 'Analytics cached successfully',
        data: cachedData
      });
    } catch (error) {
      console.error('Error caching analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to cache analytics',
        error: error.message
      });
    }
  }

  static async getCachedAnalytics(req, res) {
    try {
      const { metricName, periodType, periodDate } = req.query;

      if (!metricName || !periodType || !periodDate) {
        return res.status(400).json({
          success: false,
          message: 'Metric name, period type, and period date are required'
        });
      }

      const cachedData = await HRAnalytics.getCachedAnalytics(metricName, periodType, periodDate);
      
      if (!cachedData) {
        return res.status(404).json({
          success: false,
          message: 'No cached data found for the specified parameters'
        });
      }

      res.json({
        success: true,
        data: cachedData
      });
    } catch (error) {
      console.error('Error fetching cached analytics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch cached analytics',
        error: error.message
      });
    }
  }
}

module.exports = HRAnalyticsController;
