const Payment = require('../models/Payment');
const Order = require('../models/Order');
const { validationResult } = require('express-validator');

function formatBirr(amount) {
  const n = Number(amount);
  if (Number.isFinite(n)) return n.toFixed(2);
  return '0.00';
}

// ESC/POS formatting commands
const ESC = '\x1B';
const GS = '\x1D';
const ESC_POS = {
  INIT: ESC + '@',
  BOLD_ON: ESC + 'E\x01',
  BOLD_OFF: ESC + 'E\x00',
  DOUBLE_ON: GS + '!\x11',
  DOUBLE_OFF: GS + '!\x00',
  DOUBLE_WIDTH: GS + '!\x10',
  CENTER: ESC + 'a\x01',
  LEFT: ESC + 'a\x00',
  RIGHT: ESC + 'a\x02',
};

function buildReceiptText(order, payment) {
  const lines = [];
  const W = 48;

  const center = (str) => {
    const s = String(str);
    const pad = Math.max(0, Math.floor((W - s.length) / 2));
    return ' '.repeat(pad) + s;
  };

  const dashLine = () => '-'.repeat(W);

  lines.push(center('Kidist Shiro'));
  lines.push(dashLine());

  // Date/Time
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB');
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const dateTimeLine = dateStr + ' '.repeat(W - dateStr.length - timeStr.length) + timeStr;
  lines.push(dateTimeLine);
  lines.push(dashLine());

  // Items header - bold
  lines.push(ESC_POS.BOLD_ON);
  const hdrQty = 'QTY';
  const hdrDesc = 'DESCRIPTION';
  const hdrAmt = 'AMT';
  lines.push(`  ${hdrQty}   ${hdrDesc}${' '.repeat(W - 8 - hdrDesc.length - hdrAmt.length)}${hdrAmt}`);
  lines.push(ESC_POS.BOLD_OFF);

  // Items - all bold
  lines.push(ESC_POS.BOLD_ON);
  let subtotal = 0;
  (order.items || []).forEach((item) => {
    const qty = parseInt(item.quantity || 1, 10);
    const name = item.menu_item_name || item.name || `Item ${item.menu_item_id || ''}`.trim();
    const lineTotal = Number(item.subtotal ?? (Number(item.unit_price || 0) * qty));
    subtotal += lineTotal;

    const qtyStr = String(qty).padStart(3);
    const amtStr = formatBirr(lineTotal);
    const maxNameLen = W - 10 - amtStr.length;
    const truncName = name.length > maxNameLen ? name.substring(0, maxNameLen) : name.padEnd(maxNameLen);
    lines.push(`  ${qtyStr}   ${truncName}${amtStr}`);
  });
  lines.push(ESC_POS.BOLD_OFF);

  lines.push(dashLine());

  // Total - bold and larger
  const total = payment && payment.amount ? parseFloat(payment.amount) : (order.total_amount ? parseFloat(order.total_amount) : subtotal);
  lines.push(ESC_POS.RIGHT + ESC_POS.BOLD_ON + ESC_POS.DOUBLE_WIDTH);
  lines.push(`TOTAL  ${formatBirr(total)} Birr`);
  lines.push(ESC_POS.DOUBLE_OFF + ESC_POS.BOLD_OFF + ESC_POS.LEFT);
  lines.push(dashLine());

  // Footer
  const tableStr = order.table_number ? `Table: ${order.table_number}` : '';
  if (tableStr) lines.push(tableStr);
  
  const servedBy = order.employee_name ? `Served by: ${order.employee_name}` : '';
  const orderNum = `Order #${order.id}`;
  if (servedBy) {
    const footerLine = servedBy + ' '.repeat(W - servedBy.length - orderNum.length) + orderNum;
    lines.push(footerLine);
  } else {
    lines.push(' '.repeat(W - orderNum.length) + orderNum);
  }

  // Thank you - centered, bold
  lines.push(ESC_POS.CENTER + ESC_POS.BOLD_ON);
  lines.push('Thank you!');
  lines.push(ESC_POS.BOLD_OFF + ESC_POS.LEFT);

  return lines.join('\n');
}

