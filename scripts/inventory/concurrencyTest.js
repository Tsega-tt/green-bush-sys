#!/usr/bin/env node
'use strict';

/**
 * Concurrency harness (requires a running PG with migrations applied + at least
 * one store and one admin user). Validates the core safety invariant:
 *
 *   Inventory NEVER goes negative even under simultaneous deductions, and the
 *   ledger always reconciles with the materialized balance.
 *
 * Run: npm run inv:concurrency-test
 */

require('dotenv').config({ override: true });
const { getPool, closePool } = require('../../inventory/db/pool');
const ledger = require('../../inventory/services/ledgerService');

const START = 100;     // opening units
const WORKERS = 40;    // concurrent deductions
const EACH = 5;        // units per deduction  => demand 200 >> 100 supply

async function setup(pool) {
  const store = (await pool.query(`SELECT id FROM stores ORDER BY id LIMIT 1`)).rows[0];
  const admin = (await pool.query(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`)).rows[0];
  if (!store || !admin) throw new Error('Need at least one store and one admin user (run migrate + migrate-json).');

  const code = `CONC-${Date.now()}`;
  const item = (await pool.query(
    `INSERT INTO inventory_items (item_code, description, uom) VALUES ($1,'Concurrency Test','pcs') RETURNING id`,
    [code]
  )).rows[0];

  await ledger.openingBalance({
    storeId: Number(store.id), itemId: Number(item.id), quantity: START, unitCost: 10,
    userId: Number(admin.id), userRole: 'admin', idempotencyKey: `open:${code}`,
  });
  return { storeId: Number(store.id), itemId: Number(item.id), userId: Number(admin.id) };
}

async function assertConsistent(pool, storeId, itemId) {
  const bal = (await pool.query(
    `SELECT quantity FROM store_item_balances WHERE store_id=$1 AND item_id=$2`, [storeId, itemId]
  )).rows[0];
  const led = (await pool.query(
    `SELECT COALESCE(SUM(quantity),0) AS s FROM inventory_transactions WHERE store_id=$1 AND item_id=$2`,
    [storeId, itemId]
  )).rows[0];
  const q = Number(bal.quantity);
  const l = Number(led.s);
  console.log(`   balance=${q}  ledger_sum=${l}`);
  if (q < 0) throw new Error('FAIL: negative balance!');
  if (Math.abs(q - l) > 0.001) throw new Error('FAIL: ledger != balance');
  return q;
}

async function main() {
  const pool = getPool();
  const { storeId, itemId, userId } = await setup(pool);
  console.log(`▶ Oversell test: ${WORKERS} workers x ${EACH} units on ${START} supply`);

  const jobs = Array.from({ length: WORKERS }, () =>
    ledger.deduct({ storeId, itemId, quantity: EACH, type: 'consumption',
      userId, userRole: 'admin', referenceType: 'concurrency_test' })
      .then(() => 'ok').catch((e) => (e.code === 'INSUFFICIENT_STOCK' ? 'rejected' : Promise.reject(e)))
  );
  const results = await Promise.all(jobs);
  const ok = results.filter((r) => r === 'ok').length;
  const rejected = results.filter((r) => r === 'rejected').length;
  console.log(`   succeeded=${ok}  rejected(409)=${rejected}`);

  const finalQ = await assertConsistent(pool, storeId, itemId);
  const expectedSuccesses = Math.floor(START / EACH);
  if (ok !== expectedSuccesses) throw new Error(`FAIL: expected ${expectedSuccesses} successes, got ${ok}`);
  if (finalQ !== START - ok * EACH) throw new Error('FAIL: balance math');
  console.log('   ✅ oversell protection correct');

  console.log(`▶ Idempotency test: 25 concurrent deductions with one key`);
  const key = `idem-${Date.now()}`;
  const idemJobs = Array.from({ length: 25 }, () =>
    ledger.deduct({ storeId, itemId, quantity: 1, type: 'consumption', idempotencyKey: key,
      userId, userRole: 'admin', referenceType: 'concurrency_test' })
      .then(() => 'ok').catch((e) => (e.code === 'IDEMPOTENT_REPLAY' ? 'replay' : (e.code === 'INSUFFICIENT_STOCK' ? 'rejected' : Promise.reject(e))))
  );
  const idemRes = await Promise.all(idemJobs);
  const applied = idemRes.filter((r) => r === 'ok').length;
  console.log(`   applied=${applied} (must be 1)  replay/other=${idemRes.length - applied}`);
  if (applied !== 1) throw new Error(`FAIL: idempotency applied ${applied} times`);
  await assertConsistent(pool, storeId, itemId);
  console.log('   ✅ idempotency correct');

  console.log('\n✅ ALL CONCURRENCY INVARIANTS HELD');
  await closePool();
}

main().catch(async (e) => { console.error('❌', e.message); await closePool(); process.exit(1); });
