'use strict';

/**
 * Phase 2 — transfer lifecycle:
 *   draft/submitted -> pending_fnb -> approved|partially_approved|rejected
 *                   -> sent (source -ledger) -> received (dest +ledger) -> closed
 *
 * Stock moves ONLY at send (transfer_out) and receive (transfer_in), both via
 * the ledger engine's applyMovement inside ONE transaction (atomic, locked,
 * non-negative). Cost travels with goods (sent_unit_cost -> transfer_in).
 * Separation of duties: approver != requester, receiver != sender.
 */

const repos = require('../repositories');
const { transfers: tRepo } = require('../repositories/transferRepo');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const { applyMovement } = require('./ledgerService');
const { nextNumber } = require('./numbering');
const capabilityService = require('./capabilityService');
const businessDate = require('./businessDate');
const { qty, num } = require('./money');
const { Errors } = require('../errors');
const sse = require('../realtime/sse');

const TERMINAL = ['rejected', 'closed', 'cancelled'];

async function audit(client, a) { return repos.audit.insert(client, a); }

async function createTransfer(p) {
  if (!p.sourceStoreId || !p.destStoreId) throw Errors.validation('source and destination store required');
  if (Number(p.sourceStoreId) === Number(p.destStoreId)) throw Errors.validation('source and destination must differ');
  if (!Array.isArray(p.lines) || !p.lines.length) throw Errors.validation('at least one line required');
  await capabilityService.requireCapability(p.sourceStoreId, 'can_transfer');
  await capabilityService.requireCapability(p.destStoreId, 'can_receive_transfers');

  return withTransaction(async (client) => {
    const header = await tRepo.create(client, {
      transferNumber: await nextNumber(client, 'transfer'),
      sourceStoreId: p.sourceStoreId, destStoreId: p.destStoreId,
      sourceRequestRef: p.sourceRequestRef, status: 'pending_fnb',
      requestedBy: p.userId, notes: p.notes,
    });
    let i = 1;
    for (const l of p.lines) {
      const item = await repos.items.getById(client, l.itemId);
      if (!item) throw Errors.notFound(`Item ${l.itemId}`);
      await tRepo.addLine(client, header.id, {
        lineNo: i, itemId: l.itemId, uom: l.uom || item.uom,
        quantityRequested: qty(l.quantity),
      });
      i += 1;
    }
    await audit(client, { actorId: p.userId, actorRole: p.userRole, action: 'create',
      entityType: 'transfer', entityId: header.id, storeId: p.sourceStoreId, newValue: header });
    return tRepo.getById(client, header.id);
  }).then((t) => { sse.broadcast('transfer.changed', { id: t.id, status: t.status }); return t; });
}

async function approve(p) {
  return withTransaction(async (client) => {
    const t = await tRepo.lockById(client, p.id);
    if (!t) throw Errors.notFound('Transfer');
    if (t.status !== 'pending_fnb') throw Errors.businessRule(`Cannot approve a transfer in status ${t.status}`);
    if (Number(t.requested_by) === Number(p.userId)) {
      throw Errors.segregationOfDuties('Requester cannot approve their own transfer');
    }
    const lines = await tRepo.getLines(client, p.id);
    const approvals = new Map((p.lines || []).map((l) => [Number(l.line_id || l.lineId), num(l.quantity_approved ?? l.quantityApproved)]));
    let anyReduced = false;
    let anyApproved = false;
    for (const line of lines) {
      const requested = num(line.quantity_requested);
      const approved = approvals.has(line.id) ? qty(approvals.get(line.id)) : requested;
      if (approved < 0 || approved > requested) throw Errors.validation(`Invalid approved qty on line ${line.line_no}`);
      await tRepo.setLineApproved(client, line.id, approved);
      if (approved < requested) anyReduced = true;
      if (approved > 0) anyApproved = true;
    }
    if (!anyApproved) throw Errors.businessRule('At least one line must be approved (use reject instead)');
    const status = anyReduced ? 'partially_approved' : 'approved';
    const updated = await tRepo.updateStatus(client, p.id, {
      status, approved_by: p.userId, approved_at: new Date().toISOString(),
    });
    await audit(client, { actorId: p.userId, actorRole: p.userRole, action: 'approve',
      entityType: 'transfer', entityId: p.id, storeId: t.source_store_id, newValue: { status } });
    return updated;
  }).then((t) => { sse.broadcast('transfer.changed', { id: t.id, status: t.status }); return t; });
}

async function reject(p) {
  if (!p.reason || !String(p.reason).trim()) throw Errors.validation('Rejection reason required');
  return withTransaction(async (client) => {
    const t = await tRepo.lockById(client, p.id);
    if (!t) throw Errors.notFound('Transfer');
    if (TERMINAL.includes(t.status) || ['sent', 'received'].includes(t.status)) {
      throw Errors.businessRule(`Cannot reject a transfer in status ${t.status}`);
    }
    const updated = await tRepo.updateStatus(client, p.id, {
      status: 'rejected', rejected_by: p.userId, rejected_at: new Date().toISOString(),
      rejection_reason: p.reason,
    });
    await audit(client, { actorId: p.userId, actorRole: p.userRole, action: 'reject',
      entityType: 'transfer', entityId: p.id, storeId: t.source_store_id, note: p.reason });
    return updated;
  }).then((t) => { sse.broadcast('transfer.changed', { id: t.id, status: t.status }); return t; });
}

