'use strict';

/**
 * Phase 5 — waste, stock counts, daily closing, keg tracking.
 * All inventory effects go through the ledger engine (applyMovement) inside a
 * single transaction. Finalized counts and confirmed closings are locked.
 */

const repos = require('../repositories');
const { waste: wasteRepo, counts: countRepo, closings: closingRepo, kegs: kegRepo } = require('../repositories/operationsRepo');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const { applyMovement } = require('./ledgerService');
const { nextNumber } = require('./numbering');
const businessDate = require('./businessDate');
const { qty, money, num } = require('./money');
const { Errors } = require('../errors');
const sse = require('../realtime/sse');

const TOL = 0.001;

// ------------------------------- WASTE -------------------------------
async function recordWaste(p) {
  if (!p.reason || !String(p.reason).trim()) throw Errors.validation('Waste reason required');
  const amount = qty(p.quantity);
  if (!(amount > 0)) throw Errors.validation('quantity must be > 0');
  return withTransaction(async (client) => {
    const item = await repos.items.getById(client, p.itemId);
    if (!item) throw Errors.notFound('Item');
    const r = await applyMovement(client, {
      storeId: p.storeId, itemId: p.itemId, direction: 'out', type: 'waste', quantity: amount,
      referenceType: 'waste', userId: p.userId, userRole: p.userRole, note: p.reason,
    });
    const value = money(amount * num(r.balance.weighted_avg_cost));
    const row = await wasteRepo.insert(client, {
      wasteNumber: await nextNumber(client, 'waste'), storeId: p.storeId, itemId: p.itemId,
      quantity: amount, uom: item.uom, reason: p.reason, value,
      txnId: r.transactions[0] ? r.transactions[0].id : null, recordedBy: p.userId,
    });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'waste',
      entityType: 'waste', entityId: row.id, storeId: p.storeId, newValue: { qty: amount, value } });
    return { waste: row, balance: r.balance };
  }).then((res) => { sse.broadcast('inventory.changed', { store_id: p.storeId, item_id: p.itemId }); return res; });
}

// ----------------------------- STOCK COUNT -----------------------------
async function createCount(p) {
  return withTransaction(async (client) => {
    const head = await countRepo.create(client, {
      countNumber: await nextNumber(client, 'count'), storeId: p.storeId,
      isBlind: p.isBlind, note: p.note, countedBy: p.userId,
    });
    const balances = await repos.balances.listByStore(client, p.storeId, {});
    const filter = Array.isArray(p.itemIds) && p.itemIds.length ? new Set(p.itemIds.map(Number)) : null;
    for (const b of balances) {
      if (filter && !filter.has(Number(b.item_id))) continue;
      await countRepo.addLine(client, head.id, { itemId: b.item_id, systemQty: num(b.quantity) });
    }
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'create',
      entityType: 'stock_count', entityId: head.id, storeId: p.storeId });
    return countRepo.getById(client, head.id);
  });
}

async function enterCounts(p) {
  return withTransaction(async (client) => {
    const c = await countRepo.lockById(client, p.id);
    if (!c) throw Errors.notFound('Stock count');
    if (c.status !== 'open') throw Errors.businessRule('Count is not open');
    const lines = await countRepo.getLines(client, p.id);
    const byId = new Map(lines.map((l) => [Number(l.id), l]));
    for (const entry of (p.lines || [])) {
      const line = byId.get(Number(entry.line_id || entry.lineId));
      if (!line) continue;
      await countRepo.setLinePhysical(client, line.id, qty(entry.physical_qty ?? entry.physicalQty));
    }
    return countRepo.getById(client, p.id);
  });
}

