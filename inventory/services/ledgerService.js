'use strict';

/**
 * THE LEDGER ENGINE — the only place in the system that mutates stock.
 *
 * Invariants enforced here (in addition to the DB CHECK quantity >= 0 backstop):
 *  - every movement runs inside ONE transaction (withTransaction)
 *  - the (store,item) balance row is locked FOR UPDATE before validation
 *  - multi-item operations lock balances in ascending item_id order (deadlock-free)
 *  - validation precedes mutation; insufficient stock => rollback, nothing changes
 *  - IN-moves recompute WAC; OUT-moves are valued at current WAC (FEFO by batch)
 *  - idempotency keys make retried writes safe (no double deduction)
 *
 * No file/HTTP/print I/O happens inside the transaction.
 */

const repos = require('../repositories');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const { recomputeWacOnReceipt, valueOutMovement } = require('./wac');
const { nextNumber } = require('./numbering');
const { qty, cost, num } = require('./money');
const { Errors } = require('../errors');

const UNIQUE_VIOLATION = '23505';

/** Resolve item (uom, track_batches) inside the txn. */
async function loadItem(client, itemId) {
  const item = await repos.items.getById(client, itemId);
  if (!item || item.deleted_at) throw Errors.notFound(`Item ${itemId}`);
  return item;
}

/** Emit a low-stock / out-of-stock alert in-band (commits with the movement). */
async function maybeStockAlert(client, balanceRow, item, storeId) {
  const q = num(balanceRow.quantity);
  const min = num(balanceRow.min_quantity);
  if (q <= 0) {
    await repos.alerts.emit(client, {
      alertType: 'out_of_stock', severity: 'critical', storeId, itemId: item.id,
      message: `${item.description} is OUT OF STOCK`,
      dedupKey: `out_of_stock:${storeId}:${item.id}`,
    });
  } else if (min > 0 && q <= min) {
    await repos.alerts.emit(client, {
      alertType: 'low_stock', severity: 'warning', storeId, itemId: item.id,
      message: `${item.description} is low (${q} <= min ${min})`,
      details: { quantity: q, min_quantity: min },
      dedupKey: `low_stock:${storeId}:${item.id}`,
    });
  }
}

/**
 * Apply a single-item movement on an already-open transaction.
 * `idempotencyKey` (if any) is attached to the FIRST ledger row only.
 * Returns { transactions, balance }.
 */
async function applyMovement(client, p) {
  const item = p.item || (await loadItem(client, p.itemId));
  const uom = item.uom;
  const amount = qty(p.quantity);
  if (!(amount > 0)) throw Errors.validation('quantity must be > 0');

  const bal = await repos.balances.lockOrCreate(client, p.storeId, p.itemId, {
    minQuantity: num(item.default_min_qty),
    reorderPoint: num(item.default_reorder),
  });
  const oldQty = num(bal.quantity);
  const oldWac = num(bal.weighted_avg_cost);
  const transactions = [];

  if (p.direction === 'in') {
    const inCost = cost(p.unitCost || 0);
    const { newQty, newWac } = recomputeWacOnReceipt(oldQty, oldWac, amount, inCost);

    // Always create a batch row for full traceability + FEFO.
    const batch = await repos.batches.insert(client, {
      storeId: p.storeId, itemId: p.itemId, supplierId: p.batch && p.batch.supplierId,
      grId: p.batch && p.batch.grId, batchNumber: p.batch && p.batch.batchNumber,
      mfgDate: p.batch && p.batch.mfgDate, expiryDate: p.batch && p.batch.expiryDate,
      qty: amount, unitCost: inCost, receivedAt: p.batch && p.batch.receivedAt,
    });

    const txn = await repos.ledger.insert(client, {
      txnNumber: await nextNumber(client, 'txn'),
      txnType: p.type, storeId: p.storeId, itemId: p.itemId, batchId: batch.id,
      quantity: amount, uom, unitCost: inCost, totalCost: cost(amount * inCost),
      balanceAfter: newQty, wacAfter: newWac,
      referenceType: p.referenceType, referenceId: p.referenceId,
      counterpartyStoreId: p.counterpartyStoreId,
      idempotencyKey: p.idempotencyKey || null,
      note: p.note, createdBy: p.userId, createdByRole: p.userRole,
    });
    transactions.push(txn);

    const updated = await repos.balances.update(client, bal.id, {
      quantity: newQty, weightedAvgCost: newWac,
    });

    if (p.type === 'purchase_receipt' || p.type === 'transfer_in') {
      await repos.priceHistory.insert(client, {
        itemId: p.itemId, supplierId: p.batch && p.batch.supplierId, storeId: p.storeId,
        unitCost: inCost, sourceType: p.referenceType || p.type, sourceId: p.referenceId,
      });
    }
    return { transactions, balance: updated };
  }

  // direction === 'out'
  if (oldQty < amount) {
    throw Errors.insufficientStock([
      { store_id: p.storeId, item_id: p.itemId, item: item.description,
        available: oldQty, required: amount, shortfall: qty(amount - oldQty) },
    ]);
  }

  const fefo = await repos.batches.lockFefo(client, p.storeId, p.itemId);
  let remaining = amount;
  let running = oldQty;
  let first = true;

  for (const b of fefo) {
    if (remaining <= 0) break;
    const take = qty(Math.min(remaining, num(b.qty_remaining)));
    if (take <= 0) continue;
    await repos.batches.decrement(client, b.id, take);
    running = qty(running - take);
    const { unitCost, totalCost } = valueOutMovement(oldWac, take);
    const txn = await repos.ledger.insert(client, {
      txnNumber: await nextNumber(client, 'txn'),
      txnType: p.type, storeId: p.storeId, itemId: p.itemId, batchId: b.id,
      quantity: -take, uom, unitCost, totalCost: -totalCost,
      balanceAfter: running, wacAfter: oldWac,
      referenceType: p.referenceType, referenceId: p.referenceId,
      counterpartyStoreId: p.counterpartyStoreId,
      idempotencyKey: first ? p.idempotencyKey || null : null,
      note: p.note, createdBy: p.userId, createdByRole: p.userRole,
    });
    transactions.push(txn);
    remaining = qty(remaining - take);
    first = false;
  }

  // Residual (only if batch sums drifted below balance): post a batch-less row so
  // the ledger still reconciles with the balance. Should be 0 in normal operation.
  if (remaining > 0) {
    running = qty(running - remaining);
    const { unitCost, totalCost } = valueOutMovement(oldWac, remaining);
    const txn = await repos.ledger.insert(client, {
      txnNumber: await nextNumber(client, 'txn'),
      txnType: p.type, storeId: p.storeId, itemId: p.itemId, batchId: null,
      quantity: -remaining, uom, unitCost, totalCost: -totalCost,
      balanceAfter: running, wacAfter: oldWac,
      referenceType: p.referenceType, referenceId: p.referenceId,
      counterpartyStoreId: p.counterpartyStoreId,
      idempotencyKey: first ? p.idempotencyKey || null : null,
      note: p.note, createdBy: p.userId, createdByRole: p.userRole,
    });
    transactions.push(txn);
    remaining = 0;
  }

  const updated = await repos.balances.update(client, bal.id, {
    quantity: qty(oldQty - amount), weightedAvgCost: oldWac,
  });
  await maybeStockAlert(client, updated, item, p.storeId);
  return { transactions, balance: updated };
}

