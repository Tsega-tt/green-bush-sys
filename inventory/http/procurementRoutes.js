'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const svc = require('../services/procurementService');
const attachments = require('../services/attachmentService');
const { resolveUser, requireRoles, asyncHandler, ok, sendError } = require('./permissions');
const { Errors } = require('../errors');
const V = require('./validators');

// multer writes to a temp dir; attachmentService moves the file to permanent storage.
const tmpDir = path.join(os.tmpdir(), 'inv_uploads');
fs.mkdirSync(tmpDir, { recursive: true });
const upload = multer({
  dest: tmpDir,
  limits: { fileSize: parseInt(process.env.INVENTORY_MAX_UPLOAD_BYTES || '20971520', 10) }, // 20MB
});

const router = express.Router();
router.use(resolveUser);

function actor(req) {
  return { userId: req.invUser.id, userRole: req.invUser.role, actingStoreId: req.invUser.storeId };
}

// ---------------- Purchase Requisitions ----------------
router.get('/purchase-requisitions', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { requisitions: await svc.reads.listPR({
    status: req.query.status || null, storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
  }) });
}));
router.get('/purchase-requisitions/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { requisition: await svc.reads.getPR(V.toInt(req.params.id, 'id')) });
}));
router.post('/purchase-requisitions', requireRoles('receiveGoods'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id', 'lines']);
  ok(res, { requisition: await svc.createPR({
    storeId: V.toInt(req.body.store_id, 'store_id'), notes: req.body.notes,
    lines: (req.body.lines || []).map((l) => ({ itemId: l.item_id || null, description: l.description,
      uom: l.uom, quantityRequested: V.positiveNum(l.quantity_requested, 'quantity_requested'),
      estUnitCost: l.est_unit_cost != null ? V.nonNegNum(l.est_unit_cost, 'est_unit_cost') : 0 })),
    ...actor(req),
  }) }, 201);
}));
router.patch('/purchase-requisitions/:id/approve', requireRoles('approveRequests'), asyncHandler(async (req, res) => {
  ok(res, { requisition: await svc.approvePR({ id: V.toInt(req.params.id, 'id'), lines: req.body.lines || [], ...actor(req) }) });
}));
router.patch('/purchase-requisitions/:id/owner-approve', requireRoles('ownerApprove'), asyncHandler(async (req, res) => {
  ok(res, { requisition: await svc.ownerApprovePR({ id: V.toInt(req.params.id, 'id'), ...actor(req) }) });
}));
router.patch('/purchase-requisitions/:id/reject', requireRoles('approveRequests'), asyncHandler(async (req, res) => {
  ok(res, { requisition: await svc.rejectPR({ id: V.toInt(req.params.id, 'id'), reason: req.body.reason, ...actor(req) }) });
}));

// ---------------- Purchase Orders (purchaser) ----------------
router.get('/purchase-orders', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { orders: await svc.reads.listPO({ status: req.query.status || null,
    supplierId: req.query.supplier_id ? V.toInt(req.query.supplier_id, 'supplier_id') : null }) });
}));
router.get('/purchase-orders/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { order: await svc.reads.getPO(V.toInt(req.params.id, 'id')) });
}));
router.post('/purchase-orders', requireRoles('purchasing'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['supplier_id', 'lines']);
  ok(res, { order: await svc.createPO({
    prId: req.body.pr_id ? V.toInt(req.body.pr_id, 'pr_id') : null,
    supplierId: V.toInt(req.body.supplier_id, 'supplier_id'),
    orderDate: req.body.order_date || null, expectedDate: req.body.expected_date || null, notes: req.body.notes,
    lines: (req.body.lines || []).map((l) => ({ itemId: V.toInt(l.item_id, 'item_id'), description: l.description,
      uom: l.uom, quantityOrdered: V.positiveNum(l.quantity_ordered, 'quantity_ordered'),
      unitCost: V.nonNegNum(l.unit_cost, 'unit_cost') })),
    ...actor(req),
  }) }, 201);
}));

// ---------------- Goods Receipts ----------------
router.get('/goods-receipts', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { receipts: await svc.reads.listGRN({ status: req.query.status || null,
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
    poId: req.query.po_id ? V.toInt(req.query.po_id, 'po_id') : null }) });
}));
router.get('/goods-receipts/:id', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { receipt: await svc.reads.getGRN(V.toInt(req.params.id, 'id')) });
}));
router.post('/goods-receipts', requireRoles('receiveGoods'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['po_id', 'store_id', 'lines']);
  ok(res, { receipt: await svc.createGRN({
    poId: V.toInt(req.body.po_id, 'po_id'), storeId: V.toInt(req.body.store_id, 'store_id'),
    invoiceNumber: req.body.invoice_number, grnNumber: req.body.grn_number,
    deliveryNoteNumber: req.body.delivery_note_number,
    lines: (req.body.lines || []).map((l) => ({ poLineId: V.toInt(l.po_line_id, 'po_line_id'),
      quantityReceived: V.nonNegNum(l.quantity_received, 'quantity_received'),
      quantityRejected: l.quantity_rejected != null ? V.nonNegNum(l.quantity_rejected, 'quantity_rejected') : 0,
      rejectionReason: l.rejection_reason, unitCost: l.unit_cost,
      batchNumber: l.batch_number, mfgDate: l.mfg_date, expiryDate: l.expiry_date })),
    ...actor(req),
  }) }, 201);
}));
router.patch('/goods-receipts/:id/post', requireRoles('receiveGoods'), asyncHandler(async (req, res) => {
  ok(res, { receipt: await svc.postGRN({ id: V.toInt(req.params.id, 'id'), ...actor(req) }) });
}));

// ---------------- Attachments (PR/PO/GRN/invoice/...) ----------------
router.post('/attachments', requireRoles('attachmentsUpload'), (req, res) => {
  upload.single('file')(req, res, async (err) => {
    if (err) return sendError(res, Errors.validation(err.message));
    try {
      if (!req.body.entity_type || !req.body.entity_id) throw Errors.validation('entity_type and entity_id required');
      const row = await attachments.save(req.file, {
        entityType: req.body.entity_type, entityId: V.toInt(req.body.entity_id, 'entity_id'),
        docLabel: req.body.doc_label, userId: req.invUser.id, userRole: req.invUser.role,
      });
      ok(res, { attachment: row }, 201);
    } catch (e) { sendError(res, e); }
  });
});

router.get('/attachments', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  V.requireFields(req.query, ['entity_type', 'entity_id']);
  ok(res, { attachments: await attachments.list(req.query.entity_type, V.toInt(req.query.entity_id, 'entity_id')) });
}));

router.get('/attachments/:id/download', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  const repos = require('../repositories');
  const { getPool } = require('../db/pool');
  const row = await repos.attachments.getById(getPool(), V.toInt(req.params.id, 'id'));
  if (!row || !row.is_active) throw Errors.notFound('Attachment');
  res.download(attachments.streamPath(row), row.original_name);
}));

router.delete('/attachments/:id', requireRoles('attachmentsUpload'), asyncHandler(async (req, res) => {
  ok(res, { attachment: await attachments.remove(V.toInt(req.params.id, 'id'),
    { userId: req.invUser.id, userRole: req.invUser.role }) });
}));

module.exports = router;
