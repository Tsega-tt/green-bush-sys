const express = require('express');
const { body, param } = require('express-validator');
const OrderController = require('../controllers/orderController');

const router = express.Router();

// Validation middleware
const orderValidation = [
  body('employee_id')
    .isInt({ min: 1 })
    .withMessage('Employee ID must be a positive integer'),
  body('customer_id')
    .optional()
    .isUUID()
    .withMessage('Customer ID must be a valid UUID'),
  body('table_number')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Table number must be a positive integer'),
  body('type')
    .isIn(['bakery', 'cafe'])
    .withMessage('Type must be either bakery or cafe'),
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.menu_item_id')
    .isInt({ min: 1 })
    .withMessage('Menu item ID must be a positive integer'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a positive number'),
  body('items.*.subtotal')
    .isFloat({ min: 0 })
    .withMessage('Subtotal must be a positive number'),
  body('total_amount')
    .isFloat({ min: 0 })
    .withMessage('Total amount must be a positive number'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes must not exceed 500 characters')
];

const statusUpdateValidation = [
  body('status')
    .isIn(['pending', 'preparing', 'ready', 'completed', 'cancelled', 'paid'])
    .withMessage('Invalid status'),
  body('updated_by')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Updated by must be a positive integer')
];

const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

const markReadyValidation = [
  body('updated_by')
    .isInt({ min: 1 })
    .withMessage('Updated by must be a positive integer')
];

const addItemsValidation = [
  body('items')
    .isArray({ min: 1 })
    .withMessage('Items must be a non-empty array'),
  body('items.*.menu_item_id')
    .isInt({ min: 1 })
    .withMessage('Menu item ID must be a positive integer'),
  body('items.*.quantity')
    .isInt({ min: 1 })
    .withMessage('Quantity must be a positive integer'),
  body('items.*.unit_price')
    .isFloat({ min: 0 })
    .withMessage('Unit price must be a positive number'),
  body('items.*.subtotal')
    .isFloat({ min: 0 })
    .withMessage('Subtotal must be a positive number'),
  body('updated_by')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Updated by must be a positive integer')
];

// General order routes
router.post('/', orderValidation, OrderController.createOrder);
router.get('/', OrderController.getAllOrders);
router.get('/pending', OrderController.getPendingOrders);
router.get('/ready', OrderController.getReadyOrders);
router.get('/:id', idValidation, OrderController.getOrder);
router.put('/:id/status', [...idValidation, ...statusUpdateValidation], OrderController.updateOrderStatus);
router.put('/:id/items', idValidation, OrderController.updateOrderItems);
router.post('/:id/add-items', [...idValidation, ...addItemsValidation], OrderController.addOrderItems);
router.get('/:id/status-history', idValidation, OrderController.getOrderStatusHistory);
router.patch('/:id/ready', [...idValidation, ...markReadyValidation], OrderController.markOrderReady);
router.patch('/:id/complete', [...idValidation, ...markReadyValidation], OrderController.completeOrder);

// Bakery specific routes
router.post('/bakery', orderValidation, OrderController.createBakeryOrder);

// Cafe specific routes
router.post('/cafe', orderValidation, OrderController.createCafeOrder);
router.get('/kitchen/orders', OrderController.getKitchenOrders);
router.get('/tables/occupied', OrderController.getOccupiedTables);

// Smart order routing routes
router.get('/type/:orderType', OrderController.getOrdersByType);
router.patch('/:id/food-ready', [...idValidation, ...markReadyValidation], OrderController.markFoodReady);

// Payment workflow routes
router.get('/payment/pending', OrderController.getOrdersForPayment);

module.exports = router;
