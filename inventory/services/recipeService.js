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
const capabilityService = require('./capabilityService');
const { qty, num } = require('./money');
const { Errors } = require('../errors');
const sse = require('../realtime/sse');

function withMargin(row) {
  const cost = Number(row.recipe_cost || 0);
  const price = row.selling_price != null ? Number(row.selling_price) : null;
  const gross = price != null ? price - cost : null;
  const margin = price ? Math.round((gross / price) * 1000) / 10 : null;
  return { ...row, recipe_cost: cost, gross_profit: gross, margin_pct: margin };
}

async function setRecipe(p) {
  if (!p.menuItemId) throw Errors.validation('menu_item_id required');
  if (!p.storeId) throw Errors.validation('store_id (production store) required');
  const components = Array.isArray(p.components) ? p.components : [];
  // Inventory-controlled recipes need a BOM; uncontrolled menu items may have none.
  if (p.inventoryControlled !== false && !components.length) {
    throw Errors.validation('An inventory-controlled menu item needs at least one ingredient');
  }
  return withTransaction(async (client) => {
    const store = await repos.stores.getById(client, p.storeId);
    if (!store) throw Errors.notFound('Store');
    for (const c of components) {
      const item = await repos.items.getById(client, c.itemId);
      if (!item) throw Errors.notFound(`Item ${c.itemId}`);
      if (!(num(c.quantity) > 0)) throw Errors.validation('component quantity must be > 0');
    }
    const version = (await recipeRepo.maxVersion(client, p.menuItemId)) + 1;
    const header = await recipeRepo.upsertHeader(client, {
      menuItemId: p.menuItemId, storeId: p.storeId, availabilityMode: p.availabilityMode || 'auto',
      inventoryControlled: p.inventoryControlled, autoDeduct: p.autoDeduct,
      allowSaleWhenInsufficient: p.allowSaleWhenInsufficient, wasteFactorPct: p.wasteFactorPct || 0,
      sellingPrice: p.sellingPrice, servingSize: p.servingSize, servingUom: p.servingUom,
      servingSizeId: p.servingSizeId, version,
    });
    await recipeRepo.replaceComponents(client, p.menuItemId,
      components.map((c) => ({ itemId: c.itemId, quantity: qty(c.quantity), uom: c.uom, wasteFactorPct: c.wasteFactorPct || 0 })));
    const comps = await recipeRepo.getComponents(client, p.menuItemId);
    // Immutable version snapshot — past sales stay linked to the version used.
    await recipeRepo.recordVersion(client, {
      menuItemId: p.menuItemId, version, storeId: p.storeId,
      snapshot: { header, components: comps }, createdBy: p.userId,
    });
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'set_recipe',
      entityType: 'menu_recipe', entityId: p.menuItemId, storeId: p.storeId, newValue: { version, components: comps } });
    return { ...header, components: comps };
  });
}

async function getRecipe(menuItemId) {
  const pool = getPool();
  const header = await recipeRepo.getHeader(pool, menuItemId);
  if (!header) return null;
  const cost = await recipeRepo.recipeCost(pool, menuItemId);
  const versions = await recipeRepo.listVersions(pool, menuItemId);
  return withMargin({
    ...header, recipe_cost: cost,
    components: await recipeRepo.getComponents(pool, menuItemId),
    versions,
  });
}

async function listRecipes() {
  const rows = await recipeRepo.list(getPool());
  return rows.map(withMargin);
}

/**
 * Sellable units for a menu item = min over components of floor(onHand / need).
 * Returns { available_units, in_stock, limiting } — used to drive out-of-stock.
 */
/** Per-unit consumption of a component including recipe + component waste. */
function effectivePer(component, header) {
  const waste = (num(component.waste_factor_pct) + num(header.waste_factor_pct)) / 100;
  return num(component.quantity) * (1 + waste);
}

