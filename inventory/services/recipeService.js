'use strict';

/**
 * Phase 4 — recipe/BOM + menu availability + order-driven consumption.
 *
 * Menu items live in the legacy JSON menu; recipes key off the integer
 * menu_item_id. Order completion deducts ingredients automatically through the
 * ledger (FEFO + WAC), atomically and idempotently per order. No manual stock
 * edits, no negative stock.
 */

const repos = require('../repositories');
const { recipes: recipeRepo } = require('../repositories/recipeRepo');
const { withTransaction } = require('../db/withTransaction');
const { getPool } = require('../db/pool');
const { applyMovement } = require('./ledgerService');
const { qty, num } = require('./money');
const { Errors } = require('../errors');
const sse = require('../realtime/sse');

async function setRecipe(p) {
  if (!p.menuItemId) throw Errors.validation('menu_item_id required');
  if (!p.storeId) throw Errors.validation('store_id (production store) required');
  if (!Array.isArray(p.components) || !p.components.length) throw Errors.validation('components[] required');
  return withTransaction(async (client) => {
    const store = await repos.stores.getById(client, p.storeId);
    if (!store) throw Errors.notFound('Store');
    for (const c of p.components) {
      const item = await repos.items.getById(client, c.itemId);
      if (!item) throw Errors.notFound(`Item ${c.itemId}`);
      if (!(num(c.quantity) > 0)) throw Errors.validation('component quantity must be > 0');
    }
    const header = await recipeRepo.upsertHeader(client, {
      menuItemId: p.menuItemId, storeId: p.storeId, availabilityMode: p.availabilityMode || 'auto',
    });
    await recipeRepo.replaceComponents(client, p.menuItemId,
      p.components.map((c) => ({ itemId: c.itemId, quantity: qty(c.quantity), uom: c.uom })));
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'set_recipe',
      entityType: 'menu_recipe', entityId: p.menuItemId, storeId: p.storeId, newValue: { components: p.components } });
    return { ...header, components: await recipeRepo.getComponents(client, p.menuItemId) };
  });
}

async function getRecipe(menuItemId) {
  const pool = getPool();
  const header = await recipeRepo.getHeader(pool, menuItemId);
  if (!header) return null;
  return { ...header, components: await recipeRepo.getComponents(pool, menuItemId) };
}

async function listRecipes() {
  return recipeRepo.list(getPool());
}

/**
 * Sellable units for a menu item = min over components of floor(onHand / need).
 * Returns { available_units, in_stock, limiting } — used to drive out-of-stock.
 */
async function availability(menuItemId) {
  const pool = getPool();
  const header = await recipeRepo.getHeader(pool, menuItemId);
  if (!header || !header.is_active) return { menu_item_id: menuItemId, in_stock: true, available_units: null, reason: 'no_recipe' };
  const components = await recipeRepo.getComponents(pool, menuItemId);
  if (!components.length) return { menu_item_id: menuItemId, in_stock: true, available_units: null, reason: 'no_components' };

  let minUnits = Infinity;
  let limiting = null;
  for (const c of components) {
    const bal = await repos.balances.get(pool, header.store_id, c.item_id);
    const onHand = bal ? num(bal.quantity) : 0;
    const per = num(c.quantity);
    const units = per > 0 ? Math.floor(onHand / per) : 0;
    if (units < minUnits) { minUnits = units; limiting = { item_id: c.item_id, description: c.description, on_hand: onHand, per_unit: per }; }
  }
  if (!Number.isFinite(minUnits)) minUnits = 0;
  return { menu_item_id: menuItemId, store_id: header.store_id, in_stock: minUnits > 0, available_units: minUnits, limiting };
}

async function availabilityForMany(menuItemIds) {
  const out = {};
  for (const id of menuItemIds) out[id] = await availability(id);
  return out;
}

/**
 * Deduct ingredients for a completed order. Atomic across all production stores,
 * idempotent per order (reference_type='order', reference_id=orderId).
 *
 * items: [{ menuItemId, quantity }]
 */
async function consumeForOrder(p) {
  if (!p.orderId) throw Errors.validation('order_id required');
  if (!Array.isArray(p.items) || !p.items.length) throw Errors.validation('items[] required');

  return withTransaction(async (client) => {
    // Idempotency: already consumed?
    const existing = await client.query(
      `SELECT id FROM inventory_transactions WHERE reference_type='order' AND reference_id=$1 LIMIT 1`,
      [p.orderId]
    );
    if (existing.rows.length) return { alreadyConsumed: true, orderId: p.orderId };

    // Build (store,item) -> needed map from recipes.
    const need = new Map(); // key `${storeId}:${itemId}` -> { storeId, itemId, qty }
    for (const it of p.items) {
      const header = await recipeRepo.getHeader(client, it.menuItemId);
      if (!header || !header.is_active) continue; // no recipe => nothing to deduct
      const comps = await recipeRepo.getComponents(client, it.menuItemId);
      for (const c of comps) {
        const key = `${header.store_id}:${c.item_id}`;
        const add = num(c.quantity) * num(it.quantity);
        const cur = need.get(key) || { storeId: header.store_id, itemId: c.item_id, qty: 0 };
        cur.qty = qty(cur.qty + add);
        need.set(key, cur);
      }
    }
    if (!need.size) return { consumed: [], note: 'no recipes matched' };

    // Phase 1: validate all (locked) in item_id order.
    const ordered = [...need.values()].sort((a, b) => a.itemId - b.itemId);
    const shortfalls = [];
    for (const n of ordered) {
      const bal = await repos.balances.lockOrCreate(client, n.storeId, n.itemId);
      if (num(bal.quantity) < n.qty) {
        const item = await repos.items.getById(client, n.itemId);
        shortfalls.push({ store_id: n.storeId, item_id: n.itemId, item: item && item.description,
          available: num(bal.quantity), required: n.qty });
      }
    }
    if (shortfalls.length) throw Errors.insufficientStock(shortfalls);

    // Phase 2: apply.
    const consumed = [];
    let first = true;
    for (const n of ordered) {
      const r = await applyMovement(client, {
        storeId: n.storeId, itemId: n.itemId, direction: 'out', type: 'consumption',
        quantity: n.qty, referenceType: 'order', referenceId: p.orderId,
        idempotencyKey: first ? `order:${p.orderId}` : null,
        userId: p.userId, userRole: p.userRole, note: `Order ${p.orderId} consumption`,
      });
      consumed.push({ store_id: n.storeId, item_id: n.itemId, qty: n.qty, balance_after: r.balance.quantity });
      first = false;
    }
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'consume',
      entityType: 'order', entityId: p.orderId, newValue: { consumed } });
    return { consumed };
  }).then((res) => { sse.broadcast('inventory.changed', { reason: 'order', order_id: p.orderId }); return res; });
}

module.exports = { setRecipe, getRecipe, listRecipes, availability, availabilityForMany, consumeForOrder };
