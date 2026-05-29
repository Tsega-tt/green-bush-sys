'use strict';

/**
 * Phase 3 — purchasing with separation of duties + anti-theft controls.
 *
 *   PR (store mgr) -> F&B approve [-> owner approve if over threshold]
 *      -> PO (purchaser) -> GRN draft (store mgr) -> GRN post (store mgr)
 *
 * Inventory increases ONLY when a GRN is posted (ledger purchase_receipt).
 * 3-way verification = pr.quantity_requested vs po.quantity_ordered vs
 * gr.quantity_received. Posting requires invoice + GRN attachments.
 */

const repos = require('../repositories');
const { pr: prRepo, po: poRepo, grn: grnRepo } = require('../repositories/procurementRepo');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const { applyMovement } = require('./ledgerService');
const { nextNumber } = require('./numbering');
const capabilityService = require('./capabilityService');
const { money, num, qty, cost } = require('./money');
const { Errors } = require('../errors');
const sse = require('../realtime/sse');

const PRICE_SPIKE_PCT = parseFloat(process.env.INVENTORY_PRICE_SPIKE_PCT || '0.2');

function bcast(type, data) { sse.broadcast(type, data); }

// --------------------------- Purchase Requisition ---------------------------
async function createPR(p) {
  if (!Array.isArray(p.lines) || !p.lines.length) throw Errors.validation('At least one line required');
  // A requisition is a REQUEST (needs can_request_items); direct purchasing
  // (can_purchase_directly) is enforced separately at PO creation. This lets
  // stores like Pizza/Kitfo raise requests without being direct buyers.
  await capabilityService.requireCapability(p.storeId, 'can_request_items');
  const estimatedTotal = money(p.lines.reduce((s, l) => s + num(l.quantityRequested) * num(l.estUnitCost), 0));
  const band = await resolveBand(estimatedTotal);

  return withTransaction(async (client) => {
    const header = await prRepo.create(client, {
      prNumber: await nextNumber(client, 'pr'), storeId: p.storeId, status: 'pending_fnb',
      requestedBy: p.userId, notes: p.notes, estimatedTotal, thresholdBand: band ? band.band_name : null,
    });
    let i = 1;
    for (const l of p.lines) {
      await prRepo.addLine(client, header.id, {
        lineNo: i, itemId: l.itemId || null, description: l.description,
        uom: l.uom, quantityRequested: qty(l.quantityRequested),
        estUnitCost: cost(l.estUnitCost), estLineCost: money(num(l.quantityRequested) * num(l.estUnitCost)),
      });
      i += 1;
    }
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'create',
      entityType: 'purchase_requisition', entityId: header.id, storeId: p.storeId, newValue: header });
    return prRepo.getById(client, header.id);
  }).then((r) => { bcast('pr.changed', { id: r.id, status: r.status }); return r; });
}

async function approvePR(p) {
  return withTransaction(async (client) => {
    const r = await prRepo.lockById(client, p.id);
    if (!r) throw Errors.notFound('PR');
    if (r.status !== 'pending_fnb') throw Errors.businessRule(`Cannot approve PR in status ${r.status}`);
    if (Number(r.requested_by) === Number(p.userId)) throw Errors.segregationOfDuties('Requester cannot approve their own PR');

    const lines = await prRepo.getLines(client, p.id);
    const map = new Map((p.lines || []).map((l) => [Number(l.line_id || l.lineId), num(l.quantity_approved ?? l.quantityApproved)]));
    let reduced = false; let anyApproved = false;
    for (const line of lines) {
      const reqd = num(line.quantity_requested);
      const appr = map.has(line.id) ? qty(map.get(line.id)) : reqd;
      if (appr < 0 || appr > reqd) throw Errors.validation(`Invalid approved qty on line ${line.line_no}`);
      await prRepo.setLineApproved(client, line.id, appr);
      if (appr < reqd) reduced = true;
      if (appr > 0) anyApproved = true;
    }
    if (!anyApproved) throw Errors.businessRule('Approve at least one line, or reject');

    const band = await resolveBand(num(r.estimated_total), client);
    const needsOwner = band && band.requires_owner_approval && p.userRole !== 'owner';
    let status;
    if (needsOwner) status = 'pending_owner';
    else status = reduced ? 'partially_approved' : 'approved';
    const updated = await prRepo.updateStatus(client, p.id, {
      status, fnb_approved_by: p.userId, fnb_approved_at: new Date().toISOString(),
    });
    if (band && band.requires_owner_notification) {
      await repos.alerts.emit(client, { alertType: 'high_value_purchase', severity: 'info',
        storeId: r.store_id, entityType: 'purchase_requisition', entityId: r.id,
        message: `High-value PR ${r.pr_number} (${r.estimated_total}) — owner notified`,
        dedupKey: `hv_pr:${r.id}` });
    }
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'fnb_approve',
      entityType: 'purchase_requisition', entityId: p.id, storeId: r.store_id, newValue: { status } });
    return updated;
  }).then((r) => { bcast('pr.changed', { id: r.id, status: r.status }); return r; });
}

