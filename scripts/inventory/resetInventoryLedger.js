#!/usr/bin/env node
'use strict';

/**
 * DANGER: wipes the inventory LEDGER + materialized balances so a fresh
 * `npm run inv:migrate-json` can repost opening balances cleanly.
 *
 * Only the append-only ledger and derived rows are cleared — master data
 * (stores, items, suppliers, users) is left intact. The JSON source of truth
 * is untouched, so the migration fully rebuilds these tables.
 *
 * Use this when a partial/interrupted migration left balances out of sync and
 * the idempotency keys block a corrective re-run. Requires an explicit --yes.
 *
 *   node scripts/inventory/resetInventoryLedger.js            # dry run (counts)
 *   node scripts/inventory/resetInventoryLedger.js --yes      # actually wipe
 */

require('dotenv').config({ override: true });
const { getPool, closePool } = require('../../inventory/db/pool');
const { isConfigured } = require('../../inventory/db/config');

// Order does not matter — TRUNCATE ... CASCADE handles FKs in one statement.
const LEDGER_TABLES = [
  'inventory_transactions',
  'inventory_batches',
  'store_item_balances',
  'item_price_history',
  'inventory_snapshots',
];

// Operational tables that are meaningless without the ledger. If any hold rows
// we refuse to wipe unless --force is also passed (protects real data).
const OPERATIONAL_TABLES = [
  'transfers', 'transfer_lines', 'purchase_requisitions', 'pr_lines',
  'purchase_orders', 'po_lines', 'goods_receipts', 'gr_lines',
  'waste', 'stock_counts', 'stock_count_lines', 'daily_closings',
  'kegs', 'keg_events',
];

async function counts(pool, tables) {
  const out = {};
  for (const t of tables) {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM ${t}`);
      out[t] = rows[0].c;
    } catch { out[t] = 'n/a'; }
  }
  return out;
}

async function main() {
  if (!isConfigured()) { console.error('❌ DB not configured.'); process.exit(1); }
  const args = process.argv.slice(2);
  const doIt = args.includes('--yes');
  const force = args.includes('--force');
  const pool = getPool();

  const ledgerCounts = await counts(pool, LEDGER_TABLES);
  const opCounts = await counts(pool, OPERATIONAL_TABLES);
  const opRows = Object.values(opCounts).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0);

  console.log('Current ledger rows:');
  Object.entries(ledgerCounts).forEach(([t, c]) => console.log(`   ${t}: ${c}`));
  if (opRows > 0) {
    console.log('\n⚠️  Operational data present (transfers/PO/GRN/counts/etc.):');
    Object.entries(opCounts).filter(([, c]) => typeof c === 'number' && c > 0).forEach(([t, c]) => console.log(`   ${t}: ${c}`));
  }

  if (!doIt) {
    console.log('\nDry run only. Re-run with --yes to wipe the ledger and rebalance.');
    await closePool();
    return;
  }
  if (opRows > 0 && !force) {
    console.error('\n❌ Refusing to wipe: operational data exists. Re-run with --yes --force only if you are certain.');
    await closePool();
    process.exit(1);
  }

  const tables = force ? [...OPERATIONAL_TABLES, ...LEDGER_TABLES] : LEDGER_TABLES;
  await pool.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  console.log(`\n✅ Wiped ${tables.length} table(s). Now run: npm run inv:migrate-json && npm run inv:verify`);
  await closePool();
}

main().catch(async (e) => { console.error('❌ Reset failed:', e); await closePool(); process.exit(1); });