async function availability(menuItemId) {
  const pool = getPool();
  const header = await recipeRepo.getHeader(pool, menuItemId);
  if (!header || !header.is_active) return { menu_item_id: menuItemId, in_stock: true, available_units: null, reason: 'no_recipe' };
  // Not inventory-controlled => always sellable (e.g. service items).
  if (header.inventory_controlled === false) return { menu_item_id: menuItemId, in_stock: true, available_units: null, reason: 'not_controlled' };
  const components = await recipeRepo.getComponents(pool, menuItemId);
  if (!components.length) return { menu_item_id: menuItemId, in_stock: true, available_units: null, reason: 'no_components' };

  let minUnits = Infinity;
  let limiting = null;
  for (const c of components) {
    const bal = await repos.balances.get(pool, header.store_id, c.item_id);
    const onHand = bal ? num(bal.quantity) : 0;
    const per = effectivePer(c, header);
    const units = per > 0 ? Math.floor(onHand / per) : 0;
    if (units < minUnits) { minUnits = units; limiting = { item_id: c.item_id, description: c.description, on_hand: onHand, per_unit: per }; }
  }
  if (!Number.isFinite(minUnits)) minUnits = 0;
  return {
    menu_item_id: menuItemId, store_id: header.store_id, store_name: header.store_name,
    in_stock: minUnits > 0, available_units: minUnits, limiting,
    allow_sale_when_insufficient: header.allow_sale_when_insufficient,
  };
}

async function availabilityForMany(menuItemIds) {
  const out = {};
  for (const id of menuItemIds) out[id] = await availability(id);
  return out;
}

/**
 * Pre-sale validation: can this basket be fulfilled from inventory?
 * items: [{ menuItemId, quantity }]. Returns { can_sell, lines[] }.
 * A line that allows oversell never blocks the basket but is flagged.
 */
