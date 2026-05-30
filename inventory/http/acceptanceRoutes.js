'use strict';

const express = require('express');
const svc = require('../services/acceptanceService');
const { resolveUser, requireRoles, asyncHandler, ok } = require('./permissions');
const V = require('./validators');
const { Errors } = require('../errors');

const router = express.Router();
router.use(resolveUser);

const PRIV = ['admin', 'owner', 'fnb_manager'];
const STORE_ROLES = ['store_manager', 'store_admin'];

function ctx(req) {
  return { userId: req.invUser.id, userRole: req.invUser.role };
}

// ---- Purchaser submits a batch of purchased items (after buying) ----
router.post('/acceptance/batches', requireRoles('purchasing'), asyncHandler(async (req, res) => {
  const b = req.body || {};
  const batch = await svc.createBatch({
    ...ctx(req),
    purchaserName: b.purchaser_name,
    prId: b.pr_id ? V.toInt(b.pr_id, 'pr_id') : null,
    supplierId: b.supplier_id ? V.toInt(b.supplier_id, 'supplier_id') : null,
    supplierName: b.supplier_name, supplierInfo: b.supplier_info,
    invoiceNumber: b.invoice_number, grnNumber: b.grn_number, notes: b.notes,
    items: (b.items || []).map((it) => ({
      itemId: it.item_id ? V.toInt(it.item_id, 'item_id') : null,
      isNewItem: !!it.is_new_item,
      itemCode: it.item_code, description: it.description, category: it.category,
      subCategory: it.sub_category, itemType: it.item_type,
      uom: it.uom, uomAttributes: it.uom_attributes,
      isPerishable: it.is_perishable, trackBatches: it.track_batches,
      defaultMinQty: it.default_min_qty, defaultReorder: it.default_reorder,
      specifications: it.specifications, storageRequirements: it.storage_requirements,
      quantity: V.positiveNum(it.quantity, 'quantity'),
      unitCost: it.unit_cost != null ? V.nonNegNum(it.unit_cost, 'unit_cost') : 0,
      destinationStoreId: V.toInt(it.destination_store_id, 'destination_store_id'),
    })),
  });
  ok(res, { batch }, 201);
}));

// ---- Listing (role-scoped) ----
// F&B / admin: items awaiting their review (or any status via ?status=).
// Store admin: ONLY items routed to their own store.
// Purchaser: their own submissions (to see rejections).
router.get('/acceptance/items', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const u = req.invUser;
  const opts = {};
  if (req.query.status) opts.status = String(req.query.status).split(',');
  if (req.query.store_id) opts.storeId = V.toInt(req.query.store_id, 'store_id');
  if (req.query.batch_id) opts.batchId = V.toInt(req.query.batch_id, 'batch_id');

  if (STORE_ROLES.includes(u.role) && !PRIV.includes(u.role)) {
    // Hard-scope store admins to their assigned store.
    if (u.storeId == null) return ok(res, { items: [] });
    opts.storeId = u.storeId;
    if (!opts.status) opts.status = ['awaiting_store', 'store_accepted', 'store_rejected', 'added_to_inventory'];
  } else if (u.role === 'purchaser' && !PRIV.includes(u.role)) {
    opts.purchaserId = u.id;
  }
  ok(res, { items: await svc.listItems(opts) });
}));

router.get('/acceptance/items/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const item = await svc.getItem(V.toInt(req.params.id, 'id'));
  if (!item) throw Errors.notFound('Acceptance item');
  const u = req.invUser;
  if (STORE_ROLES.includes(u.role) && !PRIV.includes(u.role) && Number(item.destination_store_id) !== Number(u.storeId)) {
    throw Errors.forbidden('Item is not assigned to your store');
  }
  ok(res, { item });
}));

router.get('/acceptance/batches/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const batch = await svc.getBatch(V.toInt(req.params.id, 'id'));
  if (!batch) throw Errors.notFound('Acceptance batch');
  ok(res, { batch });
}));

// ---- F&B Manager per-item decision ----
router.patch('/acceptance/items/:id/fnb', requireRoles('approveRequests'), asyncHandler(async (req, res) => {
  const item = await svc.fnbDecision({
    ...ctx(req), id: V.toInt(req.params.id, 'id'),
    decision: req.body.decision, reason: req.body.reason,
  });
  ok(res, { item });
}));

// ---- Store Admin per-item decision (accept posts to inventory) ----
router.patch('/acceptance/items/:id/store', requireRoles('receiveGoods'), asyncHandler(async (req, res) => {
  const u = req.invUser;
  const existing = await svc.getItem(V.toInt(req.params.id, 'id'));
  if (!existing) throw Errors.notFound('Acceptance item');
  if (!PRIV.includes(u.role) && Number(existing.destination_store_id) !== Number(u.storeId)) {
    throw Errors.forbidden('Item is not assigned to your store');
  }
  const item = await svc.storeDecision({
    ...ctx(req), id: V.toInt(req.params.id, 'id'),
    decision: req.body.decision, reason: req.body.reason,
  });
  ok(res, { item });
}));

module.exports = router;
