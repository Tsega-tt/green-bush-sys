'use strict';

/**
 * Per-ITEM purchase → F&B review → store acceptance workflow.
 *
 * Flow (each item is tracked independently):
 *   purchaser submits batch  -> items: awaiting_fnb
 *   F&B approves item        -> sent_to_store -> awaiting_store
 *   F&B rejects item         -> fnb_rejected (back to purchaser)
 *   Store accepts item       -> ledger receipt posted -> added_to_inventory
 *   Store rejects item       -> store_rejected (back to F&B/purchaser)
 *
 * Inventory ONLY moves on store-accept, via the same ledger engine as GRNs.
 */

const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const repos = require('../repositories');
const masterData = require('./masterDataService');
const { applyMovement } = require('./ledgerService');
const { Errors } = require('../errors');
const sse = require('../realtime/sse');

function bcast(type, data) { try { sse.broadcast(type, data); } catch { /* best effort */ } }
const num = (v) => Number(v || 0);

/**
 * Purchaser submits a batch of purchased items. New items are created in the
 * inventory master first (full Add-Item payload), then every item is queued
 * for F&B review (status awaiting_fnb). Documents are attached separately via
 * the generic /attachments endpoint (entity_type='acceptance_batch').
 */
async function createBatch(p) {
  if (!Array.isArray(p.items) || p.items.length === 0) throw Errors.validation('At least one item is required');
  return withTransaction(async (client) => {
    const batch = await repos.acceptance.insertBatch(client, {
      prId: p.prId, purchaserId: p.userId, purchaserName: p.purchaserName,
      supplierId: p.supplierId, supplierName: p.supplierName, supplierInfo: p.supplierInfo,
      invoiceNumber: p.invoiceNumber, grnNumber: p.grnNumber, notes: p.notes,
    });

    const created = [];
    for (const it of p.items) {
      if (!it.description) throw Errors.validation('Each item needs a description');
      if (!(num(it.quantity) > 0)) throw Errors.validation(`Quantity must be > 0 for "${it.description}"`);
      if (!it.destinationStoreId) throw Errors.validation(`Destination store is required for "${it.description}"`);

      let itemId = it.itemId || null;
      let isNew = false;
      // "New Item" → create the master item with the full inventory schema.
      if (!itemId && it.isNewItem) {
        const master = await masterData.createItem({
          itemCode: it.itemCode, description: it.description, category: it.category,
          uom: it.uom, isPerishable: it.isPerishable, trackBatches: it.trackBatches,
          defaultMinQty: it.defaultMinQty, defaultReorder: it.defaultReorder,
          uomAttributes: it.uomAttributes,
        }, { userId: p.userId, userRole: p.userRole });
        itemId = master.id;
        isNew = true;
      }

      const row = await repos.acceptance.insertItem(client, batch.id, {
        itemId, isNewItem: isNew, description: it.description, category: it.category,
        subCategory: it.subCategory, itemType: it.itemType, uom: it.uom,
        uomAttributes: it.uomAttributes, specifications: it.specifications,
        storageRequirements: it.storageRequirements, quantity: it.quantity,
        unitCost: it.unitCost, destinationStoreId: it.destinationStoreId,
      });
      await repos.acceptance.addEvent(client, { itemId: row.id, fromStatus: null,
        toStatus: 'awaiting_fnb', actorId: p.userId, actorRole: p.userRole, reason: 'Purchased + documents uploaded' });
      created.push(row);
    }
    return { ...batch, items: created };
  }).then((b) => { bcast('acceptance.changed', { batch_id: b.id, stage: 'fnb' }); return b; });
}

