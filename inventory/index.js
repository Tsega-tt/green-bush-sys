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
  console.log('✅ Inventory PG module mounted at /api/inv (phases 0-7)');
  return true;
}

module.exports = { mountInventory, isEnabled };
