const User = require('../models/User');
const { validationResult } = require('express-validator');

class UserController {
  static async getAllUsers(req, res) {
    try {
      const { role, is_active } = req.query;
      
      const filters = {};
      if (role) filters.role = role;
      if (is_active !== undefined) filters.is_active = is_active === 'true';

      const users = await User.findAll(filters);

      res.status(200).json({
        status: 'success',
        data: {
          users,
          count: users.length
        }
      });

    } catch (error) {
      console.error('Get users error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getUser(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          user
        }
      });

    } catch (error) {
      console.error('Get user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async createUser(req, res) {
    try {
      console.log('Create user request body:', req.body);
      
      // Clean up empty strings to undefined for proper validation
      const cleanedBody = { ...req.body };
      if (cleanedBody.password === '') cleanedBody.password = undefined;
      if (cleanedBody.pin === '') cleanedBody.pin = undefined;
      
      // Update req.body for validation
      req.body = cleanedBody;
      
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Validation errors:', errors.array());
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { username, email, password, pin } = cleanedBody;

      // Validate that either password or PIN is provided, but not both
      if (!password && !pin) {
        return res.status(400).json({
          status: 'error',
          message: 'Either password or PIN must be provided'
        });
      }

      if (password && pin) {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot provide both password and PIN. Choose one authentication method.'
        });
      }

      // Check if username already exists
      const existingUser = await User.findByUsername(username);
      if (existingUser) {
        return res.status(409).json({
          status: 'error',
          message: 'Username already exists'
        });
      }

      // Check if email already exists (only when an email was provided)
      if (email) {
        const existingEmail = await User.findByEmail(email);
        if (existingEmail) {
          return res.status(409).json({
            status: 'error',
            message: 'Email already exists'
          });
        }
      }

      const newUser = await User.create(req.body);

      res.status(201).json({
        status: 'success',
        message: 'User created successfully',
        data: {
          user: newUser
        }
      });

    } catch (error) {
      console.error('Create user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async updateUser(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const updateData = req.body;

      // Remove id from update data
      delete updateData.id;

      const updatedUser = await User.update(id, updateData);
      if (!updatedUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'User updated successfully',
        data: {
          user: updatedUser
        }
      });

    } catch (error) {
      console.error('Update user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      
      const deletedUser = await User.delete(id);
      if (!deletedUser) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'User deleted successfully'
      });

    } catch (error) {
      console.error('Delete user error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async toggleUserStatus(req, res) {
    try {
      const { id } = req.params;
      
      const user = await User.findById(id);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found'
        });
      }

      const updatedUser = await User.update(id, {
        is_active: !user.is_active
      });

      res.status(200).json({
        status: 'success',
        message: `User ${updatedUser.is_active ? 'activated' : 'deactivated'} successfully`,
        data: {
          user: updatedUser
        }
      });

    } catch (error) {
      console.error('Toggle user status error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getUsersByRole(req, res) {
    try {
      const { role } = req.params;
      
      const users = await User.findAll({ role });

      res.status(200).json({
        status: 'success',
        data: {
          users,
          count: users.length,
          role
        }
      });

    } catch (error) {
      console.error('Get users by role error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getEmployees(req, res) {
    try {
      const employees = await User.findAll({ 
        role: 'bakery_employee',
        is_active: true 
      });

      res.status(200).json({
        status: 'success',
        data: {
          employees,
          count: employees.length
        }
      });

    } catch (error) {
      console.error('Get employees error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getWaiters(req, res) {
    try {
      const waiters = await User.findAll({ 
        role: 'cafe_waiter',
        is_active: true 
      });

      res.status(200).json({
        status: 'success',
        data: {
          waiters,
          count: waiters.length
        }
      });

    } catch (error) {
      console.error('Get waiters error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getKitchenStaff(req, res) {
    try {
      const kitchenStaff = await User.findAll({ 
        role: 'kitchen_staff',
        is_active: true 
      });

      res.status(200).json({
        status: 'success',
        data: {
          kitchenStaff,
          count: kitchenStaff.length
        }
      });

    } catch (error) {
      console.error('Get kitchen staff error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getCashiers(req, res) {
    try {
      const cashiers = await User.findAll({ 
        role: 'cashier',
        is_active: true 
      });

      res.status(200).json({
        status: 'success',
        data: {
          cashiers,
          count: cashiers.length
        }
      });

    } catch (error) {
      console.error('Get cashiers error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

module.exports = UserController;