/** F&B Manager decision on a single item: approve → store, reject → purchaser. */
async function fnbDecision(p) {
  const approve = p.decision === 'approve';
  if (!approve && !p.reason) throw Errors.validation('A rejection reason is required');
  return withTransaction(async (client) => {
    const item = await repos.acceptance.lockItem(client, p.id);
    if (!item) throw Errors.notFound('Acceptance item');
    if (item.status !== 'awaiting_fnb') throw Errors.businessRule(`Item is ${item.status}, not awaiting F&B review`);
    const to = approve ? 'sent_to_store' : 'fnb_rejected';
    const updated = await repos.acceptance.updateItem(client, p.id, {
      status: approve ? 'awaiting_store' : 'fnb_rejected',
      fnb_by: p.userId, fnb_at: new Date().toISOString(), fnb_reason: p.reason || null,
    });
    await repos.acceptance.addEvent(client, { itemId: p.id, fromStatus: item.status,
      toStatus: approve ? 'fnb_approved' : 'fnb_rejected', actorId: p.userId, actorRole: p.userRole, reason: p.reason });
    if (approve) {
      await repos.acceptance.addEvent(client, { itemId: p.id, fromStatus: 'fnb_approved',
        toStatus: 'awaiting_store', actorId: p.userId, actorRole: p.userRole, reason: 'Routed to destination store' });
    }
    return updated;
  }).then((r) => { bcast('acceptance.changed', { item_id: r.id, status: r.status, store_id: r.destination_store_id }); return r; });
}

/**
 * Store Admin decision on a single item assigned to their store.
 *   accept → post a ledger receipt (stock + valuation + balance) → added_to_inventory
 *   reject → store_rejected (back to F&B / purchaser)
 */
async function storeDecision(p) {
  const accept = p.decision === 'accept';
  if (!accept && !p.reason) throw Errors.validation('A rejection reason is required');
  return withTransaction(async (client) => {
    const item = await repos.acceptance.lockItem(client, p.id);
    if (!item) throw Errors.notFound('Acceptance item');
    if (item.status !== 'awaiting_store') throw Errors.businessRule(`Item is ${item.status}, not awaiting store acceptance`);

    if (!accept) {
      const rejected = await repos.acceptance.updateItem(client, p.id, {
        status: 'store_rejected', store_by: p.userId, store_at: new Date().toISOString(), store_reason: p.reason,
      });
      await repos.acceptance.addEvent(client, { itemId: p.id, fromStatus: item.status,
        toStatus: 'store_rejected', actorId: p.userId, actorRole: p.userRole, reason: p.reason });
      return rejected;
    }

    if (!item.item_id) throw Errors.businessRule('Item has no master record to stock');
    // Post the receipt into the destination store (idempotent on the item id).
    const r = await applyMovement(client, {
      storeId: item.destination_store_id, itemId: item.item_id, direction: 'in', type: 'purchase_receipt',
      quantity: num(item.quantity), unitCost: num(item.unit_cost),
      batch: { supplierId: item.supplier_id || null },
      referenceType: 'acceptance_item', referenceId: item.id, idempotencyKey: `acc_item:${item.id}`,
      userId: p.userId, userRole: p.userRole, note: `Accepted ${item.batch_number} → ${item.destination_store_name}`,
    });
    const accepted = await repos.acceptance.updateItem(client, p.id, {
      status: 'added_to_inventory', store_by: p.userId, store_at: new Date().toISOString(),
      inventory_txn_id: r.transactions && r.transactions[0] ? r.transactions[0].id : null,
    });
    await repos.acceptance.addEvent(client, { itemId: p.id, fromStatus: item.status,
      toStatus: 'store_accepted', actorId: p.userId, actorRole: p.userRole, reason: 'Accepted into store' });
    await repos.acceptance.addEvent(client, { itemId: p.id, fromStatus: 'store_accepted',
      toStatus: 'added_to_inventory', actorId: p.userId, actorRole: p.userRole, reason: 'Stock + valuation updated' });
    return accepted;
  }).then((r) => {
    bcast('acceptance.changed', { item_id: r.id, status: r.status, store_id: r.destination_store_id });
    if (r.status === 'added_to_inventory') bcast('inventory.changed', { store_id: r.destination_store_id });
    return r;
  });
}

// ---- reads ----
const listItems = (opts) => repos.acceptance.listItems(getPool(), opts);
const getItem = (id) => repos.acceptance.getItem(getPool(), id);
const getBatch = (id) => repos.acceptance.getBatch(getPool(), id);

module.exports = { createBatch, fnbDecision, storeDecision, listItems, getItem, getBatch };
