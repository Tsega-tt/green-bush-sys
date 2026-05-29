'use strict';

/**
 * Phase 6 — fraud / suspicious-activity analytics. Periodic scans (run via
 * scripts/inventory/runFraudScan.js or POST /api/inv/fraud/scan) that emit
 * alerts into the centralized alerts table. Thresholds are env-configurable.
 */

const repos = require('../repositories');
const { getPool } = require('../db/pool');
const { num } = require('./money');
const sse = require('../realtime/sse');

const WINDOW_DAYS = parseInt(process.env.INVENTORY_FRAUD_WINDOW_DAYS || '7', 10);
const WASTE_RATIO = parseFloat(process.env.INVENTORY_WASTE_RATIO || '0.10');
const WASTE_MIN_VALUE = parseFloat(process.env.INVENTORY_WASTE_MIN_VALUE || '500');
const VARIANCE_COUNT = parseInt(process.env.INVENTORY_VARIANCE_COUNT || '3', 10);
const PURCHASE_SPIKE_X = parseFloat(process.env.INVENTORY_PURCHASE_SPIKE_X || '2');
const PURCHASE_MIN_VALUE = parseFloat(process.env.INVENTORY_PURCHASE_MIN_VALUE || '5000');

async function excessiveWaste(pool, emitted) {
  const { rows } = await pool.query(
    `SELECT store_id,
            SUM(CASE WHEN txn_type='waste'       THEN abs(total_cost) ELSE 0 END) AS waste_val,
            SUM(CASE WHEN txn_type='consumption' THEN abs(total_cost) ELSE 0 END) AS cons_val
       FROM inventory_transactions
      WHERE created_at >= now() - ($1 || ' days')::interval
      GROUP BY store_id`,
    [WINDOW_DAYS]
  );
  for (const r of rows) {
    const w = num(r.waste_val);
    const denom = num(r.waste_val) + num(r.cons_val);
    if (w >= WASTE_MIN_VALUE && denom > 0 && w / denom >= WASTE_RATIO) {
      const a = await repos.alerts.emit(pool, {
        alertType: 'excessive_waste', severity: 'warning', storeId: r.store_id,
        message: `Excessive waste at store ${r.store_id}: ${w.toFixed(2)} (${Math.round((w / denom) * 100)}% of usage, ${WINDOW_DAYS}d)`,
        details: { waste_value: w, ratio: w / denom }, dedupKey: `excessive_waste:${r.store_id}:${WINDOW_DAYS}d`,
      });
      if (a) emitted.push(a);
    }
  }
}

async function repeatedVariance(pool, emitted) {
  const { rows } = await pool.query(
    `SELECT store_id, COUNT(*) AS c FROM alerts
      WHERE alert_type='large_variance' AND created_at >= now() - ($1 || ' days')::interval
      GROUP BY store_id HAVING COUNT(*) >= $2`,
    [WINDOW_DAYS, VARIANCE_COUNT]
  );
  for (const r of rows) {
    const a = await repos.alerts.emit(pool, {
      alertType: 'repeated_variance', severity: 'critical', storeId: r.store_id,
      message: `Repeated variances at store ${r.store_id}: ${r.c} in ${WINDOW_DAYS}d — investigate`,
      details: { count: Number(r.c) }, dedupKey: `repeated_variance:${r.store_id}:${WINDOW_DAYS}d`,
    });
    if (a) emitted.push(a);
  }
}

async function unusualPurchasing(pool, emitted) {
  const { rows } = await pool.query(
    `SELECT store_id,
            SUM(CASE WHEN created_at >= now() - ($1 || ' days')::interval THEN total_cost ELSE 0 END) AS cur,
            SUM(CASE WHEN created_at <  now() - ($1 || ' days')::interval
                      AND created_at >= now() - (2*$1 || ' days')::interval THEN total_cost ELSE 0 END) AS prev
       FROM inventory_transactions
      WHERE txn_type='purchase_receipt'
        AND created_at >= now() - (2*$1 || ' days')::interval
      GROUP BY store_id`,
    [WINDOW_DAYS]
  );
  for (const r of rows) {
    const cur = num(r.cur);
    const prev = num(r.prev);
    if (cur >= PURCHASE_MIN_VALUE && prev > 0 && cur >= prev * PURCHASE_SPIKE_X) {
      const a = await repos.alerts.emit(pool, {
        alertType: 'unusual_purchasing', severity: 'warning', storeId: r.store_id,
        message: `Unusual purchasing at store ${r.store_id}: ${cur.toFixed(2)} vs prior ${prev.toFixed(2)}`,
        details: { current: cur, previous: prev }, dedupKey: `unusual_purchasing:${r.store_id}:${WINDOW_DAYS}d`,
      });
      if (a) emitted.push(a);
    }
  }
}

async function runScan() {
  const pool = getPool();
  const emitted = [];
  await excessiveWaste(pool, emitted);
  await repeatedVariance(pool, emitted);
  await unusualPurchasing(pool, emitted);
  if (emitted.length) sse.broadcast('alert.new', { count: emitted.length });
  return { emitted: emitted.length, alerts: emitted };
}

module.exports = { runScan };
