'use strict';

/**
 * Inventory domain entry point (Phase 0/1).
 *
 * mountInventory(app) attaches /api/inv/* only when INVENTORY_BACKEND=pg AND the
 * DB is configured. Otherwise it is a no-op, leaving the legacy JSON paths in
 * server.js completely untouched (safe, reversible cutover via env flag).
 */

const { isConfigured } = require('./db/config');

function isEnabled() {
  return String(process.env.INVENTORY_BACKEND || 'json').toLowerCase() === 'pg';
}

function mountInventory(app) {
  if (!isEnabled()) {
    console.log('🧊 Inventory PG module disabled (INVENTORY_BACKEND != pg). Legacy paths active.');
    return false;
  }
  if (!isConfigured()) {
    console.warn('⚠️  INVENTORY_BACKEND=pg but DB_* not configured — inventory module NOT mounted.');
    return false;
  }
  // Lazy-require so the app can boot even if pg deps are missing in json mode.
  app.use('/api/inv', require('./http/routes'));          // Phase 0/1
  app.use('/api/inv', require('./http/transferRoutes'));  // Phase 2
  app.use('/api/inv', require('./http/procurementRoutes')); // Phase 3
  app.use('/api/inv', require('./http/recipeRoutes'));    // Phase 4
  app.use('/api/inv', require('./http/operationsRoutes')); // Phase 5
  app.use('/api/inv', require('./http/reportRoutes'));    // Phase 6/7
  app.use('/api/inv', require('./http/acceptanceRoutes')); // Phase 8 — item acceptance
  console.log('✅ Inventory PG module mounted at /api/inv (phases 0-8)');
  return true;
}

/**
 * Finalized-sale hook for the legacy POS. Call when an order becomes paid.
 * Safe no-op unless the PG inventory module is enabled + configured.
 *
 * - Atomic + idempotent per order id (retries/refresh never double-deduct).
 * - Returns { skipped } | { alreadyConsumed } | { consumed, lines }.
 * - Throws InventoryError on a real shortage so the caller can choose whether
 *   to block the sale (INVENTORY_ENFORCE_ON_SALE=true) or log-and-continue.
 *
 * @param {object} order  legacy order { id, order_number, items:[{menu_item_id, quantity}], processed_by }
 * @param {object} [opts] { userId }
 */
async function consumeOrderSale(order, opts = {}) {
  if (!isEnabled() || !isConfigured()) return { skipped: 'disabled' };
  if (!order || order.id == null) return { skipped: 'no_order' };
  const items = (Array.isArray(order.items) ? order.items : [])
    .map((it) => ({ menuItemId: parseInt(it.menu_item_id, 10), quantity: parseFloat(it.quantity || 0) }))
    .filter((it) => Number.isFinite(it.menuItemId) && it.quantity > 0);
  if (!items.length) return { skipped: 'no_items' };

  const recipeService = require('./services/recipeService');
  return recipeService.consumeForOrder({
    orderId: parseInt(order.id, 10),
    orderNumber: order.order_number || order.orderNumber || null,
    items,
    userId: opts.userId || order.processed_by || order.employee_id || order.user_id || 1,
    userRole: 'cashier',
  });
}

/** Reverse a cancelled/voided order's consumption (idempotent). */
async function reverseOrderSale(order, opts = {}) {
  if (!isEnabled() || !isConfigured()) return { skipped: 'disabled' };
  if (!order || order.id == null) return { skipped: 'no_order' };
  const recipeService = require('./services/recipeService');
  return recipeService.reverseConsumption({
    orderId: parseInt(order.id, 10),
    orderNumber: order.order_number || order.orderNumber || null,
    userId: opts.userId || order.processed_by || 1,
    userRole: 'cashier',
  });
}

function enforceOnSale() {
  return String(process.env.INVENTORY_ENFORCE_ON_SALE || 'false').toLowerCase() === 'true';
}

module.exports = { mountInventory, isEnabled, consumeOrderSale, reverseOrderSale, enforceOnSale };
