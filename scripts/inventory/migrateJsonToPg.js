#!/usr/bin/env node
'use strict';

/**
 * One-time, idempotent JSON -> PostgreSQL migration for the inventory domain.
 *
 *  1. Sync users from data/users.json into PG (id-preserving) so created_by /
 *     store-manager FKs resolve. Legacy auth keeps using JSON for now.
 *  2. Ensure legacy store codes exist (coexist with the 9 seeded stores).
 *  3. De-duplicate legacy store items into the global inventory_items master.
 *  4. Post an opening_balance ledger transaction for every (store,item) with qty.
 *
 * Re-runnable: opening balances use idempotency keys, all upserts use natural
 * keys. Run `npm run inv:verify` afterwards to reconcile.
 *
 * Source of truth remains JSON until you flip INVENTORY_BACKEND=pg.
 */

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const { getPool, closePool } = require('../../inventory/db/pool');
const { isConfigured } = require('../../inventory/db/config');
const ledger = require('../../inventory/services/ledgerService');
const { InventoryError } = require('../../inventory/errors');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const ALLOWED_ROLES = new Set([
  'admin', 'owner', 'fnb_manager', 'store_manager', 'store_admin', 'purchaser',
  'cashier', 'kitchen_staff', 'cafe_waiter', 'waiter', 'bakery_employee', 'hr_admin', 'item_request',
]);

const LEGACY_STORES = {
  dry_goods: 'Dry/Goods Store',
  bar: 'Bar Store (legacy)',
  pastry: 'Pastry/Cake Store',
  kitchen: 'Kitchen Store',
  barman: 'Barman Store (legacy)',
};

function readJson(file) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; }
}

async function syncUsers(pool) {
  const users = readJson('users.json');
  let n = 0;
  for (const u of users) {
    const role = ALLOWED_ROLES.has(u.role) ? u.role : 'cashier';
    await pool.query(
      `INSERT INTO users (id, username, email, role, first_name, last_name, is_active, pin_hash, password_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET
         role = EXCLUDED.role, first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name, is_active = EXCLUDED.is_active`,
      [u.id, u.username, u.email || null, role, u.first_name || null,
       u.last_name || null, u.is_active !== false, u.pin_hash || null, u.password_hash || null]
    ).catch((e) => console.warn(`   user ${u.username} skipped: ${e.message}`));
    n += 1;
  }
  await pool.query(
    `SELECT setval(pg_get_serial_sequence('users','id'), GREATEST((SELECT COALESCE(MAX(id),1) FROM users),1))`
  );
  console.log(`👤 users synced: ${n}`);
}

async function ensureLegacyStores(pool) {
  for (const [code, name] of Object.entries(LEGACY_STORES)) {
    await pool.query(
      `INSERT INTO stores (code, name, description) VALUES ($1,$2,'Migrated from JSON')
       ON CONFLICT (code) DO NOTHING`,
      [code, name]
    );
  }
}

async function getStoreMap(pool) {
  const { rows } = await pool.query(`SELECT id, code FROM stores`);
  return new Map(rows.map((r) => [r.code, Number(r.id)]));
}

/** De-dup legacy items by (description, uom) -> one inventory_items row. */
async function upsertItems(pool, storeItems) {
  const key = (d, u) => `${String(d).trim().toLowerCase()}|${String(u || 'pcs').trim().toLowerCase()}`;
  const map = new Map();
  let seq = 0;
  for (const it of storeItems) {
    const k = key(it.description, it.uom);
    if (map.has(k)) continue;
    seq += 1;
    const code = `LEG-${String(seq).padStart(5, '0')}`;
    const { rows } = await pool.query(
      `INSERT INTO inventory_items (item_code, description, uom)
       VALUES ($1,$2,$3)
       ON CONFLICT (item_code) DO UPDATE SET description = EXCLUDED.description
       RETURNING id`,
      [code, String(it.description).trim(), it.uom || 'pcs']
    );
    map.set(k, { id: Number(rows[0].id), code });
  }
  // also map existing description+uom that may already exist under another code
  console.log(`📦 distinct items: ${map.size}`);
  return { map, key };
}