// ---------------------------------------------------------------------------
// Idempotency-safe public wrappers
// ---------------------------------------------------------------------------

/** If a unique-violation on idempotency_key occurs, return the prior result. */
async function handleIdempotentReplay(key) {
  if (!key) return null;
  const existing = await repos.ledger.findByIdempotencyKey(getPool(), key);
  return existing || null;
}

async function runIdempotent(key, fn) {
  try {
    return await withTransaction(fn);
  } catch (err) {
    if (err.code === UNIQUE_VIOLATION && key) {
      const prior = await handleIdempotentReplay(key);
      if (prior) throw Errors.idempotentReplay(prior);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Public operations
// ---------------------------------------------------------------------------

/** Receipt / transfer-in / opening balance (IN movement, recomputes WAC). */
async function receipt(params) {
  return runIdempotent(params.idempotencyKey, async (client) => {
    if (params.idempotencyKey) {
      const prior = await repos.ledger.findByIdempotencyKey(client, params.idempotencyKey);
      if (prior) throw Errors.idempotentReplay(prior);
    }
    const r = await applyMovement(client, { ...params, direction: 'in' });
    await repos.audit.insert(client, {
      actorId: params.userId, actorRole: params.userRole, action: params.type,
      entityType: 'inventory_item', entityId: params.itemId, storeId: params.storeId,
      newValue: { quantity: r.balance.quantity, wac: r.balance.weighted_avg_cost },
      note: params.note,
    });
    return r;
  });
}

/** Single-item OUT movement (sale/consumption/waste/transfer_out). */
async function deduct(params) {
  return runIdempotent(params.idempotencyKey, async (client) => {
    if (params.idempotencyKey) {
      const prior = await repos.ledger.findByIdempotencyKey(client, params.idempotencyKey);
      if (prior) throw Errors.idempotentReplay(prior);
    }
    const r = await applyMovement(client, { ...params, direction: 'out' });
    await repos.audit.insert(client, {
      actorId: params.userId, actorRole: params.userRole, action: params.type,
      entityType: 'inventory_item', entityId: params.itemId, storeId: params.storeId,
      newValue: { quantity: r.balance.quantity }, note: params.note,
    });
    return r;
  });
}

/**
 * Multi-item OUT movement — the sales/consumption engine.
 * Locks every balance (item_id order) and validates ALL lines before mutating
 * any, so the caller gets a complete shortfall list and an all-or-nothing result.
 * lines: [{ itemId, quantity }]
 */
async function deductMany(params) {
  const lines = [...params.lines].sort((a, b) => Number(a.itemId) - Number(b.itemId));
  return runIdempotent(params.idempotencyKey, async (client) => {
    if (params.idempotencyKey) {
      const prior = await repos.ledger.findByIdempotencyKey(client, params.idempotencyKey);
      if (prior) throw Errors.idempotentReplay(prior);
    }

    // Phase 1: lock + validate all.
    const shortfalls = [];
    const ctx = [];
    for (const line of lines) {
      const item = await loadItem(client, line.itemId);
      const bal = await repos.balances.lockOrCreate(client, params.storeId, line.itemId, {
        minQuantity: num(item.default_min_qty), reorderPoint: num(item.default_reorder),
      });
      const available = num(bal.quantity);
      const need = qty(line.quantity);
      if (available < need) {
        shortfalls.push({ store_id: params.storeId, item_id: line.itemId,
          item: item.description, available, required: need, shortfall: qty(need - available) });
      }
      ctx.push({ item, bal });
    }
    if (shortfalls.length) throw Errors.insufficientStock(shortfalls);

    // Phase 2: apply all (balances already locked above).
    const results = [];
    let first = true;
    for (let i = 0; i < lines.length; i += 1) {
      const r = await applyMovement(client, {
        storeId: params.storeId, itemId: lines[i].itemId, item: ctx[i].item,
        direction: 'out', type: params.type, quantity: lines[i].quantity,
        referenceType: params.referenceType, referenceId: params.referenceId,
        note: params.note, userId: params.userId, userRole: params.userRole,
        idempotencyKey: first ? params.idempotencyKey || null : null,
      });
      results.push(r);
      first = false;
    }
    await repos.audit.insert(client, {
      actorId: params.userId, actorRole: params.userRole, action: params.type,
      entityType: params.referenceType || 'order', entityId: params.referenceId,
      storeId: params.storeId,
      newValue: { lines: lines.map((l) => ({ item_id: l.itemId, qty: l.quantity })) },
    });
    return { results };
  });
}

/**
 * Stock adjustment / stock count. Provide exactly one of newQuantity | delta.
 * Up => IN move (valued at provided unitCost or current WAC); down => OUT move.
 */
async function adjust(params) {
  if ((params.newQuantity == null) === (params.delta == null)) {
    throw Errors.validation('Provide exactly one of new_quantity or delta');
  }
  if (!params.reason || !String(params.reason).trim()) {
    throw Errors.validation('A reason is required for adjustments');
  }
  return runIdempotent(params.idempotencyKey, async (client) => {
    if (params.idempotencyKey) {
      const prior = await repos.ledger.findByIdempotencyKey(client, params.idempotencyKey);
      if (prior) throw Errors.idempotentReplay(prior);
    }
    const item = await loadItem(client, params.itemId);
    const bal = await repos.balances.lockOrCreate(client, params.storeId, params.itemId, {
      minQuantity: num(item.default_min_qty), reorderPoint: num(item.default_reorder),
    });
    const oldQty = num(bal.quantity);
    let delta = params.delta != null ? qty(params.delta) : qty(num(params.newQuantity) - oldQty);
    if (delta === 0) {
      return { transactions: [], balance: bal, unchanged: true };
    }
    const txnType = params.txnType || 'adjustment';
    let result;
    if (delta > 0) {
      result = await applyMovement(client, {
        storeId: params.storeId, itemId: params.itemId, item, direction: 'in',
        type: txnType, quantity: delta,
        unitCost: params.unitCost != null ? params.unitCost : num(bal.weighted_avg_cost),
        referenceType: params.referenceType || 'adjustment', referenceId: params.referenceId,
        note: params.reason, userId: params.userId, userRole: params.userRole,
        idempotencyKey: params.idempotencyKey,
      });
    } else {
      result = await applyMovement(client, {
        storeId: params.storeId, itemId: params.itemId, item, direction: 'out',
        type: txnType, quantity: Math.abs(delta),
        referenceType: params.referenceType || 'adjustment', referenceId: params.referenceId,
        note: params.reason, userId: params.userId, userRole: params.userRole,
        idempotencyKey: params.idempotencyKey,
      });
    }

    // Large-variance alert (variance ratio vs prior balance).
    const ratio = oldQty > 0 ? Math.abs(delta) / oldQty : 1;
    if (ratio >= 0.2 && Math.abs(delta) >= 1) {
      await repos.alerts.emit(client, {
        alertType: 'large_variance', severity: 'warning',
        storeId: params.storeId, itemId: params.itemId,
        message: `Large ${txnType} on ${item.description}: ${delta} (was ${oldQty})`,
        details: { old_qty: oldQty, delta, reason: params.reason },
        dedupKey: null,
      });
    }
    await repos.audit.insert(client, {
      actorId: params.userId, actorRole: params.userRole, action: txnType,
      entityType: 'inventory_item', entityId: params.itemId, storeId: params.storeId,
      oldValue: { quantity: oldQty },
      newValue: { quantity: result.balance.quantity }, note: params.reason,
    });
    return result;
  });
}

/** Opening balance during migration/setup. */
async function openingBalance(params) {
  return receipt({ ...params, type: 'opening_balance', referenceType: 'opening' });
}

module.exports = { receipt, deduct, deductMany, adjust, openingBalance, applyMovement };
