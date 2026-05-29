'use strict';

const repos = require('../repositories');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const { currentBusinessDate } = require('./businessDate');

/**
 * Write the immutable daily snapshot for the given (or current) business date.
 * Idempotent for the day via UNIQUE(snapshot_date,store_id,item_id).
 */
async function runDailySnapshot(date) {
  const snapshotDate = date || currentBusinessDate();
  const written = await withTransaction(async (client) => {
    return repos.snapshots.run(client, snapshotDate);
  });
  return { snapshotDate, written };
}

/**
 * Expiry sweep: emit alerts at 30/14/7 days and for expired stock. Safe to run
 * daily; dedup keys prevent duplicate open alerts.
 */
async function runExpiryAlerts() {
  const pool = getPool();
  const batches = await repos.batches.listExpiring(pool, { withinDays: 30 });
  let emitted = 0;
  for (const b of batches) {
    const d = Number(b.days_to_expiry);
    let severity = 'info';
    let bucket = '30d';
    if (d < 0) { severity = 'critical'; bucket = 'expired'; }
    else if (d <= 7) { severity = 'warning'; bucket = '7d'; }
    else if (d <= 14) { severity = 'warning'; bucket = '14d'; }
    else if (d <= 30) { severity = 'info'; bucket = '30d'; }
    else continue;

    const res = await repos.alerts.emit(pool, {
      alertType: d < 0 ? 'expired' : 'expiring',
      severity, storeId: b.store_id, itemId: b.item_id,
      entityType: 'inventory_batch', entityId: b.id,
      message: d < 0
        ? `${b.description} batch ${b.batch_number || ''} EXPIRED (${Math.abs(d)}d ago), ${b.qty_remaining} left`
        : `${b.description} batch ${b.batch_number || ''} expires in ${d}d, ${b.qty_remaining} left`,
      details: { expiry_date: b.expiry_date, qty_remaining: b.qty_remaining, bucket },
      dedupKey: `expiry:${bucket}:${b.id}`,
    });
    if (res) emitted += 1;
  }
  return { scanned: batches.length, emitted };
}

module.exports = { runDailySnapshot, runExpiryAlerts };