async function validateOrder(items) {
  const lines = [];
  let canSell = true;
  for (const it of (items || [])) {
    const a = await availability(it.menuItemId);
    const requested = num(it.quantity) || 1;
    const enough = a.available_units == null || a.available_units >= requested;
    const blocked = !enough && !a.allow_sale_when_insufficient;
    if (blocked) canSell = false;
    lines.push({
      menu_item_id: it.menuItemId, requested, available_units: a.available_units,
      sufficient: enough, blocked, reason: a.reason, limiting: a.limiting,
    });
  }
  return { can_sell: canSell, lines };
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

    // Build (store,item) -> needed map from recipes (waste-adjusted).
    const need = new Map(); // key `${storeId}:${itemId}` -> { storeId, itemId, qty, allowOversell }
    const kegSales = [];    // draft items: { storeId, itemId, liters, sizeName }
    const lines = [];       // per menu-item provenance (for references / audit)
    for (const it of p.items) {
      const header = await recipeRepo.getHeader(client, it.menuItemId);
      if (!header || !header.is_active) continue;            // no recipe => nothing to deduct
      if (header.inventory_controlled === false) continue;    // not inventory-controlled
      if (header.auto_deduct === false) continue;             // manual deduction only
      const comps = await recipeRepo.getComponents(client, it.menuItemId);

      // Draft beer: keg-tracked store + assigned serving size + a beverage
      // component. Liters come from the configurable serving size (never code),
      // and the sale moves BOTH the active keg and the inventory ledger.
      const kegTracked = await capabilityService.hasCapability(header.store_id, 'requires_keg_tracking');
      if (kegTracked && header.serving_size_id && num(header.serving_liters) > 0 && comps.length) {
        const liters = qty(num(header.serving_liters) * num(it.quantity));
        kegSales.push({ storeId: header.store_id, itemId: comps[0].item_id, liters, sizeName: header.serving_size_name });
        lines.push({ menu_item_id: it.menuItemId, store_id: header.store_id, recipe_version: header.version,
          quantity: num(it.quantity), serving_size: header.serving_size_name, liters });
        continue; // keg path replaces normal component deduction for this item
      }

      lines.push({ menu_item_id: it.menuItemId, store_id: header.store_id, recipe_version: header.version, quantity: num(it.quantity) });
      for (const c of comps) {
        const key = `${header.store_id}:${c.item_id}`;
        const add = effectivePer(c, header) * num(it.quantity);
        const cur = need.get(key) || { storeId: header.store_id, itemId: c.item_id, qty: 0, allowOversell: false };
        cur.qty = qty(cur.qty + add);
        cur.allowOversell = cur.allowOversell || !!header.allow_sale_when_insufficient;
        need.set(key, cur);
      }
    }
    if (!need.size && !kegSales.length) return { consumed: [], note: 'no controlled recipes matched' };

    // Phase 1: validate all (locked) in item_id order. Lines that allow oversell
    // deduct down to zero and raise an over-sale alert instead of blocking.
    const ordered = [...need.values()].sort((a, b) => a.itemId - b.itemId);
    const shortfalls = [];
    for (const n of ordered) {
      const bal = await repos.balances.lockOrCreate(client, n.storeId, n.itemId);
      const onHand = num(bal.quantity);
      if (onHand < n.qty) {
        if (n.allowOversell) {
          await repos.alerts.emit(client, {
            alertType: 'over_sale', severity: 'warning', storeId: n.storeId, itemId: n.itemId,
            entityType: 'order', entityId: p.orderId,
            message: `Oversold item ${n.itemId}: needed ${n.qty}, had ${onHand}`,
            dedupKey: `oversale:${p.orderId}:${n.storeId}:${n.itemId}`,
          });
          n.qty = qty(onHand); // deduct only what exists (never negative)
        } else {
          const item = await repos.items.getById(client, n.itemId);
          shortfalls.push({ store_id: n.storeId, item_id: n.itemId, item: item && item.description,
            available: onHand, required: n.qty });
        }
      }
    }
    if (shortfalls.length) throw Errors.insufficientStock(shortfalls);

    // Phase 2: apply (skip zero-qty lines that were fully oversold).
    const consumed = [];
    let first = true;
    for (const n of ordered) {
      if (!(n.qty > 0)) continue;
      const r = await applyMovement(client, {
        storeId: n.storeId, itemId: n.itemId, direction: 'out', type: 'consumption',
        quantity: n.qty, referenceType: 'order', referenceId: p.orderId,
        idempotencyKey: first ? `order:${p.orderId}` : null,
        userId: p.userId, userRole: p.userRole,
        note: `Sale ${p.orderNumber || ('#' + p.orderId)} consumption`,
      });
      consumed.push({ store_id: n.storeId, item_id: n.itemId, qty: n.qty, balance_after: r.balance.quantity });
      first = false;
    }

    // Draft keg sales: deduct serving-size liters from the active keg AND record
    // an inventory ledger 'sale' for the same liters (kept consistent because the
    // keg receipt mirrors liters into the item balance). All in this transaction.
    for (const ks of kegSales) {
      if (!(ks.liters > 0)) continue;
      const r = await applyMovement(client, {
        storeId: ks.storeId, itemId: ks.itemId, direction: 'out', type: 'sale',
        quantity: ks.liters, referenceType: 'order', referenceId: p.orderId,
        idempotencyKey: first ? `order:${p.orderId}` : null,
        userId: p.userId, userRole: p.userRole,
        note: `Draft sale ${p.orderNumber || ('#' + p.orderId)} (${ks.sizeName || ''} ${ks.liters}L)`,
      });
      first = false;

      const keg = await repos.kegs.lockActiveForItem(client, ks.storeId, ks.itemId);
      if (!keg) throw Errors.businessRule(`No active keg for item ${ks.itemId} in store ${ks.storeId}`);
      if (num(keg.liters_remaining) < ks.liters) {
        throw Errors.insufficientStock([{ keg_id: keg.id, available: num(keg.liters_remaining), required: ks.liters }]);
      }
      const remaining = qty(num(keg.liters_remaining) - ks.liters);
      const fields = { liters_remaining: remaining, liters_sold: qty(num(keg.liters_sold) + ks.liters) };
      if (remaining <= 0) { fields.status = 'empty'; fields.emptied_at = new Date().toISOString(); }
      const updatedKeg = await repos.kegs.update(client, keg.id, fields);
      await repos.kegs.addEvent(client, { kegId: keg.id, eventType: 'sale', liters: ks.liters,
        litersRemainingAfter: remaining, note: `Order ${p.orderNumber || p.orderId}`, createdBy: p.userId });
      if (fields.status === 'empty') {
        const variance = qty(num(updatedKeg.liters_received) - num(updatedKeg.liters_sold) - num(updatedKeg.liters_waste) - num(updatedKeg.liters_remaining));
        if (Math.abs(variance) > 0.001) {
          await repos.alerts.emit(client, { alertType: 'keg_variance', severity: 'warning',
            storeId: keg.store_id, entityType: 'keg', entityId: keg.id,
            message: `Keg ${keg.keg_code} emptied with ${variance}L variance`, dedupKey: `keg_var:${keg.id}` });
        }
      }
      consumed.push({ store_id: ks.storeId, item_id: ks.itemId, qty: ks.liters, keg_id: keg.id, keg_event: 'sale', balance_after: r.balance.quantity });
    }

    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'consume',
      entityType: 'order', entityId: p.orderId,
      newValue: { order_id: p.orderId, order_number: p.orderNumber || null, lines, consumed } });
    return { consumed, lines, order_number: p.orderNumber || null };
  }).then((res) => {
    sse.broadcast('inventory.changed', { reason: 'order', order_id: p.orderId });
    // Tell clients which menu items may have changed availability so they can refresh.
    sse.broadcast('menu.availability', { order_id: p.orderId, menu_item_ids: (p.items || []).map((i) => i.menuItemId) });
    return res;
  });
}

