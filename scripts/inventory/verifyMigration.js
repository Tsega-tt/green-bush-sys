#!/usr/bin/env node
'use strict';

/**
 * Reconciliation / verification for the inventory migration. Exits non-zero on
 * any discrepancy so it can gate a cutover in CI or a deploy script.
 *
 * Checks:
 *   1. Ledger replay == materialized balance for every (store,item).
 *   2. No negative balances (DB CHECK should already guarantee this).
 *   3. JSON source quantity total == PG balance total (per legacy store).
 *   4. Orphan check (balances reference live store + item).
 */

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('../../inventory/db/pool');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const TOL = 0.001;

function readJson(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

async function main() {
  const pool = getPool();
  const problems = [];

  // 1. ledger replay vs balance
  const replay = await pool.query(`
    SELECT b.store_id, b.item_id, b.quantity AS balance_qty,
           COALESCE(t.sum_qty, 0) AS ledger_qty
      FROM store_item_balances b
      LEFT JOIN (
        SELECT store_id, item_id, SUM(quantity) AS sum_qty
          FROM inventory_transactions GROUP BY store_id, item_id
      ) t ON t.store_id = b.store_id AND t.item_id = b.item_id
  `);
  let mismatches = 0;
  for (const r of replay.rows) {
    if (Math.abs(Number(r.balance_qty) - Number(r.ledger_qty)) > TOL) {
      mismatches += 1;
      problems.push(`LEDGER!=BALANCE store=${r.store_id} item=${r.item_id} balance=${r.balance_qty} ledger=${r.ledger_qty}`);
    }
  }
  console.log(`1. Ledger replay vs balance: ${replay.rows.length} rows, ${mismatches} mismatch(es)`);

  // 2. negative balances
  const neg = await pool.query(`SELECT COUNT(*)::int AS c FROM store_item_balances WHERE quantity < 0`);
  if (neg.rows[0].c > 0) problems.push(`NEGATIVE balances: ${neg.rows[0].c}`);
  console.log(`2. Negative balances: ${neg.rows[0].c}`);

  // 3. JSON source vs PG (per legacy store)
  const storeItems = readJson('store_inventory.json');
  const jsonByStore = {};
  for (const it of storeItems) {
    jsonByStore[it.store_id] = (jsonByStore[it.store_id] || 0) + (parseFloat(it.quantity) || 0);
  }
  const pgByCode = await pool.query(`
    SELECT s.code, COALESCE(SUM(b.quantity),0) AS qty
      FROM stores s LEFT JOIN store_item_balances b ON b.store_id = s.id
     GROUP BY s.code
  `);
  const pgMap = new Map(pgByCode.rows.map((r) => [r.code, Number(r.qty)]));
  for (const [code, jsonQty] of Object.entries(jsonByStore)) {
    const pgQty = pgMap.get(code) || 0;
    const okRow = Math.abs(pgQty - jsonQty) <= TOL;
    console.log(`3. store ${code}: json=${jsonQty} pg=${pgQty} ${okRow ? 'OK' : 'MISMATCH'}`);
    if (!okRow) problems.push(`JSON!=PG store=${code} json=${jsonQty} pg=${pgQty}`);
  }

  // 4. orphans
  const orphans = await pool.query(`
    SELECT COUNT(*)::int AS c FROM store_item_balances b
      LEFT JOIN stores s ON s.id = b.store_id
      LEFT JOIN inventory_items i ON i.id = b.item_id
     WHERE s.id IS NULL OR i.id IS NULL
  `);
  if (orphans.rows[0].c > 0) problems.push(`ORPHAN balances: ${orphans.rows[0].c}`);
  console.log(`4. Orphan balances: ${orphans.rows[0].c}`);

  await closePool();

  if (problems.length) {
    console.error(`\n❌ VERIFICATION FAILED (${problems.length} problem(s)):`);
    problems.forEach((p) => console.error('   -', p));
    process.exit(1);
  }
  console.log('\n✅ VERIFICATION PASSED — ledger, balances and JSON source reconcile.');
}

main().catch(async (e) => { console.error('❌ Verify error:', e); await closePool(); process.exit(1); });