async function ownerApprovePR(p) {
  return withTransaction(async (client) => {
    const r = await prRepo.lockById(client, p.id);
    if (!r) throw Errors.notFound('PR');
    if (r.status !== 'pending_owner') throw Errors.businessRule(`PR not awaiting owner approval (status=${r.status})`);
    const lines = await prRepo.getLines(client, p.id);
    const reduced = lines.some((l) => num(l.quantity_approved) < num(l.quantity_requested));
    const updated = await prRepo.updateStatus(client, p.id, {
      status: reduced ? 'partially_approved' : 'approved',
      owner_approved_by: p.userId, owner_approved_at: new Date().toISOString(),
    });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'owner_approve',
      entityType: 'purchase_requisition', entityId: p.id, storeId: r.store_id });
    return updated;
  }).then((r) => { bcast('pr.changed', { id: r.id, status: r.status }); return r; });
}

async function rejectPR(p) {
  if (!p.reason) throw Errors.validation('Rejection reason required');
  return withTransaction(async (client) => {
    const r = await prRepo.lockById(client, p.id);
    if (!r) throw Errors.notFound('PR');
    if (['approved', 'partially_approved', 'rejected', 'closed', 'cancelled'].includes(r.status)) {
      throw Errors.businessRule(`Cannot reject PR in status ${r.status}`);
    }
    const updated = await prRepo.updateStatus(client, p.id, {
      status: 'rejected', rejected_by: p.userId, rejected_at: new Date().toISOString(), rejection_reason: p.reason,
    });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'reject',
      entityType: 'purchase_requisition', entityId: p.id, storeId: r.store_id, note: p.reason });
    return updated;
  }).then((r) => { bcast('pr.changed', { id: r.id, status: r.status }); return r; });
}

// ------------------------------ Purchase Order ------------------------------
async function createPO(p) {
  if (!p.supplierId) throw Errors.validation('supplier_id required');
  if (!Array.isArray(p.lines) || !p.lines.length) throw Errors.validation('At least one line required');

  return withTransaction(async (client) => {
    if (p.prId) {
      const r = await prRepo.lockById(client, p.prId);
      if (!r) throw Errors.notFound('PR');
      if (!['approved', 'partially_approved'].includes(r.status)) {
        throw Errors.businessRule('PR must be approved before raising a PO');
      }
      // Separation of duties: purchaser cannot be requester or approver.
      if ([r.requested_by, r.fnb_approved_by, r.owner_approved_by].map(Number).includes(Number(p.userId))) {
        throw Errors.segregationOfDuties('Purchaser cannot be the requester or approver of the PR');
      }
    }
    const total = money(p.lines.reduce((s, l) => s + num(l.quantityOrdered) * num(l.unitCost), 0));
    const header = await poRepo.create(client, {
      poNumber: await nextNumber(client, 'po'), prId: p.prId, supplierId: p.supplierId,
      status: 'issued', purchaserId: p.userId, orderDate: p.orderDate, expectedDate: p.expectedDate,
      total, notes: p.notes,
    });
    let i = 1;
    for (const l of p.lines) {
      await poRepo.addLine(client, header.id, {
        lineNo: i, itemId: l.itemId, description: l.description, uom: l.uom,
        quantityOrdered: qty(l.quantityOrdered), unitCost: cost(l.unitCost),
        lineTotal: money(num(l.quantityOrdered) * num(l.unitCost)),
      });
      i += 1;
    }
    if (p.prId) await prRepo.updateStatus(client, p.prId, { status: 'closed' });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'create',
      entityType: 'purchase_order', entityId: header.id, newValue: header });
    return poRepo.getById(client, header.id);
  }).then((r) => { bcast('po.changed', { id: r.id, status: r.status }); return r; });
}

