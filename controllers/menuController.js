const Menu = require('../models/Menu');
const { validationResult } = require('express-validator');

class MenuController {
  static async createMenuItem(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const menuItem = await Menu.create(req.body);

      res.status(201).json({
        status: 'success',
        message: 'Menu item created successfully',
        data: {
          menuItem
        }
      });

    } catch (error) {
      console.error('Create menu item error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getAllMenuItems(req, res) {
    try {
      const { type, category, is_available } = req.query;
      
      const filters = {};
      if (type) filters.type = type;
      if (category) filters.category = category;
      if (is_available !== undefined) filters.is_available = is_available === 'true';

      const menuItems = await Menu.findAll(filters);

      res.status(200).json({
        status: 'success',
        data: {
          menuItems,
          count: menuItems.length
        }
      });

    } catch (error) {
      console.error('Get menu items error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getMenuItem(req, res) {
    try {
      const { id } = req.params;
      
      const menuItem = await Menu.findById(id);
      if (!menuItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Menu item not found'
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          menuItem
        }
      });

    } catch (error) {
      console.error('Get menu item error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async updateMenuItem(req, res) {
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
      
      const updatedMenuItem = await Menu.update(id, req.body);
      if (!updatedMenuItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Menu item not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Menu item updated successfully',
        data: {
          menuItem: updatedMenuItem
        }
      });

    } catch (error) {
      console.error('Update menu item error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async deleteMenuItem(req, res) {
    try {
      const { id } = req.params;
      
      const deletedMenuItem = await Menu.delete(id);
      if (!deletedMenuItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Menu item not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Menu item deleted successfully'
      });

    } catch (error) {
      console.error('Delete menu item error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getBakeryMenu(req, res) {
    try {
      const menuItems = await Menu.getBakeryMenu();

      res.status(200).json({
        status: 'success',
        data: {
          menuItems,
          count: menuItems.length
        }
      });

    } catch (error) {
      console.error('Get bakery menu error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getCafeMenu(req, res) {
    try {
      const menuItems = await Menu.getCafeMenu();

      res.status(200).json({
        status: 'success',
        data: {
          menuItems,
          count: menuItems.length
        }
      });

    } catch (error) {
      console.error('Get cafe menu error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async toggleAvailability(req, res) {
    try {
      const { id } = req.params;
      
      const menuItem = await Menu.findById(id);
      if (!menuItem) {
        return res.status(404).json({
          status: 'error',
          message: 'Menu item not found'
        });
      }

      const updatedMenuItem = await Menu.update(id, {
        is_available: !menuItem.is_available
      });

      res.status(200).json({
        status: 'success',
        message: `Menu item ${updatedMenuItem.is_available ? 'enabled' : 'disabled'} successfully`,
        data: {
          menuItem: updatedMenuItem
        }
      });

    } catch (error) {
      console.error('Toggle availability error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

module.exports = MenuController;
