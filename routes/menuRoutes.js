const express = require('express');
const { body, param } = require('express-validator');
const MenuController = require('../controllers/menuController');

const router = express.Router();

// Validation middleware
const menuItemValidation = [
  body('name')
    .notEmpty()
    .withMessage('Name is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('price')
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('category')
    .notEmpty()
    .withMessage('Category is required')
    .isLength({ min: 2, max: 50 })
    .withMessage('Category must be between 2 and 50 characters'),
  body('type')
    .isIn(['bakery', 'cafe'])
    .withMessage('Type must be either bakery or cafe'),
  body('is_available')
    .optional()
    .isBoolean()
    .withMessage('is_available must be a boolean'),
  body('image_url')
    .optional()
    .isURL()
    .withMessage('Image URL must be a valid URL')
];

const updateMenuItemValidation = [
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 })
    .withMessage('Name must be between 2 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description must not exceed 500 characters'),
  body('price')
    .optional()
    .isFloat({ min: 0 })
    .withMessage('Price must be a positive number'),
  body('category')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Category must be between 2 and 50 characters'),
  body('type')
    .optional()
    .isIn(['bakery', 'cafe'])
    .withMessage('Type must be either bakery or cafe'),
  body('is_available')
    .optional()
    .isBoolean()
    .withMessage('is_available must be a boolean'),
  body('image_url')
    .optional()
    .isURL()
    .withMessage('Image URL must be a valid URL')
];

const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

// Routes
router.post('/', menuItemValidation, MenuController.createMenuItem);
router.get('/', MenuController.getAllMenuItems);
router.get('/bakery', MenuController.getBakeryMenu);
router.get('/cafe', MenuController.getCafeMenu);
router.get('/:id', idValidation, MenuController.getMenuItem);
router.put('/:id', [...idValidation, ...updateMenuItemValidation], MenuController.updateMenuItem);
router.delete('/:id', idValidation, MenuController.deleteMenuItem);
router.patch('/:id/toggle-availability', idValidation, MenuController.toggleAvailability);

module.exports = router;