async function finalizeCount(p) {
  return withTransaction(async (client) => {
    const c = await countRepo.lockById(client, p.id);
    if (!c) throw Errors.notFound('Stock count');
    if (c.status !== 'open') throw Errors.businessRule(`Count already ${c.status}`);
    const lines = await countRepo.getLines(client, p.id);
    let variances = 0;
    for (const line of lines) {
      if (line.physical_qty == null) continue; // not counted -> skip
      // recompute current system from the live balance (locked inside applyMovement)
      const bal = await repos.balances.lockOrCreate(client, c.store_id, line.item_id);
      const system = num(bal.quantity);
      const physical = num(line.physical_qty);
      const variance = qty(physical - system);
      if (variance !== 0) {
        await applyMovement(client, {
          storeId: c.store_id, itemId: line.item_id,
          direction: variance > 0 ? 'in' : 'out', type: 'stock_count', quantity: Math.abs(variance),
          unitCost: variance > 0 ? num(bal.weighted_avg_cost) : undefined,
          referenceType: 'stock_count', referenceId: c.id,
          userId: p.userId, userRole: p.userRole, note: `Stock count ${c.count_number}`,
        });
        variances += 1;
        if (Math.abs(variance) >= 1) {
          await repos.alerts.emit(client, { alertType: 'large_variance', severity: 'warning',
            storeId: c.store_id, itemId: line.item_id, entityType: 'stock_count', entityId: c.id,
            message: `Count variance ${variance} on item ${line.item_id}`,
            dedupKey: `count_var:${c.id}:${line.id}` });
        }
      }
      await countRepo.setLineResult(client, line.id, { physicalQty: physical, variance, adjusted: variance !== 0 });
    }
    const finalized = await countRepo.updateStatus(client, p.id, {
      status: 'finalized', finalized_by: p.userId, finalized_at: new Date().toISOString(),
    });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'finalize',
      entityType: 'stock_count', entityId: p.id, storeId: c.store_id, newValue: { variances } });
    return finalized;
  }).then((c) => { sse.broadcast('inventory.changed', { store_id: c.store_id, reason: 'stock_count' }); return c; });
}

// ----------------------------- DAILY CLOSING -----------------------------
async function generateClosing(p) {
  const date = p.businessDate || businessDate.currentBusinessDate();
  return withTransaction(async (client) => {
    // movement values by type for the local business date
    const { rows } = await client.query(
      `SELECT txn_type, COALESCE(SUM(total_cost),0)::numeric(16,2) AS v
         FROM inventory_transactions
        WHERE store_id=$1 AND created_at::date = $2
        GROUP BY txn_type`,
      [p.storeId, date]
    );
    const byType = Object.fromEntries(rows.map((r) => [r.txn_type, num(r.v)]));
    const abs = (t) => Math.abs(byType[t] || 0);

    const opening = await client.query(
      `SELECT COALESCE(SUM(inventory_value),0)::numeric(16,2) AS v FROM inventory_snapshots
        WHERE store_id=$1 AND snapshot_date = ($2::date - 1)`, [p.storeId, date]
    );
    const expected = await client.query(
      `SELECT COALESCE(SUM(quantity*weighted_avg_cost),0)::numeric(16,2) AS v
         FROM store_item_balances WHERE store_id=$1`, [p.storeId]
    );

    const row = await closingRepo.upsert(client, {
      storeId: p.storeId, businessDate: date,
      openingValue: num(opening.rows[0].v),
      purchasesValue: byType.purchase_receipt || 0,
      transfersInValue: byType.transfer_in || 0,
      transfersOutValue: abs('transfer_out'),
      consumptionValue: abs('consumption'),
      salesValue: abs('sale'),
      wasteValue: abs('waste'),
      adjustmentValue: (byType.adjustment || 0) + (byType.stock_count || 0),
      expectedValue: num(expected.rows[0].v),
      details: byType,
    });
    if (!row) throw Errors.businessRule('Closing for this date is already confirmed (locked)');
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'generate',
      entityType: 'daily_closing', entityId: row.id, storeId: p.storeId });
    return row;
  });
}

async function confirmClosing(p) {
  const date = p.businessDate || businessDate.currentBusinessDate();
  return withTransaction(async (client) => {
    const row = await closingRepo.lockByStoreDate(client, p.storeId, date);
    if (!row) throw Errors.notFound('Daily closing (generate it first)');
    if (row.status === 'confirmed') throw Errors.businessRule('Closing already confirmed');
    const physical = p.physicalValue != null ? money(p.physicalValue) : null;
    const variance = physical != null ? money(physical - num(row.expected_value)) : 0;
    const confirmed = await closingRepo.confirm(client, row.id, {
      status: 'confirmed', physical_value: physical, variance_value: variance,
      confirmed_by: p.userId, confirmed_at: new Date().toISOString(),
    });
    if (physical != null && Math.abs(variance) > TOL) {
      await repos.alerts.emit(client, { alertType: 'large_variance', severity: 'warning',
        storeId: p.storeId, entityType: 'daily_closing', entityId: row.id,
        message: `Daily closing variance ${variance} on ${date}`, dedupKey: `closing_var:${row.id}` });
    }
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'confirm',
      entityType: 'daily_closing', entityId: row.id, storeId: p.storeId, newValue: { variance } });
    return confirmed;
  });
}