/** Source store dispatches: deduct approved quantities via the ledger. */
async function send(p) {
  return withTransaction(async (client) => {
    const t = await tRepo.lockById(client, p.id);
    if (!t) throw Errors.notFound('Transfer');
    if (!['approved', 'partially_approved'].includes(t.status)) {
      throw Errors.businessRule(`Transfer must be approved before sending (status=${t.status})`);
    }
    enforceStore(p, t.source_store_id, 'dispatch');
    const lines = await tRepo.getLines(client, p.id);
    for (const line of lines) {
      const sendQty = qty(num(line.quantity_approved));
      if (sendQty <= 0) continue;
      const r = await applyMovement(client, {
        storeId: t.source_store_id, itemId: line.item_id, direction: 'out',
        type: 'transfer_out', quantity: sendQty, counterpartyStoreId: t.dest_store_id,
        referenceType: 'transfer', referenceId: t.id,
        userId: p.userId, userRole: p.userRole, note: `Transfer ${t.transfer_number} dispatch`,
      });
      // WAC unchanged on out-move => current balance WAC is the cost that travels.
      await tRepo.setLineSent(client, line.id, sendQty, num(r.balance.weighted_avg_cost));
    }
    const updated = await tRepo.updateStatus(client, p.id, {
      status: 'sent', sent_by: p.userId, sent_at: new Date().toISOString(),
    });
    await audit(client, { actorId: p.userId, actorRole: p.userRole, action: 'send',
      entityType: 'transfer', entityId: p.id, storeId: t.source_store_id, newValue: { status: 'sent' } });
    return updated;
  }).then((t) => { sse.broadcast('transfer.changed', { id: t.id, status: t.status }); return t; });
}

/** Destination store confirms receipt: increase dest stock at carried cost. */
async function receive(p) {
  return withTransaction(async (client) => {
    const t = await tRepo.lockById(client, p.id);
    if (!t) throw Errors.notFound('Transfer');
    if (t.status !== 'sent') throw Errors.businessRule(`Transfer must be sent before receiving (status=${t.status})`);
    if (Number(t.sent_by) === Number(p.userId)) {
      throw Errors.segregationOfDuties('Sender cannot confirm receipt of the same transfer');
    }
    enforceStore(p, t.dest_store_id, 'receive');
    const lines = await tRepo.getLines(client, p.id);
    const recvMap = new Map((p.lines || []).map((l) => [Number(l.line_id || l.lineId), num(l.quantity_received ?? l.quantityReceived)]));
    let variance = false;
    for (const line of lines) {
      const sent = num(line.quantity_sent);
      if (sent <= 0) continue;
      const received = recvMap.has(line.id) ? qty(recvMap.get(line.id)) : sent;
      if (received < 0) throw Errors.validation(`Invalid received qty on line ${line.line_no}`);
      if (received > 0) {
        await applyMovement(client, {
          storeId: t.dest_store_id, itemId: line.item_id, direction: 'in',
          type: 'transfer_in', quantity: received, unitCost: num(line.sent_unit_cost),
          counterpartyStoreId: t.source_store_id,
          batch: { unitCost: num(line.sent_unit_cost) },
          referenceType: 'transfer', referenceId: t.id,
          userId: p.userId, userRole: p.userRole, note: `Transfer ${t.transfer_number} receipt`,
        });
      }
      await tRepo.setLineReceived(client, line.id, received);
      if (received !== sent) variance = true;
    }
    const updated = await tRepo.updateStatus(client, p.id, {
      status: 'received', received_by: p.userId, received_at: new Date().toISOString(),
    });
    if (variance) {
      await repos.alerts.emit(client, {
        alertType: 'transfer_variance', severity: 'warning',
        storeId: t.dest_store_id, entityType: 'transfer', entityId: t.id,
        message: `Transfer ${t.transfer_number} received with variance (sent != received)`,
        dedupKey: `transfer_variance:${t.id}`,
      });
    }
    await audit(client, { actorId: p.userId, actorRole: p.userRole, action: 'receive',
      entityType: 'transfer', entityId: p.id, storeId: t.dest_store_id,
      newValue: { status: 'received', variance } });
    return updated;
  }).then((t) => { sse.broadcast('transfer.changed', { id: t.id, status: t.status }); return t; });
}

async function close(p) {
  return withTransaction(async (client) => {
    const t = await tRepo.lockById(client, p.id);
    if (!t) throw Errors.notFound('Transfer');
    if (t.status !== 'received') throw Errors.businessRule(`Only received transfers can be closed (status=${t.status})`);
    const updated = await tRepo.updateStatus(client, p.id, { status: 'closed' });
    await audit(client, { actorId: p.userId, actorRole: p.userRole, action: 'close',
      entityType: 'transfer', entityId: p.id, storeId: t.dest_store_id });
    return updated;
  }).then((t) => { sse.broadcast('transfer.changed', { id: t.id, status: t.status }); return t; });
}

function enforceStore(p, storeId, action) {
  const privileged = ['admin', 'owner', 'fnb_manager'].includes(p.userRole);
  if (privileged) return;
  if (p.actingStoreId == null || Number(p.actingStoreId) !== Number(storeId)) {
    throw Errors.forbidden(`Only the ${action === 'dispatch' ? 'source' : 'destination'} store may ${action}`);
  }
}

const reads = {
  list: (q) => tRepo.list(getPool(), q),
  get: (id) => tRepo.getById(getPool(), id),
};

module.exports = { createTransfer, approve, reject, send, receive, close, reads };
