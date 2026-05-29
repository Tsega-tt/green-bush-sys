#!/usr/bin/env node
'use strict';

/**
 * Creates (or refreshes) a small set of inventory test accounts in PostgreSQL
 * with a KNOWN pin so the UI can be exercised across every role — including
 * owner / purchaser / store_manager, which the legacy data does not contain.
 *
 * Idempotent: re-running just resets these accounts' role/store/pin. It never
 * touches real staff accounts. Login is name + PIN on the PIN-login screen.
 *
 *   node scripts/inventory/seedTestUsers.js            # PIN defaults to 1234
 *   node scripts/inventory/seedTestUsers.js 4321       # custom PIN
 */

require('dotenv').config({ override: true });
const bcrypt = require('bcryptjs');
const db = require('../../config/database');

const PIN = process.argv[2] || '1234';

// store_id is only meaningful for store_manager (scopes their writes). 10 =
// dry_goods, which holds the migrated opening stock.
const USERS = [
  { username: 'inv_admin',     role: 'admin',         first: 'Inv',   last: 'Admin',     store_id: null },
  { username: 'inv_owner',     role: 'owner',         first: 'Inv',   last: 'Owner',     store_id: null },
  { username: 'inv_fnb',       role: 'fnb_manager',   first: 'Inv',   last: 'FnB',       store_id: null },
  { username: 'inv_store',     role: 'store_manager', first: 'Inv',   last: 'Store',     store_id: 10 },
  { username: 'inv_purchaser', role: 'purchaser',     first: 'Inv',   last: 'Purchaser', store_id: null },
];

async function main() {
  const pinHash = bcrypt.hashSync(PIN, 10);
  for (const u of USERS) {
    await db.query(
      `INSERT INTO users (username, email, role, first_name, last_name, is_active, pin_hash, password_hash, store_id)
       VALUES ($1,$2,$3,$4,$5,true,$6,$6,$7)
       ON CONFLICT (username) DO UPDATE SET
         role = EXCLUDED.role, store_id = EXCLUDED.store_id, is_active = true,
         pin_hash = EXCLUDED.pin_hash, password_hash = EXCLUDED.password_hash`,
      [u.username, `${u.username}@test.local`, u.role, u.first, u.last, pinHash, u.store_id]
    );
  }

  const { rows } = await db.query(
    `SELECT username, role, store_id FROM users WHERE username = ANY($1) ORDER BY username`,
    [USERS.map((u) => u.username)]
  );
  console.log(`\n✅ Test accounts ready — PIN for all: ${PIN}\n`);
  console.log('  Username        Role            Store');
  console.log('  ----------------------------------------------');
  for (const r of rows) {
    console.log(`  ${r.username.padEnd(15)} ${String(r.role).padEnd(15)} ${r.store_id || '-'}`);
  }
  console.log('\nLog in on the PIN screen: Name = username, PIN = above.\n');
  process.exit(0);
}

main().catch((e) => { console.error('❌ seedTestUsers failed:', e.message); process.exit(1); });
