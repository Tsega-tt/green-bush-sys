'use strict';

const express = require('express');
const repos = require('../repositories');
const { getPool } = require('../db/pool');
const ledger = require('../services/ledgerService');
const masterData = require('../services/masterDataService');
const snapshotService = require('../services/snapshotService');
const businessDate = require('../services/businessDate');
const sse = require('../realtime/sse');
const { Errors } = require('../errors');
const {
  resolveUser, requireRoles, asyncHandler, ok,
} = require('./permissions');
const V = require('./validators');

const PRIVILEGED = ['admin', 'owner', 'fnb_manager'];

/** Resolve the store id a caller may read, honoring store-manager scoping. */
function scopedStoreId(req, provided) {
  const u = req.invUser;
  if (PRIVILEGED.includes(u.role) || u.role === 'purchaser') {
    return provided != null && provided !== '' ? V.toInt(provided, 'store_id') : null;
  }
  // store manager: forced to their own store
  if (u.storeId == null) throw Errors.forbidden('No store assigned to your account');
  if (provided != null && provided !== '' && V.toInt(provided, 'store_id') !== u.storeId) {
    throw Errors.forbidden('Outside your store scope');
  }
  return u.storeId;
}

const router = express.Router();

// All routes require a resolved user.
router.use(resolveUser);

// ---------------- ops / health ----------------
router.get('/health/db', requireRoles('ops'), asyncHandler(async (req, res) => {
  const { rows } = await getPool().query('SELECT now() AS now');
  const mig = await getPool().query(
    `SELECT name, run_on FROM pgmigrations ORDER BY id DESC LIMIT 1`
  ).catch(() => ({ rows: [] }));
  ok(res, { now: rows[0].now, business_date: businessDate.currentBusinessDate(),
    latest_migration: mig.rows[0] || null, sse_clients: sse.clientCount() });
}));

// ---------------- stores & capabilities ----------------
router.get('/stores', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { stores: await masterData.reads.listStores() });
}));

router.post('/stores', requireRoles('manageStores'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['code', 'name']);
  const store = await masterData.createStore(
    { code: req.body.code, name: req.body.name, description: req.body.description,
      icon: req.body.icon, managerId: req.body.manager_id },
    ctx(req)
  );
  ok(res, { store }, 201);
}));

router.put('/stores/:id', requireRoles('manageStores'), asyncHandler(async (req, res) => {
  const store = await masterData.updateStore(V.toInt(req.params.id, 'id'), {
    name: req.body.name, description: req.body.description, icon: req.body.icon,
    managerId: req.body.manager_id, isActive: req.body.is_active,
  }, ctx(req));
  if (!store) throw Errors.notFound('Store');
  ok(res, { store });
}));

router.get('/stores/:storeId/capabilities', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { capabilities: await masterData.reads.listCapabilities(V.toInt(req.params.storeId, 'storeId')) });
}));

router.put('/stores/:storeId/capabilities', requireRoles('manageStores'), asyncHandler(async (req, res) => {
  const caps = Array.isArray(req.body.capabilities) ? req.body.capabilities : [];
  if (!caps.length) throw Errors.validation('capabilities[] is required');
  const out = await masterData.setCapabilities(
    V.toInt(req.params.storeId, 'storeId'),
    caps.map((c) => ({ capabilityKey: c.capability_key, enabled: c.enabled, config: c.config })),
    ctx(req)
  );
  ok(res, { capabilities: out });
}));

// ---------------- items ----------------
router.get('/items', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { items: await masterData.reads.listItems({
    q: req.query.q || null, category: req.query.category || null,
    activeOnly: V.optBool(req.query.active, true),
    limit: req.query.limit ? V.toInt(req.query.limit, 'limit') : 200,
    offset: req.query.offset ? V.toInt(req.query.offset, 'offset') : 0,
  }) });
}));

router.post('/items', requireRoles('manageItems'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['description']);
  const item = await masterData.createItem({
    itemCode: req.body.item_code, description: req.body.description,
    category: req.body.category, uom: req.body.uom,
    isPerishable: V.optBool(req.body.is_perishable, false),
    trackBatches: V.optBool(req.body.track_batches, false),
    defaultMinQty: req.body.default_min_qty != null ? V.nonNegNum(req.body.default_min_qty, 'default_min_qty') : 0,
    defaultReorder: req.body.default_reorder != null ? V.nonNegNum(req.body.default_reorder, 'default_reorder') : 0,
  }, ctx(req));
  ok(res, { item }, 201);
}));

router.put('/items/:id', requireRoles('manageItems'), asyncHandler(async (req, res) => {
  const item = await masterData.updateItem(V.toInt(req.params.id, 'id'), {
    description: req.body.description, category: req.body.category, uom: req.body.uom,
    isPerishable: req.body.is_perishable, trackBatches: req.body.track_batches,
    defaultMinQty: req.body.default_min_qty, defaultReorder: req.body.default_reorder,
    isActive: req.body.is_active,
  }, ctx(req));
  ok(res, { item });
}));

