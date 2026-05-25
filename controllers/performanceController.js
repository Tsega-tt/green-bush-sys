const Performance = require('../models/Performance');
const { validationResult } = require('express-validator');

class PerformanceController {
  // Performance Metrics Controllers
  static async createMetric(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const metricData = {
        ...req.body,
        recorded_by: req.user?.id || 1 // Default to admin if no user context
      };

      const metric = await Performance.createMetric(metricData);
      res.status(201).json({
        success: true,
        message: 'Performance metric created successfully',
        data: metric
      });
    } catch (error) {
      console.error('Error creating performance metric:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create performance metric',
        error: error.message
      });
    }
  }

  static async getMetricsByUser(req, res) {
    try {
      const { userId } = req.params;
      const { startDate, endDate } = req.query;

      const metrics = await Performance.getMetricsByUser(userId, startDate, endDate);
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error fetching user metrics:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance metrics',
        error: error.message
      });
    }
  }

  static async getMetricsByType(req, res) {
    try {
      const { metricType } = req.params;
      const { startDate, endDate } = req.query;

      const metrics = await Performance.getMetricsByType(metricType, startDate, endDate);
      res.json({
        success: true,
        data: metrics
      });
    } catch (error) {
      console.error('Error fetching metrics by type:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance metrics',
        error: error.message
      });
    }
  }

  static async updateMetric(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { metricId } = req.params;
      const metric = await Performance.updateMetric(metricId, req.body);

      if (!metric) {
        return res.status(404).json({
          success: false,
          message: 'Performance metric not found'
        });
      }

      res.json({
        success: true,
        message: 'Performance metric updated successfully',
        data: metric
      });
    } catch (error) {
      console.error('Error updating performance metric:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update performance metric',
        error: error.message
      });
    }
  }

  // Performance Reviews Controllers
  static async createReview(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const reviewData = {
        ...req.body,
        reviewer_id: req.user?.id || 1 // Default to admin if no user context
      };

      const review = await Performance.createReview(reviewData);
      res.status(201).json({
        success: true,
        message: 'Performance review created successfully',
        data: review
      });
    } catch (error) {
      console.error('Error creating performance review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create performance review',
        error: error.message
      });
    }
  }

  static async getReviewsByUser(req, res) {
    try {
      const { userId } = req.params;
      const reviews = await Performance.getReviewsByUser(userId);
      
      res.json({
        success: true,
        data: reviews
      });
    } catch (error) {
      console.error('Error fetching user reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance reviews',
        error: error.message
      });
    }
  }

  static async getReviewById(req, res) {
    try {
      const { reviewId } = req.params;
      const review = await Performance.getReviewById(reviewId);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Performance review not found'
        });
      }

      res.json({
        success: true,
        data: review
      });
    } catch (error) {
      console.error('Error fetching review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance review',
        error: error.message
      });
    }
  }

  static async updateReview(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { reviewId } = req.params;
      const review = await Performance.updateReview(reviewId, req.body);

      if (!review) {
        return res.status(404).json({
          success: false,
          message: 'Performance review not found'
        });
      }

      res.json({
        success: true,
        message: 'Performance review updated successfully',
        data: review
      });
    } catch (error) {
      console.error('Error updating performance review:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update performance review',
        error: error.message
      });
    }
  }

  static async getUpcomingReviews(req, res) {
    try {
      const upcomingReviews = await Performance.getUpcomingReviews();
      res.json({
        success: true,
        data: upcomingReviews
      });
    } catch (error) {
      console.error('Error fetching upcoming reviews:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch upcoming reviews',
        error: error.message
      });
    }
  }

  // Employee Goals Controllers
  static async createGoal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const goalData = {
        ...req.body,
        set_by: req.user?.id || 1 // Default to admin if no user context
      };

      const goal = await Performance.createGoal(goalData);
      res.status(201).json({
        success: true,
        message: 'Employee goal created successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error creating employee goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create employee goal',
        error: error.message
      });
    }
  }

  static async getGoalsByUser(req, res) {
    try {
      const { userId } = req.params;
      const goals = await Performance.getGoalsByUser(userId);
      
      res.json({
        success: true,
        data: goals
      });
    } catch (error) {
      console.error('Error fetching user goals:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch employee goals',
        error: error.message
      });
    }
  }

  static async updateGoal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { goalId } = req.params;
      const goal = await Performance.updateGoal(goalId, req.body);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Employee goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Employee goal updated successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error updating employee goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update employee goal',
        error: error.message
      });
    }
  }

  static async deleteGoal(req, res) {
    try {
      const { goalId } = req.params;
      const goal = await Performance.deleteGoal(goalId);

      if (!goal) {
        return res.status(404).json({
          success: false,
          message: 'Employee goal not found'
        });
      }

      res.json({
        success: true,
        message: 'Employee goal deleted successfully',
        data: goal
      });
    } catch (error) {
      console.error('Error deleting employee goal:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete employee goal',
        error: error.message
      });
    }
  }

  // Analytics Controllers
  static async getPerformanceOverview(req, res) {
    try {
      const { userId, period } = req.query;
      const overview = await Performance.getPerformanceOverview(userId, period);
      
      res.json({
        success: true,
        data: overview
      });
    } catch (error) {
      console.error('Error fetching performance overview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch performance overview',
        error: error.message
      });
    }
  }

  static async getTopPerformers(req, res) {
    try {
      const { metricType, limit } = req.query;
      const topPerformers = await Performance.getTopPerformers(metricType, limit);
      
      res.json({
        success: true,
        data: topPerformers
      });
    } catch (error) {
      console.error('Error fetching top performers:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch top performers',
        error: error.message
      });
    }
  }
}

module.exports = PerformanceController;
