const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class Order {
  static async create(orderData) {
    const { employee_id, customer_id, table_number, type, items, total_amount, notes } = orderData;
    const safeTableNumber = table_number == null || table_number === '' ? null : table_number;
    
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Create order
      const orderQuery = `
        INSERT INTO orders (customer_id, employee_id, table_number, type, total_amount, status, notes, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'pending', $6, NOW(), NOW())
        RETURNING *
      `;
      
      const orderResult = await client.query(orderQuery, [
        customer_id || uuidv4(), employee_id, safeTableNumber, type, total_amount, notes
      ]);
      
      const order = orderResult.rows[0];
      
      // Create order items
      if (items && items.length > 0) {
        const itemsQuery = `
          INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
          VALUES ($1, $2, $3, $4, $5)
        `;
        
        for (const item of items) {
          await client.query(itemsQuery, [
            order.id,
            item.menu_item_id,
            item.quantity,
            item.unit_price,
            item.subtotal
          ]);
        }
      }
      
      await client.query('COMMIT');
      
      // Determine order routing based on items
      const createdOrder = await this.findById(order.id);
      await this.determineOrderRouting(createdOrder);
      
      // Return order with items
      return createdOrder;
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async findById(id) {
    const orderQuery = `SELECT * FROM orders WHERE id = $1`;
    const orderResult = await db.query(orderQuery, [id]);
    
    if (orderResult.rows.length === 0) {
      return null;
    }
    
    const order = orderResult.rows[0];
    
    // Get order items with menu item details
    const itemsQuery = `
      SELECT oi.*, mi.name, mi.description, mi.category
      FROM order_items oi
      JOIN menu_items mi ON oi.menu_item_id = mi.id
      WHERE oi.order_id = $1
      ORDER BY oi.id
    `;
    
    const itemsResult = await db.query(itemsQuery, [id]);
    order.items = itemsResult.rows;
    
    return order;
  }

  static async findAll(filters = {}) {
    let query = `
      SELECT o.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name
      FROM orders o
      LEFT JOIN users u ON o.employee_id = u.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 0;

    if (filters.status) {
      paramCount++;
      query += ` AND o.status = $${paramCount}`;
      params.push(filters.status);
    }

    if (filters.type) {
      paramCount++;
      query += ` AND o.type = $${paramCount}`;
      params.push(filters.type);
    }

    if (filters.employee_id) {
      paramCount++;
      query += ` AND o.employee_id = $${paramCount}`;
      params.push(filters.employee_id);
    }

    if (filters.table_number) {
      paramCount++;
      query += ` AND o.table_number = $${paramCount}`;
      params.push(filters.table_number);
    }

    query += ` ORDER BY o.created_at DESC`;
    
    const result = await db.query(query, params);
    const orders = result.rows;

    // Fetch order items for each order
    for (let order of orders) {
      const itemsQuery = `
        SELECT oi.*, mi.name as menu_item_name, mi.description, mi.category
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `;
      
      const itemsResult = await db.query(itemsQuery, [order.id]);
      order.items = itemsResult.rows;
    }

    return orders;
  }

  static async updateStatus(id, status, updatedBy = null) {
    const query = `
      UPDATE orders 
      SET status = $1, updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    
    const result = await db.query(query, [status, id]);
    
    if (result.rows.length > 0) {
      // Log status change
      await this.logStatusChange(id, status, updatedBy);
    }
    
    return result.rows[0];
  }

  static async logStatusChange(orderId, status, updatedBy) {
    const query = `
      INSERT INTO order_status_logs (order_id, status, changed_by, changed_at)
      VALUES ($1, $2, $3, NOW())
    `;
    
    await db.query(query, [orderId, status, updatedBy]);
  }

  static async getStatusHistory(orderId) {
    const query = `
      SELECT osl.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as changed_by_name
      FROM order_status_logs osl
      LEFT JOIN users u ON osl.changed_by = u.id
      WHERE osl.order_id = $1
      ORDER BY osl.changed_at DESC
    `;
    
    const result = await db.query(query, [orderId]);
    return result.rows;
  }

  static async getPendingOrders(type = null) {
    let query = `
      SELECT o.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name
      FROM orders o
      LEFT JOIN users u ON o.employee_id = u.id
      WHERE o.status IN ('pending', 'preparing')
    `;
    const params = [];

    if (type) {
      query += ` AND o.type = $1`;
      params.push(type);
    }

    query += ` ORDER BY o.created_at ASC`;
    
    const result = await db.query(query, params);
    const orders = result.rows;

    // Fetch order items for each order
    for (let order of orders) {
      const itemsQuery = `
        SELECT oi.*, mi.name as menu_item_name, mi.description, mi.category
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `;
      
      const itemsResult = await db.query(itemsQuery, [order.id]);
      order.items = itemsResult.rows;
    }

    return orders;
  }

  static async getReadyOrders(type = null) {
    let query = `
      SELECT o.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name
      FROM orders o
      LEFT JOIN users u ON o.employee_id = u.id
      WHERE o.status = 'ready'
    `;
    const params = [];

    if (type) {
      query += ` AND o.type = $1`;
      params.push(type);
    }

    query += ` ORDER BY o.updated_at ASC`;
    
    const result = await db.query(query, params);
    const orders = result.rows;

    // Fetch order items for each order
    for (let order of orders) {
      const itemsQuery = `
        SELECT oi.*, mi.name as menu_item_name, mi.description, mi.category
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1
        ORDER BY oi.id
      `;
      
      const itemsResult = await db.query(itemsQuery, [order.id]);
      order.items = itemsResult.rows;
    }

    return orders;
  }

  static async determineOrderRouting(order) {
    if (order.type !== 'cafe') {
      // Bakery orders follow normal flow
      return;
    }

    // Define categories that don't need kitchen preparation
    const beverageCategories = [
      'coffee', 'beverages', 'drinks', 'tea', 'espresso', 
      'cappuccino', 'latte', 'americano', 'cold drinks',
      'hot drinks', 'iced coffee', 'frappuccino', 'smoothie',
      'juice', 'soda', 'water'
    ];

    // Categorize order items
    const beverageItems = [];
    const foodItems = [];

    order.items.forEach(item => {
      const category = (item.category || '').toLowerCase();
      const name = (item.menu_item_name || item.name || '').toLowerCase();
      
      // Check if item is a beverage
      const isBeverage = beverageCategories.some(bevCat => 
        category.includes(bevCat) || name.includes(bevCat)
      );

      if (isBeverage) {
        beverageItems.push(item);
      } else {
        foodItems.push(item);
      }
    });

    // Store item categorization for later use
    await this.updateOrderItemCategories(order.id, beverageItems, foodItems);

    if (foodItems.length === 0) {
      // Only beverages - send directly to cashier
      await this.updateStatus(order.id, 'ready');
      console.log(`Order #${order.id}: Only beverages (${beverageItems.length} items) - sent directly to cashier`);
    } else if (beverageItems.length === 0) {
      // Only food items - normal kitchen workflow (status stays 'pending' for kitchen to pick up)
      console.log(`Order #${order.id}: Only food items (${foodItems.length} items) - sent to kitchen`);
    } else {
      // Mixed order - only food items go to kitchen, beverages wait
      // Status stays 'pending' so kitchen can see the food items
      console.log(`Order #${order.id}: Mixed order (${beverageItems.length} beverages, ${foodItems.length} food items) - only food items go to kitchen, beverages will wait`);
    }
  }

  static async updateOrderItemCategories(orderId, beverageItems, foodItems) {
    // Store item categorization in order_items table for tracking
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Mark beverage items
      for (const item of beverageItems) {
        await client.query(`
          UPDATE order_items 
          SET item_type = 'beverage'
          WHERE order_id = $1 AND menu_item_id = $2
        `, [orderId, item.menu_item_id]);
      }
      
      // Mark food items
      for (const item of foodItems) {
        await client.query(`
          UPDATE order_items 
          SET item_type = 'food'
          WHERE order_id = $1 AND menu_item_id = $2
        `, [orderId, item.menu_item_id]);
      }
      
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error updating item categories:', error);
    } finally {
      client.release();
    }
  }

  static async markFoodItemsReady(orderId) {
    // This method will be called when kitchen finishes food preparation
    const order = await this.findById(orderId);
    
    if (!order) return;

    // Check if this order has beverages waiting
    const hasBeverages = order.items.some(item => 
      item.item_type === 'beverage'
    );

    if (hasBeverages) {
      // Mixed order - now both food and beverages are ready
      await this.updateStatus(orderId, 'ready');
      console.log(`Order #${orderId}: Food items completed, beverages also ready - sending complete order to cashier`);
    } else {
      // Food-only order
      await this.updateStatus(orderId, 'ready');
      console.log(`Order #${orderId}: Food-only order ready for service`);
    }
  }

  static async getOrdersByType(orderType = 'all') {
    // Get orders categorized by their item composition
    let query = `
      SELECT o.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name,
             COUNT(CASE WHEN oi.item_type = 'beverage' THEN 1 END) as beverage_count,
             COUNT(CASE WHEN oi.item_type = 'food' THEN 1 END) as food_count
      FROM orders o
      LEFT JOIN users u ON o.employee_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.type = 'cafe'
    `;
    
    const params = [];
    
    if (orderType === 'beverage_only') {
      query += ` AND o.status IN ('ready', 'completed')`;
    } else if (orderType === 'kitchen') {
      query += ` AND o.status IN ('pending', 'preparing')`;
    }
    
    query += ` GROUP BY o.id, u.first_name, u.last_name ORDER BY o.created_at DESC`;
    
    const result = await db.query(query, params);
    const orders = result.rows;

    // Fetch detailed items for each order
    for (let order of orders) {
      const itemsQuery = `
        SELECT oi.*, mi.name as menu_item_name, mi.description, mi.category
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1
        ORDER BY oi.item_type, oi.id
      `;
      
      const itemsResult = await db.query(itemsQuery, [order.id]);
      order.items = itemsResult.rows;
      
      // Determine order composition
      order.order_composition = order.food_count > 0 && order.beverage_count > 0 ? 'mixed' :
                               order.beverage_count > 0 ? 'beverage_only' : 'food_only';
    }

    return orders;
  }

  static async getKitchenOrders() {
    // Get orders that have food items and are pending/preparing
    // Only show food items to kitchen, not beverages
    let query = `
      SELECT DISTINCT o.*, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as employee_name
      FROM orders o
      LEFT JOIN users u ON o.employee_id = u.id
      LEFT JOIN order_items oi ON o.id = oi.order_id
      WHERE o.type = 'cafe' 
      AND o.status IN ('pending', 'preparing')
      AND oi.item_type = 'food'
      ORDER BY o.created_at ASC
    `;
    
    const result = await db.query(query);
    const orders = result.rows;

    // Fetch only food items for each order (beverages stay hidden from kitchen)
    for (let order of orders) {
      const itemsQuery = `
        SELECT oi.*, mi.name as menu_item_name, mi.description, mi.category
        FROM order_items oi
        LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
        WHERE oi.order_id = $1 AND oi.item_type = 'food'
        ORDER BY oi.id
      `;
      
      const itemsResult = await db.query(itemsQuery, [order.id]);
      order.items = itemsResult.rows;
    }

    return orders;
  }

  static async updateOrderItems(orderId, items, updatedBy = null) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Delete existing order items
      await client.query('DELETE FROM order_items WHERE order_id = $1', [orderId]);
      
      // Calculate new total
      let newTotal = 0;
      
      // Insert updated order items
      const itemsQuery = `
        INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5)
      `;
      
      for (const item of items) {
        const subtotal = parseFloat(item.unit_price) * parseInt(item.quantity);
        newTotal += subtotal;
        
        await client.query(itemsQuery, [
          orderId,
          item.menu_item_id,
          item.quantity,
          item.unit_price,
          subtotal
        ]);
      }
      
      // Update order total
      await client.query(
        'UPDATE orders SET total_amount = $1, updated_at = NOW() WHERE id = $2',
        [newTotal, orderId]
      );
      
      await client.query('COMMIT');
      
      // Return updated order
      return await this.findById(orderId);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async addOrderItems(orderId, items, updatedBy = null) {
    const client = await db.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // Get current order total
      const orderQuery = 'SELECT total_amount FROM orders WHERE id = $1';
      const orderResult = await client.query(orderQuery, [orderId]);
      let currentTotal = parseFloat(orderResult.rows[0].total_amount);
      
      // Calculate additional total
      let additionalTotal = 0;
      
      // Insert new order items
      const itemsQuery = `
        INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
        VALUES ($1, $2, $3, $4, $5)
      `;
      
      for (const item of items) {
        // Check if item already exists in order
        const existingItemQuery = `
          SELECT * FROM order_items 
          WHERE order_id = $1 AND menu_item_id = $2
        `;
        const existingResult = await client.query(existingItemQuery, [orderId, item.menu_item_id]);
        
        if (existingResult.rows.length > 0) {
          // Update existing item quantity
          const existingItem = existingResult.rows[0];
          const newQuantity = parseInt(existingItem.quantity) + parseInt(item.quantity);
          const newSubtotal = parseFloat(item.unit_price) * newQuantity;
          
          await client.query(
            'UPDATE order_items SET quantity = $1, subtotal = $2 WHERE order_id = $3 AND menu_item_id = $4',
            [newQuantity, newSubtotal, orderId, item.menu_item_id]
          );
          
          additionalTotal += parseFloat(item.unit_price) * parseInt(item.quantity);
        } else {
          // Add new item
          const subtotal = parseFloat(item.unit_price) * parseInt(item.quantity);
          additionalTotal += subtotal;
          
          await client.query(itemsQuery, [
            orderId,
            item.menu_item_id,
            item.quantity,
            item.unit_price,
            subtotal
          ]);
        }
      }
      
      // Update order total
      const newTotal = currentTotal + additionalTotal;
      await client.query(
        'UPDATE orders SET total_amount = $1, updated_at = NOW() WHERE id = $2',
        [newTotal, orderId]
      );
      
      await client.query('COMMIT');
      
      // Return updated order
      return await this.findById(orderId);
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async getOccupiedTables() {
    // Get tables that have active orders (not completed or cancelled)
    const query = `
      SELECT DISTINCT table_number, o.id as order_id, o.status, TRIM(CONCAT(u.first_name, ' ', COALESCE(u.last_name, ''))) as waiter_name
      FROM orders o
      LEFT JOIN users u ON o.employee_id = u.id
      WHERE o.type = 'cafe' 
      AND o.status IN ('pending', 'preparing', 'ready')
      AND o.table_number IS NOT NULL
      ORDER BY table_number ASC
    `;
    
    const result = await db.query(query);
    return result.rows;
  }
}

module.exports = Order;