// ------------------------------ Goods Receipt -------------------------------
async function createGRN(p) {
  if (!p.poId) throw Errors.validation('po_id required');
  if (!Array.isArray(p.lines) || !p.lines.length) throw Errors.validation('At least one received line required');

  return withTransaction(async (client) => {
    const po = await poRepo.lockById(client, p.poId);
    if (!po) throw Errors.notFound('PO');
    if (['closed', 'cancelled'].includes(po.status)) throw Errors.businessRule('PO is closed');
    enforceStore(p, p.storeId, 'receive');

    const header = await grnRepo.create(client, {
      grNumber: await nextNumber(client, 'gr'), poId: p.poId, storeId: p.storeId,
      supplierId: po.supplier_id, receivedBy: p.userId,
      invoiceNumber: p.invoiceNumber, grnNumber: p.grnNumber, deliveryNoteNumber: p.deliveryNoteNumber,
    });
    let hasVariance = false;
    for (const l of p.lines) {
      const poLine = await poRepo.getLine(client, l.poLineId);
      if (!poLine || Number(poLine.po_id) !== Number(p.poId)) throw Errors.validation(`Invalid po_line ${l.poLineId}`);
      const received = qty(l.quantityReceived);
      const variance = qty(received - num(poLine.quantity_ordered));
      if (variance !== 0) hasVariance = true;
      await grnRepo.addLine(client, header.id, {
        poLineId: l.poLineId, itemId: poLine.item_id, uom: poLine.uom,
        quantityReceived: received, quantityRejected: qty(l.quantityRejected || 0),
        rejectionReason: l.rejectionReason, unitCost: cost(l.unitCost != null ? l.unitCost : poLine.unit_cost),
        varianceQty: variance, batchNumber: l.batchNumber, mfgDate: l.mfgDate, expiryDate: l.expiryDate,
      });
    }
    await grnRepo.updateStatus(client, header.id, { has_variance: hasVariance });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'create',
      entityType: 'goods_receipt', entityId: header.id, storeId: p.storeId, newValue: { has_variance: hasVariance } });
    return grnRepo.getById(client, header.id);
  }).then((r) => { bcast('grn.changed', { id: r.id, status: r.status }); return r; });
}

