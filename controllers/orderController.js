const Order = require('../models/Order');
const { validationResult } = require('express-validator');

class OrderController {
  static async createOrder(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const order = await Order.create(req.body);

      res.status(201).json({
        status: 'success',
        message: 'Order created successfully',
        data: {
          order
        }
      });

    } catch (error) {
      console.error('Create order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getAllOrders(req, res) {
    try {
      const { status, type, employee_id, table_number } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (type) filters.type = type;
      if (employee_id) filters.employee_id = employee_id;
      if (table_number) filters.table_number = table_number;

      const orders = await Order.findAll(filters);
      
      console.log('Orders fetched:', orders.length);
      console.log('Sample order with items:', orders[0]);

      res.status(200).json({
        status: 'success',
        data: {
          orders,
          count: orders.length
        }
      });

    } catch (error) {
      console.error('Get orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getOrder(req, res) {
    try {
      const { id } = req.params;
      
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          order
        }
      });

    } catch (error) {
      console.error('Get order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async updateOrderStatus(req, res) {
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
      const { status, updated_by } = req.body;
      
      const updatedOrder = await Order.updateStatus(id, status, updated_by);
      if (!updatedOrder) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Order status updated successfully',
        data: {
          order: updatedOrder
        }
      });

    } catch (error) {
      console.error('Update order status error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getOrderStatusHistory(req, res) {
    try {
      const { id } = req.params;
      
      const statusHistory = await Order.getStatusHistory(id);

      res.status(200).json({
        status: 'success',
        data: {
          statusHistory
        }
      });

    } catch (error) {
      console.error('Get order status history error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getPendingOrders(req, res) {
    try {
      const { type } = req.query;
      
      const orders = await Order.getPendingOrders(type);

      res.status(200).json({
        status: 'success',
        data: {
          orders,
          count: orders.length
        }
      });

    } catch (error) {
      console.error('Get pending orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getReadyOrders(req, res) {
    try {
      const { type } = req.query;
      
      const orders = await Order.getReadyOrders(type);

      res.status(200).json({
        status: 'success',
        data: {
          orders,
          count: orders.length
        }
      });

    } catch (error) {
      console.error('Get ready orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  // Bakery specific endpoints
  static async createBakeryOrder(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const orderData = {
        ...req.body,
        type: 'bakery'
      };

      const order = await Order.create(orderData);

      res.status(201).json({
        status: 'success',
        message: 'Bakery order created successfully',
        data: {
          order
        }
      });

    } catch (error) {
      console.error('Create bakery order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  // Cafe specific endpoints
  static async createCafeOrder(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const orderData = {
        ...req.body,
        type: 'cafe'
      };

      const order = await Order.create(orderData);

      res.status(201).json({
        status: 'success',
        message: 'Cafe order created successfully',
        data: {
          order
        }
      });

    } catch (error) {
      console.error('Create cafe order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getKitchenOrders(req, res) {
    try {
      const orders = await Order.getKitchenOrders();

      res.status(200).json({
        status: 'success',
        data: {
          orders,
          count: orders.length
        }
      });

    } catch (error) {
      console.error('Get kitchen orders error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async markOrderReady(req, res) {
    try {
      const { id } = req.params;
      const { updated_by } = req.body;
      
      const updatedOrder = await Order.updateStatus(id, 'ready', updated_by);
      if (!updatedOrder) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      // If this was a mixed order, coordinate beverage and food completion
      await Order.markFoodItemsReady(id);

      res.status(200).json({
        status: 'success',
        message: 'Order marked as ready',
        data: {
          order: updatedOrder
        }
      });

    } catch (error) {
      console.error('Mark order ready error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async completeOrder(req, res) {
    try {
      const { id } = req.params;
      const { completed_by } = req.body;
      
      // Update order status to completed
      const updatedOrder = await Order.updateStatus(id, 'completed', completed_by);
      if (!updatedOrder) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      // Create a payment record for the cashier
      const Payment = require('../models/Payment');
      const paymentData = {
        order_id: id,
        amount: updatedOrder.total_amount,
        payment_method: 'cash', // Default to cash, cashier can change this
        status: 'pending'
      };

      const payment = await Payment.create(paymentData);

      res.status(200).json({
        status: 'success',
        message: 'Order completed and sent to cashier for payment',
        data: {
          order: updatedOrder,
          payment: payment
        }
      });

    } catch (error) {
      console.error('Complete order error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getOrdersForPayment(req, res) {
    try {
      // Get employee_id from query params if provided
      const { employee_id } = req.query;
      
      // Build filters
      const completedFilters = { status: 'completed' };
      const readyFilters = { status: 'ready' };
      
      if (employee_id) {
        completedFilters.employee_id = employee_id;
        readyFilters.employee_id = employee_id;
      }
      
      // Get completed and ready orders that need payment
      const completedOrders = await Order.findAll(completedFilters);
      const readyOrders = await Order.findAll(readyFilters);
      
      const orders = [...completedOrders, ...readyOrders]
        .slice()
        .sort((a, b) => {
          const ad = new Date(a?.created_at || a?.updated_at);
          const bd = new Date(b?.created_at || b?.updated_at);
          const at = Number.isNaN(ad.getTime()) ? null : ad.getTime();
          const bt = Number.isNaN(bd.getTime()) ? null : bd.getTime();
          if (at != null && bt != null) return bt - at;
          if (at != null) return -1;
          if (bt != null) return 1;
          const aid = a?.id != null ? parseInt(a.id, 10) : 0;
          const bid = b?.id != null ? parseInt(b.id, 10) : 0;
          return bid - aid;
        });

      res.status(200).json({
        status: 'success',
        data: {
          orders,
          count: orders.length
        }
      });

    } catch (error) {
      console.error('Get orders for payment error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async updateOrderItems(req, res) {
    try {
      const { id } = req.params;
      const { items, updated_by } = req.body;
      
      // Check if order exists and is still pending
      const order = await Order.findById(id);
      if (!order) {
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      if (order.status !== 'pending') {
        return res.status(400).json({
          status: 'error',
          message: 'Cannot edit items for orders that are not pending'
        });
      }

      const updatedOrder = await Order.updateOrderItems(id, items, updated_by);

      res.status(200).json({
        status: 'success',
        message: 'Order items updated successfully',
        data: {
          order: updatedOrder
        }
      });

    } catch (error) {
      console.error('Update order items error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async addOrderItems(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        console.log('Add items validation failed:', errors.array());
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const { id } = req.params;
      const { items, updated_by } = req.body;
      
      console.log(`Adding items to order ${id}:`, { items, updated_by });

      // Check if order exists
      const order = await Order.findById(id);
      if (!order) {
        console.log(`Order ${id} not found`);
        return res.status(404).json({
          status: 'error',
          message: 'Order not found'
        });
      }

      console.log(`Order ${id} current status: ${order.status}`);

      // Allow adding items to orders that are pending, preparing, or ready
      if (!['pending', 'preparing', 'ready'].includes(order.status)) {
        console.log(`Cannot add items to order ${id} with status: ${order.status}`);
        return res.status(400).json({
          status: 'error',
          message: 'Cannot add items to orders that are completed or cancelled'
        });
      }

      const updatedOrder = await Order.addOrderItems(id, items, updated_by);
      console.log(`Successfully added items to order ${id}`);

      res.status(200).json({
        status: 'success',
        message: 'Items added to order successfully',
        data: {
          order: updatedOrder
        }
      });

    } catch (error) {
      console.error('Add order items error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getOrdersByType(req, res) {
    try {
      const { orderType } = req.params;
      const orders = await Order.getOrdersByType(orderType);

      res.status(200).json({
        status: 'success',
        message: 'Orders retrieved successfully',
        data: {
          orders,
          count: orders.length
        }
      });

    } catch (error) {
      console.error('Get orders by type error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async markFoodReady(req, res) {
    try {
      const { id } = req.params;
      
      await Order.markFoodItemsReady(id);
      const order = await Order.findById(id);

      res.status(200).json({
        status: 'success',
        message: 'Food items marked as ready',
        data: {
          order
        }
      });

    } catch (error) {
      console.error('Mark food ready error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getOccupiedTables(req, res) {
    try {
      const occupiedTables = await Order.getOccupiedTables();

      res.status(200).json({
        status: 'success',
        message: 'Occupied tables retrieved successfully',
        data: {
          occupiedTables,
          count: occupiedTables.length
        }
      });

    } catch (error) {
      console.error('Get occupied tables error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

module.exports = OrderController;