router.delete('/items/:id', requireRoles('manageStores'), asyncHandler(async (req, res) => {
  const item = await masterData.deleteItem(V.toInt(req.params.id, 'id'), ctx(req));
  ok(res, { item });
}));

router.get('/items/:id/ledger', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.query.store_id);
  if (storeId == null) throw Errors.validation('store_id is required');
  ok(res, { transactions: await repos.ledger.listByItem(getPool(), {
    storeId, itemId: V.toInt(req.params.id, 'id'),
    from: req.query.from || null, to: req.query.to || null,
    limit: req.query.limit ? V.toInt(req.query.limit, 'limit') : 100,
    offset: req.query.offset ? V.toInt(req.query.offset, 'offset') : 0,
  }) });
}));

router.get('/items/:id/price-history', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { price_history: await repos.priceHistory.listByItem(getPool(), V.toInt(req.params.id, 'id')) });
}));

// ---------------- suppliers ----------------
router.get('/suppliers', requireRoles('manageSuppliers'), asyncHandler(async (req, res) => {
  ok(res, { suppliers: await masterData.reads.listSuppliers({
    q: req.query.q || null, activeOnly: V.optBool(req.query.active, true),
  }) });
}));

router.post('/suppliers', requireRoles('manageSuppliers'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['name']);
  const supplier = await masterData.createSupplier({
    name: req.body.name, contactPerson: req.body.contact_person, phone: req.body.phone,
    email: req.body.email, address: req.body.address, taxNumber: req.body.tax_number,
    notes: req.body.notes,
  }, ctx(req));
  ok(res, { supplier }, 201);
}));

router.put('/suppliers/:id', requireRoles('manageSuppliers'), asyncHandler(async (req, res) => {
  const supplier = await masterData.updateSupplier(V.toInt(req.params.id, 'id'), {
    name: req.body.name, contactPerson: req.body.contact_person, phone: req.body.phone,
    email: req.body.email, address: req.body.address, taxNumber: req.body.tax_number,
    notes: req.body.notes, isActive: req.body.is_active,
  }, ctx(req));
  if (!supplier) throw Errors.notFound('Supplier');
  ok(res, { supplier });
}));

// ---------------- approval thresholds ----------------
router.get('/approval-thresholds', requireRoles('manageThresholds'), asyncHandler(async (req, res) => {
  ok(res, { thresholds: await masterData.reads.listThresholds() });
}));

router.put('/approval-thresholds', requireRoles('manageThresholds'), asyncHandler(async (req, res) => {
  const bands = Array.isArray(req.body.bands) ? req.body.bands : [];
  if (!bands.length) throw Errors.validation('bands[] is required');
  const out = await masterData.replaceThresholds(bands.map((b) => ({
    bandName: b.band_name, minAmount: V.nonNegNum(b.min_amount, 'min_amount'),
    maxAmount: b.max_amount != null ? V.nonNegNum(b.max_amount, 'max_amount') : null,
    requiresFnb: b.requires_fnb, requiresOwnerNotification: b.requires_owner_notification,
    requiresOwnerApproval: b.requires_owner_approval,
  })), ctx(req));
  ok(res, { thresholds: out });
}));

// ---------------- balances & valuation ----------------
router.get('/balances', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.query.store_id);
  if (storeId == null) throw Errors.validation('store_id is required');
  ok(res, { balances: await repos.balances.listByStore(getPool(), storeId, {
    lowOnly: V.optBool(req.query.low_only, false),
  }) });
}));

router.get('/valuation', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const storeId = PRIVILEGED.includes(req.invUser.role)
    ? (req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null)
    : scopedStoreId(req, req.query.store_id);
  ok(res, { valuation: await repos.balances.valuation(getPool(), storeId) });
}));

router.get('/stores/:storeId/ledger', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.params.storeId);
  ok(res, { transactions: await repos.ledger.listByStore(getPool(), {
    storeId, type: req.query.type || null, from: req.query.from || null, to: req.query.to || null,
    limit: req.query.limit ? V.toInt(req.query.limit, 'limit') : 100,
    offset: req.query.offset ? V.toInt(req.query.offset, 'offset') : 0,
  }) });
}));

// ---------------- batches & expiry ----------------
router.get('/batches', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.query.store_id);
  ok(res, { batches: await repos.batches.listExpiring(getPool(), {
    storeId, withinDays: req.query.expiring_in_days ? V.toInt(req.query.expiring_in_days, 'expiring_in_days') : 3650,
  }) });
}));

// ---------------- movements (Phase 1 write path) ----------------
router.post('/adjustments', requireRoles('adjust'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.body.store_id);
  V.requireFields(req.body, ['item_id', 'reason']);
  const result = await ledger.adjust({
    storeId, itemId: V.toInt(req.body.item_id, 'item_id'),
    newQuantity: req.body.new_quantity != null ? V.nonNegNum(req.body.new_quantity, 'new_quantity') : null,
    delta: req.body.delta != null ? V.toNum(req.body.delta, 'delta') : null,
    unitCost: req.body.unit_cost != null ? V.nonNegNum(req.body.unit_cost, 'unit_cost') : null,
    reason: req.body.reason, idempotencyKey: req.body.idempotency_key,
    userId: req.invUser.id, userRole: req.invUser.role,
  });
  broadcastChange(storeId, result.balance);
  ok(res, { transactions: result.transactions, balance: result.balance });
}));