async function migrateOpeningBalances(pool, storeItems, storeMap, itemInfo, adminId) {
  // Aggregate quantities by (store, deduped-item) FIRST. Legacy JSON can hold
  // several line-items that collapse onto the same (store, description, uom) —
  // e.g. two "flour | bags" rows. Posting them individually would reuse one
  // idempotency key and silently drop all but the first. Summing up-front means
  // each (store, item) gets a single opening balance equal to the true total.
  const agg = new Map(); // `${legacyCode}|${itemCode}` -> aggregate
  for (const it of storeItems) {
    const storeId = storeMap.get(it.store_id);
    if (!storeId) { console.warn(`   no store for code ${it.store_id}`); continue; }
    const info = itemInfo.map.get(itemInfo.key(it.description, it.uom));
    if (!info) continue;
    const k = `${it.store_id}|${info.code}`;
    const cur = agg.get(k) || { legacyCode: it.store_id, storeId, itemId: info.id, itemCode: info.code, qty: 0, minQty: null };
    cur.qty += parseFloat(it.quantity) || 0;
    if (it.min_quantity != null) {
      const m = parseFloat(it.min_quantity) || 0;
      cur.minQty = cur.minQty == null ? m : Math.max(cur.minQty, m);
    }
    agg.set(k, cur);
  }

  let posted = 0;
  let skipped = 0;
  for (const row of agg.values()) {
    if (row.qty <= 0) { skipped += 1; continue; }
    const idemKey = `opening:${row.legacyCode}:${row.itemCode}`;
    try {
      await ledger.openingBalance({
        storeId: row.storeId, itemId: row.itemId, quantity: row.qty, unitCost: 0,
        idempotencyKey: idemKey, userId: adminId, userRole: 'admin',
      });
      posted += 1;
    } catch (e) {
      if (e instanceof InventoryError && e.code === 'IDEMPOTENT_REPLAY') { skipped += 1; continue; }
      throw e;
    }
    // carry min_quantity onto the balance row
    if (row.minQty != null) {
      await pool.query(
        `UPDATE store_item_balances SET min_quantity = $3 WHERE store_id = $1 AND item_id = $2`,
        [row.storeId, row.itemId, row.minQty]
      );
    }
  }
  console.log(`📒 opening balances posted: ${posted}, skipped: ${skipped}`);
}

async function main() {
  if (!isConfigured()) {
    console.error('❌ DB not configured.');
    process.exit(1);
  }
  const pool = getPool();
  console.log('🚀 JSON -> PG inventory migration starting...');

  await syncUsers(pool);
  await ensureLegacyStores(pool);
  const storeMap = await getStoreMap(pool);

  const storeItems = readJson('store_inventory.json');
  console.log(`   legacy store items: ${storeItems.length}`);

  const adminRow = await pool.query(`SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1`);
  const adminId = adminRow.rows[0] ? Number(adminRow.rows[0].id) : 1;

  const itemInfo = await upsertItems(pool, storeItems);
  await migrateOpeningBalances(pool, storeItems, storeMap, itemInfo, adminId);

  // archive the JSON files (read-only) — never delete
  try {
    const archive = path.join(DATA_DIR, '_archived_pre_pg');
    fs.mkdirSync(archive, { recursive: true });
    for (const f of ['store_inventory.json']) {
      const src = path.join(DATA_DIR, f);
      if (fs.existsSync(src)) fs.copyFileSync(src, path.join(archive, `${f}.${Date.now()}.bak`));
    }
    console.log('🗄️  JSON snapshot archived to data/_archived_pre_pg/');
  } catch (e) { console.warn('   archive warning:', e.message); }

  console.log('✅ Migration complete. Run: npm run inv:verify');
  await closePool();
}

main().catch(async (e) => { console.error('❌ Migration failed:', e); await closePool(); process.exit(1); });