class PaymentController {
  static async createPayment(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      const payment = await Payment.create(req.body);

      res.status(201).json({
        status: 'success',
        message: 'Payment created successfully',
        data: {
          payment
        }
      });

    } catch (error) {
      console.error('Create payment error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getPayment(req, res) {
    try {
      const { id } = req.params;
      
      const payment = await Payment.findById(id);
      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found'
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          payment
        }
      });

    } catch (error) {
      console.error('Get payment error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getOrderPayments(req, res) {
    try {
      const { orderId } = req.params;
      
      const payments = await Payment.findByOrderId(orderId);

      res.status(200).json({
        status: 'success',
        data: {
          payments,
          count: payments.length
        }
      });

    } catch (error) {
      console.error('Get order payments error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async generateQRCode(req, res) {
    try {
      const { id } = req.params;
      
      const payment = await Payment.generateQRCode(id);
      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'QR code generated successfully',
        data: {
          payment,
          qr_code: payment.qr_code
        }
      });

    } catch (error) {
      console.error('Generate QR code error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Internal server error'
      });
    }
  }

  static async updatePaymentStatus(req, res) {
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
      const { status, processed_by } = req.body;
      
      const updatedPayment = await Payment.updateStatus(id, status, processed_by);
      if (!updatedPayment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found'
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Payment status updated successfully',
        data: {
          payment: updatedPayment
        }
      });

    } catch (error) {
      console.error('Update payment status error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async confirmPayment(req, res) {
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
      const { processed_by } = req.body;
      
      const confirmedPayment = await Payment.confirmPayment(id, processed_by);

       let receiptText = null;
       try {
         if (confirmedPayment && confirmedPayment.order_id) {
           const order = await Order.findById(confirmedPayment.order_id);
           if (order) receiptText = buildReceiptText(order, confirmedPayment);
         }
       } catch (e) {
         console.error('Receipt build error:', e.message);
       }

      res.status(200).json({
        status: 'success',
        message: 'Payment confirmed successfully',
        data: {
          payment: confirmedPayment,
          receipt_text: receiptText
        },
        receipt_text: receiptText
      });

    } catch (error) {
      console.error('Confirm payment error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Internal server error'
      });
    }
  }

  static async getPendingPayments(req, res) {
    try {
      const payments = await Payment.getPendingPayments();

      res.status(200).json({
        status: 'success',
        data: {
          payments,
          count: payments.length
        }
      });

    } catch (error) {
      console.error('Get pending payments error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async getPaymentHistory(req, res) {
    try {
      const { status, payment_method, processed_by, date_from, date_to } = req.query;
      
      const filters = {};
      if (status) filters.status = status;
      if (payment_method) filters.payment_method = payment_method;
      if (processed_by) filters.processed_by = processed_by;
      if (date_from) filters.date_from = date_from;
      if (date_to) filters.date_to = date_to;

      const payments = await Payment.getPaymentHistory(filters);

      res.status(200).json({
        status: 'success',
        data: {
          payments,
          count: payments.length
        }
      });

    } catch (error) {
      console.error('Get payment history error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }

  static async createPaymentWithQR(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: errors.array()
        });
      }

      // Create payment
      const payment = await Payment.create(req.body);
      
      // Generate QR code
      const paymentWithQR = await Payment.generateQRCode(payment.id);

      res.status(201).json({
        status: 'success',
        message: 'Payment created with QR code successfully',
        data: {
          payment: paymentWithQR,
          qr_code: paymentWithQR.qr_code
        }
      });

    } catch (error) {
      console.error('Create payment with QR error:', error);
      res.status(500).json({
        status: 'error',
        message: error.message || 'Internal server error'
      });
    }
  }

  static async getPaymentByQR(req, res) {
    try {
      const { qr_data } = req.body;
      
      if (!qr_data) {
        return res.status(400).json({
          status: 'error',
          message: 'QR data is required'
        });
      }

      let parsedData;
      try {
        parsedData = JSON.parse(qr_data);
      } catch (error) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid QR data format'
        });
      }

      const payment = await Payment.findById(parsedData.payment_id);
      if (!payment) {
        return res.status(404).json({
          status: 'error',
          message: 'Payment not found'
        });
      }

      res.status(200).json({
        status: 'success',
        data: {
          payment,
          qr_data: parsedData
        }
      });

    } catch (error) {
      console.error('Get payment by QR error:', error);
      res.status(500).json({
        status: 'error',
        message: 'Internal server error'
      });
    }
  }
}

module.exports = PaymentController;