router.post('/deductions', requireRoles('adjust'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.body.store_id);
  const lines = Array.isArray(req.body.lines) ? req.body.lines : null;
  if (lines) {
    const result = await ledger.deductMany({
      storeId, type: req.body.type || 'consumption',
      lines: lines.map((l) => ({ itemId: V.toInt(l.item_id, 'item_id'), quantity: V.positiveNum(l.quantity, 'quantity') })),
      referenceType: req.body.reference_type, referenceId: req.body.reference_id,
      idempotencyKey: req.body.idempotency_key, note: req.body.note,
      userId: req.invUser.id, userRole: req.invUser.role,
    });
    sse.broadcast('inventory.changed', { store_id: storeId });
    return ok(res, { results: result.results });
  }
  V.requireFields(req.body, ['item_id', 'quantity']);
  const result = await ledger.deduct({
    storeId, itemId: V.toInt(req.body.item_id, 'item_id'), quantity: V.positiveNum(req.body.quantity, 'quantity'),
    type: req.body.type || 'consumption', referenceType: req.body.reference_type, referenceId: req.body.reference_id,
    idempotencyKey: req.body.idempotency_key, note: req.body.note,
    userId: req.invUser.id, userRole: req.invUser.role,
  });
  broadcastChange(storeId, result.balance);
  ok(res, { transactions: result.transactions, balance: result.balance });
}));

router.post('/opening-balances', requireRoles('ops'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id', 'item_id', 'quantity']);
  const storeId = V.toInt(req.body.store_id, 'store_id');
  const result = await ledger.openingBalance({
    storeId, itemId: V.toInt(req.body.item_id, 'item_id'),
    quantity: V.positiveNum(req.body.quantity, 'quantity'),
    unitCost: req.body.unit_cost != null ? V.nonNegNum(req.body.unit_cost, 'unit_cost') : 0,
    idempotencyKey: req.body.idempotency_key,
    userId: req.invUser.id, userRole: req.invUser.role,
  });
  broadcastChange(storeId, result.balance);
  ok(res, { transactions: result.transactions, balance: result.balance }, 201);
}));

// ---------------- snapshots ----------------
router.get('/snapshots', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const storeId = scopedStoreId(req, req.query.store_id);
  ok(res, { snapshots: await repos.snapshots.list(getPool(), {
    storeId, date: req.query.date || null,
  }) });
}));

router.post('/snapshots/run', requireRoles('ops'), asyncHandler(async (req, res) => {
  const result = await snapshotService.runDailySnapshot(req.body.date || null);
  ok(res, result, 201);
}));

router.post('/expiry/scan', requireRoles('ops'), asyncHandler(async (req, res) => {
  ok(res, await snapshotService.runExpiryAlerts());
}));

// ---------------- alerts ----------------
router.get('/alerts', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { alerts: await repos.alerts.list(getPool(), {
    status: req.query.status || null, storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
    type: req.query.type || null,
  }) });
}));

router.patch('/alerts/:id/ack', requireRoles('ackAlerts'), asyncHandler(async (req, res) => {
  const alert = await repos.alerts.acknowledge(getPool(), V.toInt(req.params.id, 'id'), req.invUser.id);
  if (!alert) throw Errors.notFound('Open alert');
  ok(res, { alert });
}));

router.patch('/alerts/:id/resolve', requireRoles('resolveAlerts'), asyncHandler(async (req, res) => {
  const alert = await repos.alerts.resolve(getPool(), V.toInt(req.params.id, 'id'), req.invUser.id);
  if (!alert) throw Errors.notFound('Alert');
  ok(res, { alert });
}));

// ---------------- audit logs ----------------
router.get('/audit-logs', requireRoles('viewAudit'), asyncHandler(async (req, res) => {
  ok(res, { audit_logs: await repos.audit.list(getPool(), {
    entityType: req.query.entity_type || null,
    entityId: req.query.entity_id ? V.toInt(req.query.entity_id, 'entity_id') : null,
    actorId: req.query.actor_id ? V.toInt(req.query.actor_id, 'actor_id') : null,
    action: req.query.action || null,
    limit: req.query.limit ? V.toInt(req.query.limit, 'limit') : 100,
    offset: req.query.offset ? V.toInt(req.query.offset, 'offset') : 0,
  }) });
}));

// ---------------- live updates ----------------
router.get('/events', requireRoles('readInventory'), (req, res) => sse.handler(req, res));

// ---- helpers ----
function ctx(req) {
  return { userId: req.invUser.id, userRole: req.invUser.role, ip: req.ip };
}
function broadcastChange(storeId, balance) {
  sse.broadcast('inventory.changed', {
    store_id: storeId,
    item_id: balance ? balance.item_id : null,
    quantity: balance ? balance.quantity : null,
  });
}

module.exports = router;