/**
 * Reverse a cancelled order's consumption: re-add each consumed (store,item) at
 * the exact cost basis that was removed (WAC-neutral), as an inbound adjustment.
 * Idempotent per order via reference_type='order_reversal'.
 */
async function reverseConsumption(p) {
  if (!p.orderId) throw Errors.validation('order_id required');
  return withTransaction(async (client) => {
    const dup = await client.query(
      `SELECT id FROM inventory_transactions WHERE reference_type='order_reversal' AND reference_id=$1 LIMIT 1`,
      [p.orderId]
    );
    if (dup.rows.length) return { alreadyReversed: true, orderId: p.orderId };

    // Net consumed per (store,item) from the original consumption rows.
    const { rows } = await client.query(
      `SELECT store_id, item_id,
              SUM(-quantity)::numeric(16,3)  AS qty,
              SUM(-total_cost)::numeric(16,4) AS cost
         FROM inventory_transactions
        WHERE reference_type='order' AND reference_id=$1 AND txn_type IN ('consumption','sale')
        GROUP BY store_id, item_id HAVING SUM(-quantity) > 0
        ORDER BY item_id`,
      [p.orderId]
    );
    if (!rows.length) return { reversed: [], note: 'nothing to reverse' };

    const reversed = [];
    let first = true;
    for (const r of rows) {
      const q = qty(r.qty);
      const unitCost = q > 0 ? num(r.cost) / q : 0;
      const out = await applyMovement(client, {
        storeId: r.store_id, itemId: r.item_id, direction: 'in', type: 'adjustment',
        quantity: q, unitCost, referenceType: 'order_reversal', referenceId: p.orderId,
        idempotencyKey: first ? `order_reversal:${p.orderId}` : null,
        userId: p.userId, userRole: p.userRole,
        note: `Reversal of cancelled sale ${p.orderNumber || ('#' + p.orderId)}`,
      });
      reversed.push({ store_id: r.store_id, item_id: r.item_id, qty: q, balance_after: out.balance.quantity });
      first = false;
    }
    await repos.audit.insert(client, { actorId: p.userId, actorRole: p.userRole, action: 'reverse_consume',
      entityType: 'order', entityId: p.orderId, newValue: { order_number: p.orderNumber || null, reversed } });
    return { reversed };
  }).then((res) => { sse.broadcast('inventory.changed', { reason: 'order_reversal', order_id: p.orderId }); return res; });
}

module.exports = { setRecipe, getRecipe, listRecipes, availability, availabilityForMany, validateOrder, consumeForOrder, reverseConsumption };
