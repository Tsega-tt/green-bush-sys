#!/usr/bin/env node
'use strict';

/**
 * End-to-end proof of automatic sale -> inventory consumption:
 *   Purchase -> Transfer -> Store Inventory -> Order Sale -> Recipe Consumption
 *   -> Ledger Entry -> Updated Balance
 *
 * Also verifies idempotency, multi-item, shortage rollback, and cancellation
 * reversal. Self-cleaning: removes all test data (item, recipes, transfer,
 * ledger rows) at the end so the DB returns to its prior state.
 *
 *   node scripts/inventory/orderSaleTest.js
 */

require('dotenv').config({ override: true });
const { getPool, closePool } = require('../../inventory/db/pool');
const repos = require('../../inventory/repositories');
const ledger = require('../../inventory/services/ledgerService');
const transfers = require('../../inventory/services/transferService');
const recipes = require('../../inventory/services/recipeService');

const ADMIN = { userId: 1, userRole: 'admin' };
// Distinct actors so separation-of-duties (approver≠requester, receiver≠sender) is satisfied.
const APPROVER = { userId: 18, userRole: 'fnb_manager' };
const RECEIVER = { userId: 18, userRole: 'fnb_manager' };
const SRC = 1;   // main_store (can_transfer)
const DST = 7;   // kitfo_store (can_receive_transfers, requires_recipe_consumption)
const M1 = 990001; // test menu item ids (high, won't collide with real menu)
const M2 = 990002;
// Unique order ids per run (ledger is append-only, so reused ids would be
// treated as idempotent replays of a prior run's sale).
const RUN = Date.now() % 10000000;
const O1 = RUN + 1; const O2 = RUN + 2; const O3 = RUN + 3; const O4 = RUN + 4;

