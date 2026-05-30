'use strict';

/**
 * End-to-end test for the per-item acceptance workflow:
 *   purchaser submits (existing + new item) -> F&B approves one / rejects one
 *   -> store accepts (stock posted) / store rejects -> verify statuses + ledger.
 */
require('dotenv').config({ override: true });
const { getPool } = require('../../inventory/db/pool');
const accept = require('../../inventory/services/acceptanceService');
const master = require('../../inventory/services/masterDataService');

const ADMIN = { userId: 1, userRole: 'admin' };
const FNB = { userId: 18, userRole: 'fnb_manager' };
const STORE = 1; // Main Store

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass += 1; console.log(`  ✅ ${label}${extra ? ' — ' + extra : ''}`); }
  else { fail += 1; console.log(`  ❌ ${label}${extra ? ' — ' + extra : ''}`); }
}
const bal = async (store, item) => {
  const { rows } = await getPool().query('SELECT quantity FROM store_item_balances WHERE store_id=$1 AND item_id=$2', [store, item]);
  return rows[0] ? Number(rows[0].quantity) : 0;
};

async function main() {
  const pool = getPool();
  let existingId; let createdNewId; let i1; let i2; let i3;
  try {
    // An existing master item to reference.
    const ex = await master.createItem({ description: `ACC existing ${Date.now()}`, uom: 'kg' }, ADMIN);
    existingId = Number(ex.id);

    // ---- 1. Purchaser submits a batch: one existing item + one NEW item + one to reject ----
    const batch = await accept.createBatch({
      ...ADMIN, purchaserName: 'Test Purchaser', supplierName: 'ACME Foods',
      supplierInfo: 'ACME Foods PLC, +251...', invoiceNumber: 'INV-9001', grnNumber: 'GRN-9001',
      items: [
        { itemId: existingId, description: ex.description, uom: 'kg', quantity: 20, unitCost: 3, destinationStoreId: STORE },
        { isNewItem: true, description: `ACC new ${Date.now()}`, uom: 'box',
          uomAttributes: { units_per_box: 12, base_uom: 'can' }, category: 'Canned',
          quantity: 5, unitCost: 50, destinationStoreId: STORE },
        { itemId: existingId, description: ex.description, uom: 'kg', quantity: 7, unitCost: 3, destinationStoreId: STORE },
      ],
    });
    check('Submit: batch created with number', /^ACC-\d{4}-\d{5}$/.test(batch.batch_number), batch.batch_number);
    check('Submit: 3 items queued awaiting_fnb', batch.items.length === 3 && batch.items.every((x) => x.status === 'awaiting_fnb'));
    [i1, i2, i3] = batch.items.map((x) => x.id);
    createdNewId = Number(batch.items[1].item_id);
    check('Submit: new item created in master', createdNewId > 0, 'item_id ' + createdNewId);

    // ---- 2. F&B: approve i1 + i2, reject i3 ----
    await accept.fnbDecision({ ...FNB, id: i1, decision: 'approve' });
    await accept.fnbDecision({ ...FNB, id: i2, decision: 'approve' });
    const r3 = await accept.fnbDecision({ ...FNB, id: i3, decision: 'reject', reason: 'Wrong supplier' });
    const a1 = await accept.getItem(i1);
    check('F&B approve: i1 -> awaiting_store', a1.status === 'awaiting_store');
    check('F&B reject: i3 -> fnb_rejected with reason', r3.status === 'fnb_rejected' && r3.fnb_reason === 'Wrong supplier');

    // F&B cannot be skipped: store decision on a non-awaiting_store item is blocked
    let blocked = false;
    try { await accept.storeDecision({ ...ADMIN, id: i3, decision: 'accept' }); }
    catch (e) { blocked = /awaiting store/.test(e.message); }
    check('Guard: store cannot accept an F&B-rejected item', blocked);

    // ---- 3. Store: accept i1 (posts stock), reject i2 ----
    const before = await bal(STORE, existingId);
    const acc1 = await accept.storeDecision({ ...ADMIN, id: i1, decision: 'accept' });
    check('Store accept: i1 -> added_to_inventory', acc1.status === 'added_to_inventory');
    check('Store accept: stock increased by 20', (await bal(STORE, existingId)) === before + 20, `bal ${await bal(STORE, existingId)}`);
    const led = await pool.query(`SELECT txn_type, quantity FROM inventory_transactions WHERE reference_type='acceptance_item' AND reference_id=$1`, [i1]);
    check('Store accept: ledger purchase_receipt written', led.rows.length === 1 && led.rows[0].txn_type === 'purchase_receipt' && Number(led.rows[0].quantity) === 20);

    const rej2 = await accept.storeDecision({ ...ADMIN, id: i2, decision: 'reject', reason: 'Damaged on arrival' });
    check('Store reject: i2 -> store_rejected with reason', rej2.status === 'store_rejected' && rej2.store_reason === 'Damaged on arrival');
    const newBal = await bal(STORE, createdNewId);
    check('Store reject: no stock posted for rejected item', newBal === 0, `bal ${newBal}`);

    // ---- 4. Idempotency: re-accepting i1 must not double-post ----
    let idem = false;
    try { await accept.storeDecision({ ...ADMIN, id: i1, decision: 'accept' }); }
    catch (e) { idem = /awaiting store/.test(e.message); }
    check('Idempotency: re-accept blocked (already added)', idem && (await bal(STORE, existingId)) === before + 20);

    // ---- 5. Store-scoped listing ----
    const storeItems = await accept.listItems({ storeId: STORE, status: ['added_to_inventory'] });
    check('Listing: store sees its accepted item', storeItems.some((x) => x.id === i1));

    // ---- 6. Event history recorded ----
    const ev = (await accept.getItem(i1)).events;
    check('History: i1 has transition events', ev.length >= 3 && ev.some((e) => e.to_status === 'added_to_inventory'));
  } finally {
    // Cleanup: append-only ledger is preserved; retire test master items + batch.
    try {
      await pool.query(`UPDATE inventory_items SET is_active=false, deleted_at=now() WHERE id = ANY($1)`, [[existingId, createdNewId].filter(Boolean)]);
    } catch { /* ignore */ }
    console.log('\n🧹 Teardown complete (ledger preserved, test items retired).');
  }
  console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(50)}`);
  await getPool().end();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('Test error:', e); process.exit(1); });