/** Post a GRN: the ONLY path that increases purchased inventory. */
async function postGRN(p) {
  // Mandatory documents (checked outside the txn — read-only).
  const pool = getPool();
  const hasInvoice = await repos.attachments.hasDoc(pool, 'goods_receipt', p.id, 'invoice');
  const hasGrnDoc = await repos.attachments.hasDoc(pool, 'goods_receipt', p.id, 'grn');
  if (!hasInvoice || !hasGrnDoc) {
    await repos.alerts.emit(pool, {
      alertType: !hasInvoice ? 'missing_invoice' : 'missing_grn', severity: 'warning',
      entityType: 'goods_receipt', entityId: p.id,
      message: `GRN ${p.id} cannot be posted: missing ${!hasInvoice ? 'invoice' : 'GRN'} document`,
      dedupKey: `missing_doc:${p.id}`,
    });
    throw Errors.businessRule('Invoice and GRN documents must be uploaded before posting');
  }

  return withTransaction(async (client) => {
    const gr = await grnRepo.lockById(client, p.id);
    if (!gr) throw Errors.notFound('GRN');
    if (gr.status !== 'draft') throw Errors.businessRule(`GRN already ${gr.status}`);
    const po = await poRepo.lockById(client, gr.po_id);
    if (Number(po.purchaser_id) === Number(p.userId)) {
      throw Errors.segregationOfDuties('Purchaser cannot receive their own PO');
    }
    enforceStore(p, gr.store_id, 'receive');

    const lines = await grnRepo.getLines(client, p.id);
    for (const line of lines) {
      const accepted = qty(num(line.quantity_received) - num(line.quantity_rejected));
      if (accepted <= 0) continue;
      await applyMovement(client, {
        storeId: gr.store_id, itemId: line.item_id, direction: 'in', type: 'purchase_receipt',
        quantity: accepted, unitCost: num(line.unit_cost),
        batch: { supplierId: gr.supplier_id, grId: gr.id, batchNumber: line.batch_number,
          mfgDate: line.mfg_date, expiryDate: line.expiry_date },
        referenceType: 'goods_receipt', referenceId: gr.id,
        userId: p.userId, userRole: p.userRole, note: `GRN ${gr.gr_number}`,
      });
      await poRepo.addReceived(client, line.po_line_id, accepted);
      await checkPriceSpike(client, line.item_id, num(line.unit_cost), gr);
      if (num(line.variance_qty) !== 0) {
        await repos.alerts.emit(client, { alertType: 'large_variance', severity: 'warning',
          storeId: gr.store_id, itemId: line.item_id, entityType: 'goods_receipt', entityId: gr.id,
          message: `3-way variance on GRN ${gr.gr_number}: ordered vs received differ by ${line.variance_qty}`,
          details: { variance_qty: line.variance_qty }, dedupKey: `grn_var:${gr.id}:${line.id}` });
      }
    }
    // PO completion status
    const refreshed = await poRepo.getById(client, gr.po_id);
    const fullyReceived = refreshed.lines.every((l) => num(l.quantity_received) >= num(l.quantity_ordered));
    await poRepo.updateStatus(client, gr.po_id, { status: fullyReceived ? 'received' : 'partially_received' });

    const posted = await grnRepo.updateStatus(client, p.id, {
      status: 'posted', posted_at: new Date().toISOString(), posted_by: p.userId,
    });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'post',
      entityType: 'goods_receipt', entityId: p.id, storeId: gr.store_id, newValue: { status: 'posted' } });
    return posted;
  }).then((r) => { bcast('grn.changed', { id: r.id, status: r.status }); bcast('inventory.changed', { store_id: r.store_id }); return r; });
}

async function checkPriceSpike(client, itemId, unitCost, gr) {
  const { rows } = await client.query(
    `SELECT AVG(unit_cost)::numeric(14,4) AS avg_cost
       FROM (SELECT unit_cost FROM item_price_history
              WHERE item_id=$1 ORDER BY effective_date DESC, id DESC OFFSET 1 LIMIT 5) t`,
    [itemId]
  );
  const avg = num(rows[0] && rows[0].avg_cost);
  if (avg > 0 && unitCost > avg * (1 + PRICE_SPIKE_PCT)) {
    await repos.alerts.emit(client, { alertType: 'price_increase', severity: 'warning',
      storeId: gr.store_id, itemId, entityType: 'goods_receipt', entityId: gr.id,
      message: `Price increase: ${unitCost} vs avg ${avg} (> ${Math.round(PRICE_SPIKE_PCT * 100)}%)`,
      details: { current: unitCost, avg }, dedupKey: `price_spike:${itemId}:${gr.id}` });
  }
}

async function resolveBand(amount, client) {
  const db = client || getPool();
  const bands = await repos.thresholds.listActive(db);
  return bands.find((b) => num(amount) >= num(b.min_amount) && (b.max_amount == null || num(amount) < num(b.max_amount))) || null;
}

function enforceStore(p, storeId, action) {
  if (['admin', 'owner', 'fnb_manager'].includes(p.userRole)) return;
  if (p.actingStoreId == null || Number(p.actingStoreId) !== Number(storeId)) {
    throw Errors.forbidden(`Only the destination store may ${action}`);
  }
}

const reads = {
  listPR: (q) => prRepo.list(getPool(), q),
  getPR: (id) => prRepo.getById(getPool(), id),
  listPO: (q) => poRepo.list(getPool(), q),
  getPO: (id) => poRepo.getById(getPool(), id),
  listGRN: (q) => grnRepo.list(getPool(), q),
  getGRN: (id) => grnRepo.getById(getPool(), id),
};

module.exports = {
  createPR, approvePR, ownerApprovePR, rejectPR,
  createPO, createGRN, postGRN, reads,
};
