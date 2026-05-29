'use strict';

const express = require('express');
const svc = require('../services/transferService');
const { resolveUser, requireRoles, asyncHandler, ok } = require('./permissions');
const V = require('./validators');

const router = express.Router();
router.use(resolveUser);

function actor(req) {
  return { userId: req.invUser.id, userRole: req.invUser.role, actingStoreId: req.invUser.storeId };
}

router.get('/transfers', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { transfers: await svc.reads.list({
    status: req.query.status || null,
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
  }) });
}));

router.get('/transfers/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const t = await svc.reads.get(V.toInt(req.params.id, 'id'));
  if (!t) return ok(res, { transfer: null });
  ok(res, { transfer: t });
}));

router.post('/transfers', requireRoles('transfersManage'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['source_store_id', 'dest_store_id', 'lines']);
  const t = await svc.createTransfer({
    sourceStoreId: V.toInt(req.body.source_store_id, 'source_store_id'),
    destStoreId: V.toInt(req.body.dest_store_id, 'dest_store_id'),
    sourceRequestRef: req.body.source_request_ref || null, notes: req.body.notes,
    lines: (req.body.lines || []).map((l) => ({ itemId: V.toInt(l.item_id, 'item_id'),
      quantity: V.positiveNum(l.quantity, 'quantity'), uom: l.uom })),
    ...actor(req),
  });
  ok(res, { transfer: t }, 201);
}));

router.patch('/transfers/:id/approve', requireRoles('approveRequests'), asyncHandler(async (req, res) => {
  ok(res, { transfer: await svc.approve({ id: V.toInt(req.params.id, 'id'), lines: req.body.lines || [], ...actor(req) }) });
}));

router.patch('/transfers/:id/reject', requireRoles('approveRequests'), asyncHandler(async (req, res) => {
  ok(res, { transfer: await svc.reject({ id: V.toInt(req.params.id, 'id'), reason: req.body.reason, ...actor(req) }) });
}));

router.patch('/transfers/:id/send', requireRoles('transfersManage'), asyncHandler(async (req, res) => {
  ok(res, { transfer: await svc.send({ id: V.toInt(req.params.id, 'id'), ...actor(req) }) });
}));

router.patch('/transfers/:id/receive', requireRoles('transfersManage'), asyncHandler(async (req, res) => {
  ok(res, { transfer: await svc.receive({ id: V.toInt(req.params.id, 'id'), lines: req.body.lines || [], ...actor(req) }) });
}));

router.patch('/transfers/:id/close', requireRoles('transfersManage'), asyncHandler(async (req, res) => {
  ok(res, { transfer: await svc.close({ id: V.toInt(req.params.id, 'id'), ...actor(req) }) });
}));

module.exports = router;
