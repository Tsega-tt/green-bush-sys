'use strict';

/**
 * Integration tests for the ledger engine. These require a live PG with
 * migrations applied. They auto-skip when the DB is not configured so the pure
 * unit suite still runs in any environment.
 *
 *   Enable: set DB_* env vars + run `npm run inv:migrate` first.
 *   Run:    npm run inv:test
 */
const test = require('node:test');
const assert = require('node:assert/strict');

require('dotenv').config({ override: true });
const { isConfigured } = require('../db/config');

// Opt-in only: a configured DB is not necessarily a *running* DB, so these are
// off unless INVENTORY_TEST_DB=1 is set (CI / local with a live test database).
const SKIP = process.env.INVENTORY_TEST_DB !== '1' || !isConfigured();
const opts = SKIP ? { skip: 'set INVENTORY_TEST_DB=1 with a live DB to run integration tests' } : {};

let pool;
let ledger;
let ctx;

test('integration setup', opts, async () => {
  ledger = require('../services/ledgerService');
  pool = require('../db/pool').getPool();
  const store = (await pool.query(`SELECT id FROM stores ORDER BY id LIMIT 1`)).rows[0];
  const admin = (await pool.query(`SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1`)).rows[0];
  assert.ok(store && admin, 'need a store and an admin user');
  const code = `IT-${Date.now()}`;
  const item = (await pool.query(
    `INSERT INTO inventory_items (item_code,description,uom) VALUES ($1,'IT item','kg') RETURNING id`, [code]
  )).rows[0];
  ctx = { storeId: Number(store.id), itemId: Number(item.id), userId: Number(admin.id) };
});

test('receipt recomputes WAC; deduction values at WAC; balance reconciles', opts, async () => {
  await ledger.receipt({ ...ctx, type: 'purchase_receipt', quantity: 100, unitCost: 850,
    userRole: 'admin', referenceType: 'test' });
  await ledger.receipt({ ...ctx, type: 'purchase_receipt', quantity: 100, unitCost: 950,
    userRole: 'admin', referenceType: 'test' });

  let bal = (await pool.query(
    `SELECT quantity, weighted_avg_cost FROM store_item_balances WHERE store_id=$1 AND item_id=$2`,
    [ctx.storeId, ctx.itemId]
  )).rows[0];
  assert.equal(Number(bal.quantity), 200);
  assert.equal(Number(bal.weighted_avg_cost), 900);

  const r = await ledger.deduct({ ...ctx, type: 'consumption', quantity: 50, userRole: 'admin' });
  assert.equal(Number(r.transactions[0].unit_cost), 900); // valued at WAC

  const led = (await pool.query(
    `SELECT COALESCE(SUM(quantity),0) s FROM inventory_transactions WHERE store_id=$1 AND item_id=$2`,
    [ctx.storeId, ctx.itemId]
  )).rows[0];
  bal = (await pool.query(
    `SELECT quantity FROM store_item_balances WHERE store_id=$1 AND item_id=$2`, [ctx.storeId, ctx.itemId]
  )).rows[0];
  assert.equal(Number(bal.quantity), 150);
  assert.equal(Number(led.s), 150);
});

test('over-deduction is rejected with INSUFFICIENT_STOCK and changes nothing', opts, async () => {
  const before = (await pool.query(
    `SELECT quantity FROM store_item_balances WHERE store_id=$1 AND item_id=$2`, [ctx.storeId, ctx.itemId]
  )).rows[0].quantity;
  await assert.rejects(
    ledger.deduct({ ...ctx, type: 'consumption', quantity: 1e9, userRole: 'admin' }),
    (e) => e.code === 'INSUFFICIENT_STOCK'
  );
  const after = (await pool.query(
    `SELECT quantity FROM store_item_balances WHERE store_id=$1 AND item_id=$2`, [ctx.storeId, ctx.itemId]
  )).rows[0].quantity;
  assert.equal(Number(after), Number(before));
});

test('immutable ledger rejects UPDATE', opts, async () => {
  await assert.rejects(
    pool.query(`UPDATE inventory_transactions SET note='x' WHERE store_id=$1 AND item_id=$2`,
      [ctx.storeId, ctx.itemId])
  );
});

test('teardown', opts, async () => {
  await require('../db/pool').closePool();
});