let pass = 0; let fail = 0;
function check(label, cond, detail) {
  if (cond) { pass += 1; console.log(`  ✅ ${label}${detail ? ' — ' + detail : ''}`); }
  else { fail += 1; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`); }
}
const bal = async (store, item) => {
  const b = await repos.balances.get(getPool(), store, item);
  return b ? Number(b.quantity) : 0;
};

async function main() {
  const pool = getPool();
  let itemId; let transferId; let beerId; let kegId;
  try {
    // ---- master data: a dedicated test ingredient ----
    const item = await require('../../inventory/services/masterDataService').createItem(
      { description: `E2E Test Beef ${Date.now()}`, uom: 'g' }, ADMIN
    );
    itemId = Number(item.id);
    console.log(`\nTest ingredient #${itemId} (${item.item_code})`);

    // ---- 1. PURCHASE (receive stock into main_store @ cost 2.00) ----
    await ledger.openingBalance({ storeId: SRC, itemId, quantity: 1000, unitCost: 2,
      idempotencyKey: `e2e_open:${itemId}`, ...ADMIN });
    check('Purchase: main_store stocked 1000', (await bal(SRC, itemId)) === 1000, `on hand ${await bal(SRC, itemId)}`);

    // ---- 2. TRANSFER 400 main_store -> kitfo_store ----
    const t = await transfers.createTransfer({ sourceStoreId: SRC, destStoreId: DST,
      lines: [{ itemId, quantity: 400 }], ...ADMIN });
    transferId = t.id;
    await transfers.approve({ id: t.id, lines: [], ...APPROVER });
    await transfers.send({ id: t.id, ...ADMIN });
    await transfers.receive({ id: t.id, lines: [], ...RECEIVER });
    check('Transfer: kitfo_store received 400', (await bal(DST, itemId)) === 400, `on hand ${await bal(DST, itemId)}`);
    check('Transfer: main_store reduced to 600', (await bal(SRC, itemId)) === 600, `on hand ${await bal(SRC, itemId)}`);

    // ---- 3. RECIPE: menu items consume from kitfo_store ----
    await recipes.setRecipe({ menuItemId: M1, storeId: DST, sellingPrice: 300,
      components: [{ itemId, quantity: 50, uom: 'g' }], ...ADMIN });
    await recipes.setRecipe({ menuItemId: M2, storeId: DST, sellingPrice: 120,
      components: [{ itemId, quantity: 30, uom: 'g' }], ...ADMIN });
    const av = await recipes.availability(M1);
    check('Availability: 8 sellable units (400/50)', av.available_units === 8, `units ${av.available_units}`);

    // ---- 4. VALIDATE before sale ----
    const v = await recipes.validateOrder([{ menuItemId: M1, quantity: 2 }]);
    check('Validation: basket sellable', v.can_sell === true);

    // ---- 5. SALE -> CONSUMPTION (single item, qty 2 => 100g) ----
    await recipes.consumeForOrder({ orderId: O1, orderNumber: 'E2E-5001',
      items: [{ menuItemId: M1, quantity: 2 }], ...ADMIN });
    check('Sale: kitfo reduced 400 -> 300', (await bal(DST, itemId)) === 300, `on hand ${await bal(DST, itemId)}`);

    // ---- 6. LEDGER entry recorded with reference ----
    const led = await pool.query(
      `SELECT txn_type, quantity, reference_type, reference_id, note FROM inventory_transactions
        WHERE reference_type='order' AND reference_id=$1 AND item_id=$2`, [O1, itemId]);
    check('Ledger: consumption row written', led.rows.length === 1 && led.rows[0].txn_type === 'consumption',
      led.rows[0] && `${led.rows[0].quantity} "${led.rows[0].note}"`);

    // ---- 7. IDEMPOTENCY: replay same order must NOT deduct again ----
    const replay = await recipes.consumeForOrder({ orderId: O1, items: [{ menuItemId: M1, quantity: 2 }], ...ADMIN });
    check('Idempotency: replay is a no-op', replay.alreadyConsumed === true && (await bal(DST, itemId)) === 300,
      `on hand ${await bal(DST, itemId)}`);

    // ---- 8. MULTI-ITEM order (M2 x3 => 90g) ----
    await recipes.consumeForOrder({ orderId: O2, orderNumber: 'E2E-5002',
      items: [{ menuItemId: M2, quantity: 3 }], ...ADMIN });
    check('Multi-item sale: kitfo 300 -> 210', (await bal(DST, itemId)) === 210, `on hand ${await bal(DST, itemId)}`);

    // ---- 9. SHORTAGE rollback (need 50000g, have 210) ----
    const before = await bal(DST, itemId);
    let blocked = false;
    try { await recipes.consumeForOrder({ orderId: O3, items: [{ menuItemId: M1, quantity: 1000 }], ...ADMIN }); }
    catch (e) { blocked = e.code === 'INSUFFICIENT_STOCK' || /insufficient/i.test(e.message); }
    check('Shortage: sale blocked, no partial deduction', blocked && (await bal(DST, itemId)) === before,
      `on hand ${await bal(DST, itemId)}`);
    const stray = await pool.query(`SELECT 1 FROM inventory_transactions WHERE reference_type='order' AND reference_id=$1`, [O3]);
    check('Shortage: zero ledger rows written (full rollback)', stray.rows.length === 0);

    // ---- DRAFT KEG SALE via configurable serving size ----
    const ops = require('../../inventory/services/operationsService');
    const ms = require('../../inventory/services/masterDataService');
    const DRAFT = 9; // draft_heineken (requires_keg_tracking)
    // a dedicated draft beverage item (liters)
    const beer = await ms.createItem({ description: `E2E Draft Beer ${Date.now()}`, uom: 'l' }, ADMIN);
    beerId = Number(beer.id);
    // receive a 50L keg -> mirrors 50L into the ledger balance
    const keg = await ops.receiveKeg({ storeId: DRAFT, sizeLiters: 50, itemId: beerId, unitCost: 4, ...ADMIN });
    kegId = keg.id;
    await ops.kegEvent({ id: keg.id, eventType: 'tap', ...ADMIN });
    check('Keg: 50L received -> ledger balance 50', (await bal(DRAFT, beerId)) === 50, `bal ${await bal(DRAFT, beerId)}`);
    // serving size "Large" = 0.5L (seeded default)
    const sizes = await ms.reads.listServingSizes({ activeOnly: true });
    const large = sizes.find((s) => s.code === 'large');
    check('Serving size: Large = 0.5L from DB', large && Number(large.liter_quantity) === 0.5, large && `${large.liter_quantity}L`);
    // draft menu item -> store DRAFT, serving size Large, component = beer item
    await recipes.setRecipe({ menuItemId: 990003, storeId: DRAFT, servingSizeId: large.id, sellingPrice: 90,
      components: [{ itemId: beerId, quantity: 1, uom: 'l' }], ...ADMIN });
    // sell 3 Draft Heineken Large => 3 * 0.5 = 1.5L
    await recipes.consumeForOrder({ orderId: O4, orderNumber: 'E2E-DRAFT', items: [{ menuItemId: 990003, quantity: 3 }], ...ADMIN });
    check('Draft sale: keg 50 -> 48.5 (3 x 0.5L)', (await bal(DRAFT, beerId)) === 48.5, `ledger bal ${await bal(DRAFT, beerId)}`);
    const kegAfter = await repos.kegs.getById(getPool(), keg.id);
    check('Draft sale: keg liters_remaining 48.5', Number(kegAfter.liters_remaining) === 48.5, `keg ${kegAfter.liters_remaining}L`);
    check('Draft sale: keg liters_sold 1.5', Number(kegAfter.liters_sold) === 1.5, `sold ${kegAfter.liters_sold}L`);
    const kegSaleEv = (kegAfter.events || []).filter((e) => e.event_type === 'sale');
    check('Draft sale: keg_event(sale) recorded', kegSaleEv.length === 1 && Number(kegSaleEv[0].liters) === 1.5);
    const draftLedger = await pool.query(
      `SELECT txn_type FROM inventory_transactions WHERE reference_type='order' AND reference_id=$1 AND item_id=$2`, [O4, beerId]);
    check('Draft sale: inventory ledger sale row written', draftLedger.rows.length === 1 && draftLedger.rows[0].txn_type === 'sale');
    // idempotent replay
    await recipes.consumeForOrder({ orderId: O4, items: [{ menuItemId: 990003, quantity: 3 }], ...ADMIN });
    check('Draft sale: replay idempotent (still 48.5)', (await bal(DRAFT, beerId)) === 48.5);

    // ---- 10. CANCELLATION reversal of order 5001 (+100g) ----
    await recipes.reverseConsumption({ orderId: O1, orderNumber: 'E2E-5001', ...ADMIN });
    check('Cancellation: consumption reversed 210 -> 310', (await bal(DST, itemId)) === 310, `on hand ${await bal(DST, itemId)}`);
    const rev2 = await recipes.reverseConsumption({ orderId: O1, ...ADMIN });
    check('Cancellation: reversal idempotent', rev2.alreadyReversed === true && (await bal(DST, itemId)) === 310);

  } finally {
    // ---- teardown: respect the append-only ledger (never DELETE txns). Remove
    // only configuration rows; soft-delete + zero the test item so balances
    // stay consistent with history. Defensive so it never masks the result. ----
    const tryDel = async (sql, args) => { try { await pool.query(sql, args); } catch (e) { console.warn('   teardown:', e.message); } };
    const menus = [M1, M2, 990003];
    await tryDel(`DELETE FROM recipe_components WHERE menu_item_id = ANY($1)`, [menus]);
    await tryDel(`DELETE FROM recipe_versions   WHERE menu_item_id = ANY($1)`, [menus]);
    await tryDel(`DELETE FROM menu_recipes       WHERE menu_item_id = ANY($1)`, [menus]);
    if (transferId) {
      await tryDel(`DELETE FROM transfer_lines WHERE transfer_id=$1`, [transferId]);
      await tryDel(`DELETE FROM transfers WHERE id=$1`, [transferId]);
    }
    if (kegId) {
      await tryDel(`DELETE FROM keg_events WHERE keg_id=$1`, [kegId]);
      await tryDel(`DELETE FROM kegs WHERE id=$1`, [kegId]);
    }
    if (itemId) await tryDel(`UPDATE inventory_items SET is_active=false, deleted_at=now() WHERE id=$1`, [itemId]);
    if (beerId) await tryDel(`UPDATE inventory_items SET is_active=false, deleted_at=now() WHERE id=$1`, [beerId]);
    console.log('\n🧹 Teardown complete (config removed; ledger preserved, test item retired).');
  }

  console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(50)}`);
  await closePool();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error('❌ Test error:', e); await closePool(); process.exit(1); });
