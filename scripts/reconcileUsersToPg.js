'use strict';

/**
 * One-time reconciliation: push every legacy (data/users.json) user that has an
 * inventory-relevant role into the PostgreSQL `users` table the inventory module
 * reads, and align the legacy id to the PG id so login (JSON) and inventory auth
 * (PG, by x-user-id) share one identity. Existing pin/password hashes are copied
 * as-is (no re-hash). Safe to run repeatedly.
 */
require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const db = require('../config/database');

const USERS_FILE = path.join(__dirname, '..', 'data', 'users.json');
const INV_ROLES = ['admin', 'owner', 'fnb_manager', 'store_admin', 'store_manager', 'purchaser', 'hr_admin', 'item_request'];

async function upsert(u) {
  // Avoid email unique-constraint clashes: only keep the email if no other
  // username already owns it; otherwise store null (login is by name/PIN anyway).
  let email = u.email && String(u.email).trim() ? String(u.email).trim() : null;
  if (email) {
    const taken = await db.query('SELECT 1 FROM users WHERE LOWER(email)=LOWER($1) AND LOWER(username)<>LOWER($2)', [email, u.username]);
    if (taken.rows[0]) email = null;
  }
  if (!email) email = `${u.username}@local.kidist`; // email column is NOT NULL + unique
  const ex = await db.query('SELECT id FROM users WHERE LOWER(username) = LOWER($1)', [u.username]);
  if (ex.rows[0]) {
    const id = ex.rows[0].id;
    await db.query(
      `UPDATE users SET email=$2, role=$3, first_name=$4, last_name=$5, is_active=$6,
         pin_hash=COALESCE($7, pin_hash), password_hash=COALESCE($8, password_hash), updated_at=NOW()
       WHERE id=$1`,
      [id, email, u.role, u.first_name || null, u.last_name || null, u.is_active !== false, u.pin_hash || null, u.password_hash || null]
    );
    return id;
  }
  const ins = await db.query(
    `INSERT INTO users (username, email, password_hash, pin_hash, role, first_name, last_name, is_active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW()) RETURNING id`,
    [u.username, email, u.password_hash || null, u.pin_hash || null, u.role, u.first_name || null, u.last_name || null, u.is_active !== false]
  );
  return ins.rows[0].id;
}

(async () => {
  if (!db.pool) { console.error('No PG pool — set DB_* in .env'); process.exit(1); }
  if (!fs.existsSync(USERS_FILE)) { console.error('No data/users.json'); process.exit(1); }
  const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  let synced = 0, realigned = 0;
  for (const u of users) {
    if (!u || !u.username || !INV_ROLES.includes(u.role)) continue;
    const pgId = await upsert(u);
    synced += 1;
    if (Number(u.id) !== Number(pgId)) {
      console.log(`  realign ${u.username}: json id ${u.id} -> pg id ${pgId}`);
      u.id = pgId;
      realigned += 1;
    } else {
      console.log(`  ok ${u.username} (id ${pgId}, ${u.role})`);
    }
  }
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.log(`\n✅ Reconciled ${synced} inventory-role users into PG (${realigned} ids realigned).`);
  process.exit(0);
})().catch((e) => { console.error('Reconcile failed:', e.message); process.exit(1); });
