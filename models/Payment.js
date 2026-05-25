const db = require('../config/database');
const QRCode = require('qrcode');

class Payment {
  static async create(paymentData) {
    const { order_id, amount, payment_method, processed_by, description } = paymentData;
    
    const query = `
      INSERT INTO payments (order_id, amount, payment_method, status, processed_by, description, created_at, updated_at)
      VALUES ($1, $2, $3, 'pending', $4, $5, NOW(), NOW())
      RETURNING *
    `;
    
    const result = await db.query(query, [order_id || null, amount, payment_method, processed_by, description || null]);
    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT p.*, o.customer_id, o.type as order_type,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as processed_by_name
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN users u ON p.processed_by = u.id
      WHERE p.id = $1
    `;
    const result = await db.query(query, [id]);
    return result.rows[0];
  }

  static async findByOrderId(orderId) {
    const query = `
      SELECT p.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as processed_by_name
      FROM payments p
      LEFT JOIN users u ON p.processed_by = u.id
      WHERE p.order_id = $1
      ORDER BY p.created_at DESC
    `;
    const result = await db.query(query, [orderId]);
    return result.rows;
  }

  static async generateQRCode(paymentId) {
    const payment = await this.findById(paymentId);
    if (!payment) {
      throw new Error('Payment not found');
    }

    const qrData = {
      payment_id: payment.id,
      order_id: payment.order_id,
      amount: payment.amount,
      customer_id: payment.customer_id,
      timestamp: new Date().toISOString()
    };

    try {
      const qrCodeDataURL = await QRCode.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        }
      });

      // Update payment with QR code
      const updateQuery = `
        UPDATE payments 
        SET qr_code = $1, updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      
      const result = await db.query(updateQuery, [qrCodeDataURL, paymentId]);
      return result.rows[0];
      
    } catch (error) {
      throw new Error('Failed to generate QR code: ' + error.message);
    }
  }

  static async updateStatus(id, status, processedBy = null) {
    const query = `
      UPDATE payments 
      SET status = $1, processed_by = $2, updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;
    
    const result = await db.query(query, [status, processedBy, id]);
    return result.rows[0];
  }

  static async confirmPayment(paymentId, processedBy) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Update payment status
      const paymentQuery = `
        UPDATE payments 
        SET status = 'paid', processed_by = $1, paid_at = NOW(), updated_at = NOW()
        WHERE id = $2
        RETURNING *
      `;
      
      const paymentResult = await client.query(paymentQuery, [processedBy, paymentId]);
      const payment = paymentResult.rows[0];
      
      if (!payment) {
        throw new Error('Payment not found');
      }
      
      // Update order status and payment_status to paid
      const orderQuery = `
        UPDATE orders 
        SET status = 'paid', payment_status = 'paid', updated_at = NOW()
        WHERE id = $1
      `;
      
      await client.query(orderQuery, [payment.order_id]);
      
      await client.query('COMMIT');
      return payment;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getPendingPayments() {
    const query = `
      SELECT p.*, o.customer_id, o.type as order_type, o.table_number,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as processed_by_name
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      LEFT JOIN users u ON p.processed_by = u.id
      WHERE p.status = 'pending'
      ORDER BY p.created_at ASC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }

  static async getPaymentHistory(filters = {}) {
    let query = `
      SELECT p.*, o.customer_id, o.type as order_type, o.table_number,
             TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as processed_by_name
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      LEFT JOIN users u ON p.processed_by = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND p.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.payment_method) {
      paramCount++;
      query += ` AND p.payment_method = $${paramCount}`;
      params.push(filters.payment_method);
    }

    if (filters.processed_by) {
      paramCount++;
      query += ` AND p.processed_by = $${paramCount}`;
      params.push(filters.processed_by);
    }

    if (filters.date_from) {
      paramCount++;
      query += ` AND DATE(p.created_at) >= $${paramCount}`;
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      paramCount++;
      query += ` AND DATE(p.created_at) <= $${paramCount}`;
      params.push(filters.date_to);
    }

    query += ` ORDER BY p.created_at DESC`;
    
    const result = await db.query(query, params);
    return result.rows;
  }
}

module.exports = Payment;
