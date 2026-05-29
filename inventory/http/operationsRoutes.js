'use strict';

const express = require('express');
const svc = require('../services/operationsService');
const { resolveUser, requireRoles, asyncHandler, ok } = require('./permissions');
const V = require('./validators');

const router = express.Router();
router.use(resolveUser);

function actor(req) {
  return { userId: req.invUser.id, userRole: req.invUser.role, actingStoreId: req.invUser.storeId };
}

// ---------------- waste ----------------
router.get('/waste', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { waste: await svc.reads.listWaste({
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
    from: req.query.from || null, to: req.query.to || null,
  }) });
}));
router.post('/waste', requireRoles('operations'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id', 'item_id', 'quantity', 'reason']);
  ok(res, await svc.recordWaste({
    storeId: V.toInt(req.body.store_id, 'store_id'), itemId: V.toInt(req.body.item_id, 'item_id'),
    quantity: V.positiveNum(req.body.quantity, 'quantity'), reason: req.body.reason, ...actor(req),
  }), 201);
}));

// ---------------- stock counts ----------------
router.get('/stock-counts', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { counts: await svc.reads.listCounts({
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null, status: req.query.status || null,
  }) });
}));
router.get('/stock-counts/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { count: await svc.reads.getCount(V.toInt(req.params.id, 'id')) });
}));
router.post('/stock-counts', requireRoles('operations'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id']);
  ok(res, { count: await svc.createCount({
    storeId: V.toInt(req.body.store_id, 'store_id'), isBlind: V.optBool(req.body.is_blind, false),
    note: req.body.note, itemIds: req.body.item_ids || null, ...actor(req),
  }) }, 201);
}));
router.patch('/stock-counts/:id/enter', requireRoles('operations'), asyncHandler(async (req, res) => {
  ok(res, { count: await svc.enterCounts({ id: V.toInt(req.params.id, 'id'), lines: req.body.lines || [], ...actor(req) }) });
}));
router.patch('/stock-counts/:id/finalize', requireRoles('operations'), asyncHandler(async (req, res) => {
  ok(res, { count: await svc.finalizeCount({ id: V.toInt(req.params.id, 'id'), ...actor(req) }) });
}));

// ---------------- daily closing ----------------
router.get('/daily-closing', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { closings: await svc.reads.listClosings({
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
  }) });
}));
router.post('/daily-closing/generate', requireRoles('operations'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id']);
  ok(res, { closing: await svc.generateClosing({
    storeId: V.toInt(req.body.store_id, 'store_id'), businessDate: req.body.business_date || null, ...actor(req),
  }) }, 201);
}));
router.post('/daily-closing/confirm', requireRoles('operations'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id']);
  ok(res, { closing: await svc.confirmClosing({
    storeId: V.toInt(req.body.store_id, 'store_id'), businessDate: req.body.business_date || null,
    physicalValue: req.body.physical_value != null ? V.nonNegNum(req.body.physical_value, 'physical_value') : null,
    ...actor(req),
  }) });
}));

// ---------------- kegs ----------------
router.get('/kegs', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { kegs: await svc.reads.listKegs({
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null, status: req.query.status || null,
  }) });
}));
router.get('/kegs/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { keg: await svc.reads.getKeg(V.toInt(req.params.id, 'id')) });
}));
router.post('/kegs', requireRoles('kegs'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id', 'size_liters']);
  ok(res, { keg: await svc.receiveKeg({
    storeId: V.toInt(req.body.store_id, 'store_id'), kegCode: req.body.keg_code,
    sizeLiters: V.positiveNum(req.body.size_liters, 'size_liters'),
    itemId: req.body.item_id ? V.toInt(req.body.item_id, 'item_id') : null,
    supplierId: req.body.supplier_id ? V.toInt(req.body.supplier_id, 'supplier_id') : null,
    unitCost: req.body.unit_cost != null ? V.nonNegNum(req.body.unit_cost, 'unit_cost') : 0, ...actor(req),
  }) }, 201);
}));
router.patch('/kegs/:id/event', requireRoles('kegs'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['event_type']);
  ok(res, { keg: await svc.kegEvent({
    id: V.toInt(req.params.id, 'id'), eventType: req.body.event_type,
    liters: req.body.liters != null ? V.nonNegNum(req.body.liters, 'liters') : 0,
    note: req.body.note, ...actor(req),
  }) });
}));

module.exports = router;
