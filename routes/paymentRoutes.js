const express = require('express');
const { body, param } = require('express-validator');
const PaymentController = require('../controllers/paymentController');

const router = express.Router();

// Validation middleware
const paymentValidation = [
  body('order_id')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Order ID must be a positive integer'),
  body('amount')
    .isFloat({ min: 0 })
    .withMessage('Amount must be a positive number'),
  body('payment_method')
    .isIn(['cash', 'card', 'qr_code', 'mobile_payment'])
    .withMessage('Invalid payment method'),
  body('processed_by')
    .isInt({ min: 1 })
    .withMessage('Processed by must be a positive integer')
];

const statusUpdateValidation = [
  body('status')
    .isIn(['pending', 'paid', 'failed', 'refunded', 'deleted'])
    .withMessage('Invalid payment status'),
  body('processed_by')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Processed by must be a positive integer')
];

const confirmPaymentValidation = [
  body('processed_by')
    .isInt({ min: 1 })
    .withMessage('Processed by must be a positive integer')
];

const qrDataValidation = [
  body('qr_data')
    .notEmpty()
    .withMessage('QR data is required')
    .isString()
    .withMessage('QR data must be a string')
];

const idValidation = [
  param('id')
    .isInt({ min: 1 })
    .withMessage('ID must be a positive integer')
];

const orderIdValidation = [
  param('orderId')
    .isInt({ min: 1 })
    .withMessage('Order ID must be a positive integer')
];

// Routes
router.post('/', paymentValidation, PaymentController.createPayment);
router.post('/with-qr', paymentValidation, PaymentController.createPaymentWithQR);
router.get('/pending', PaymentController.getPendingPayments);
router.get('/history', PaymentController.getPaymentHistory);
router.get('/:id', idValidation, PaymentController.getPayment);
router.get('/order/:orderId', orderIdValidation, PaymentController.getOrderPayments);
router.put('/:id/status', [...idValidation, ...statusUpdateValidation], PaymentController.updatePaymentStatus);
router.post('/:id/generate-qr', idValidation, PaymentController.generateQRCode);
router.post('/:id/confirm', [...idValidation, ...confirmPaymentValidation], PaymentController.confirmPayment);
router.post('/qr/verify', qrDataValidation, PaymentController.getPaymentByQR);

module.exports = router;