// ------------------------------- KEGS -------------------------------
async function receiveKeg(p) {
  if (!(num(p.sizeLiters) > 0)) throw Errors.validation('size_liters must be > 0');
  await require('./capabilityService').requireCapability(p.storeId, 'requires_keg_tracking');
  return withTransaction(async (client) => {
    const keg = await kegRepo.create(client, {
      kegCode: p.kegCode || (await nextNumber(client, 'keg')), storeId: p.storeId,
      itemId: p.itemId, supplierId: p.supplierId, sizeLiters: qty(p.sizeLiters),
    });
    await kegRepo.addEvent(client, { kegId: keg.id, eventType: 'received', liters: qty(p.sizeLiters),
      litersRemainingAfter: qty(p.sizeLiters), createdBy: p.userId });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'keg_receive',
      entityType: 'keg', entityId: keg.id, storeId: p.storeId });
    return keg;
  });
}

async function kegEvent(p) {
  const evType = p.eventType;
  return withTransaction(async (client) => {
    const keg = await kegRepo.lockById(client, p.id);
    if (!keg) throw Errors.notFound('Keg');
    if (keg.status === 'empty' || keg.status === 'returned') throw Errors.businessRule(`Keg is ${keg.status}`);

    if (evType === 'tap') {
      const updated = await kegRepo.update(client, keg.id, { status: 'tapped', tapped_at: new Date().toISOString() });
      await kegRepo.addEvent(client, { kegId: keg.id, eventType: 'tapped', liters: 0,
        litersRemainingAfter: num(keg.liters_remaining), createdBy: p.userId });
      await audit(client, p, 'keg_tap', keg);
      return updated;
    }

    const liters = qty(p.liters);
    if (!(liters > 0)) throw Errors.validation('liters must be > 0');
    if (num(keg.liters_remaining) < liters) {
      throw Errors.insufficientStock([{ keg_id: keg.id, available: num(keg.liters_remaining), required: liters }]);
    }
    const remaining = qty(num(keg.liters_remaining) - liters);
    const fields = { liters_remaining: remaining };
    if (evType === 'sale') fields.liters_sold = qty(num(keg.liters_sold) + liters);
    else if (evType === 'waste') fields.liters_waste = qty(num(keg.liters_waste) + liters);
    else throw Errors.validation('Invalid keg event type');
    if (remaining <= 0) { fields.status = 'empty'; fields.emptied_at = new Date().toISOString(); }
    const updated = await kegRepo.update(client, keg.id, fields);
    await kegRepo.addEvent(client, { kegId: keg.id, eventType: evType, liters,
      litersRemainingAfter: remaining, note: p.note, createdBy: p.userId });

    if (fields.status === 'empty') {
      const variance = qty(num(updated.liters_received) - num(updated.liters_sold) - num(updated.liters_waste) - num(updated.liters_remaining));
      if (Math.abs(variance) > TOL) {
        await repos.alerts.emit(client, { alertType: 'keg_variance', severity: 'warning',
          storeId: keg.store_id, entityType: 'keg', entityId: keg.id,
          message: `Keg ${keg.keg_code} closed with ${variance}L unexplained variance`,
          details: { variance }, dedupKey: `keg_var:${keg.id}` });
      }
    }
    await audit(client, p, `keg_${evType}`, keg);
    return updated;
  }).then((k) => { sse.broadcast('keg.changed', { id: k.id, status: k.status }); return k; });
}

async function audit(client, p, action, keg) {
  return repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action,
    entityType: 'keg', entityId: keg.id, storeId: keg.store_id });
}

const reads = {
  listWaste: (q) => wasteRepo.list(getPool(), q),
  listCounts: (q) => countRepo.list(getPool(), q),
  getCount: (id) => countRepo.getById(getPool(), id),
  listClosings: (q) => closingRepo.list(getPool(), q),
  getClosing: (storeId, date) => closingRepo.get(getPool(), storeId, date),
  listKegs: (q) => kegRepo.list(getPool(), q),
  getKeg: (id) => kegRepo.getById(getPool(), id),
};

module.exports = {
  recordWaste, createCount, enterCounts, finalizeCount,
  generateClosing, confirmClosing, receiveKeg, kegEvent, reads,
};
