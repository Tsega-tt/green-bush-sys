const express = require('express');
const { body, param } = require('express-validator');
const UserController = require('../controllers/userController');

const router = express.Router();

// Validation middleware
const userValidation = [
  body('username')
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .optional({ checkFalsy: true })
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('password')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (value && value.length > 0) {
        if (value.length < 6) {
          throw new Error('Password must be at least 6 characters long');
        }
        if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(value)) {
          throw new Error('Password must contain at least one lowercase letter, one uppercase letter, and one number');
        }
      }
      return true;
    }),
  body('pin')
    .optional({ checkFalsy: true })
    .custom((value) => {
      if (value && value.length > 0) {
        if (!/^\d{4}$/.test(value)) {
          throw new Error('PIN must be exactly 4 digits');
        }
      }
      return true;
    }),
  body('role')
    .isIn(['admin', 'owner', 'hr_admin', 'store_admin', 'store_manager', 'fnb_manager', 'purchaser', 'bakery_employee', 'cafe_waiter', 'cashier', 'kitchen_staff', 'item_request'])
    .withMessage('Invalid role specified'),
  body('full_name')
    .notEmpty()
    .withMessage('Full name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters')
];

const updateUserValidation = [
  body('username')
    .optional()
    .isLength({ min: 3, max: 50 })
    .withMessage('Username must be between 3 and 50 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),
  body('role')
    .optional()
    .isIn(['admin', 'owner', 'hr_admin', 'store_admin', 'store_manager', 'fnb_manager', 'purchaser', 'bakery_employee', 'cafe_waiter', 'cashier', 'kitchen_staff', 'item_request'])
    .withMessage('Invalid role specified'),
  body('full_name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Full name must be between 2 and 100 characters'),
  body('is_active')
    .optional()
    .isBoolean()
    .withMessage('is_active must be a boolean')
];

const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

const roleValidation = [
  param('role')
    .isIn(['admin', 'bakery_employee', 'cafe_waiter', 'cashier', 'kitchen_staff'])
    .withMessage('Invalid role specified')
];

// Routes
router.get('/', UserController.getAllUsers);
router.post('/', userValidation, UserController.createUser);
router.get('/employees', UserController.getEmployees);
router.get('/waiters', UserController.getWaiters);
router.get('/kitchen-staff', UserController.getKitchenStaff);
router.get('/cashiers', UserController.getCashiers);
router.get('/role/:role', roleValidation, UserController.getUsersByRole);
router.get('/:id', idValidation, UserController.getUser);
router.put('/:id', [...idValidation, ...updateUserValidation], UserController.updateUser);
router.delete('/:id', idValidation, UserController.deleteUser);
router.patch('/:id/toggle-status', idValidation, UserController.toggleUserStatus);

module.exports = router;
