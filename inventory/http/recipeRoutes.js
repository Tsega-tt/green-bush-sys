'use strict';

const express = require('express');
const svc = require('../services/recipeService');
const { resolveUser, requireRoles, asyncHandler, ok } = require('./permissions');
const V = require('./validators');

const router = express.Router();
router.use(resolveUser);

router.get('/recipes', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { recipes: await svc.listRecipes() });
}));

// Menu profitability: recipe cost (WAC-based) vs selling price + margin.
router.get('/reports/menu-profitability', requireRoles('reports'), asyncHandler(async (req, res) => {
  const rows = (await svc.listRecipes()).map((r) => ({
    menu_item_id: r.menu_item_id, store_name: r.store_name, components: Number(r.component_count),
    recipe_cost: r.recipe_cost, selling_price: r.selling_price,
    gross_profit: r.gross_profit, margin_pct: r.margin_pct,
  }));
  ok(res, { rows });
}));

router.get('/recipes/:menuItemId', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { recipe: await svc.getRecipe(V.toInt(req.params.menuItemId, 'menuItemId')) });
}));

router.put('/recipes/:menuItemId', requireRoles('recipes'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id']);
  const b = req.body;
  ok(res, { recipe: await svc.setRecipe({
    menuItemId: V.toInt(req.params.menuItemId, 'menuItemId'),
    storeId: V.toInt(b.store_id, 'store_id'),
    availabilityMode: b.availability_mode,
    inventoryControlled: b.inventory_controlled,
    autoDeduct: b.auto_deduct,
    allowSaleWhenInsufficient: b.allow_sale_when_insufficient,
    wasteFactorPct: b.waste_factor_pct != null ? V.nonNegNum(b.waste_factor_pct, 'waste_factor_pct') : 0,
    sellingPrice: b.selling_price != null ? V.nonNegNum(b.selling_price, 'selling_price') : null,
    servingSize: b.serving_size != null ? V.positiveNum(b.serving_size, 'serving_size') : null,
    servingUom: b.serving_uom,
    servingSizeId: b.serving_size_id != null ? V.toInt(b.serving_size_id, 'serving_size_id') : null,
    components: (b.components || []).map((c) => ({ itemId: V.toInt(c.item_id, 'item_id'),
      quantity: V.positiveNum(c.quantity, 'quantity'), uom: c.uom,
      wasteFactorPct: c.waste_factor_pct != null ? V.nonNegNum(c.waste_factor_pct, 'waste_factor_pct') : 0 })),
    userId: req.invUser.id, userRole: req.invUser.role,
  }) });
}));

router.get('/menu/:menuItemId/availability', requireRoles('orderConsume'), asyncHandler(async (req, res) => {
  ok(res, { availability: await svc.availability(V.toInt(req.params.menuItemId, 'menuItemId')) });
}));

router.post('/menu/availability', requireRoles('orderConsume'), asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.menu_item_ids) ? req.body.menu_item_ids.map((x) => parseInt(x, 10)) : [];
  ok(res, { availability: await svc.availabilityForMany(ids) });
}));

/**
 * Pre-sale validation: confirm a basket can be fulfilled from inventory before
 * accepting the order. Does NOT deduct. items:[{menu_item_id, quantity}].
 */
router.post('/orders/validate', requireRoles('orderConsume'), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  ok(res, await svc.validateOrder(items.map((i) => ({
    menuItemId: V.toInt(i.menu_item_id, 'menu_item_id'),
    quantity: i.quantity != null ? V.positiveNum(i.quantity, 'quantity') : 1,
  }))));
}));

/**
 * Order consumption hook. Call from order completion (legacy server can POST
 * here). Idempotent per order; no-op if no recipes match.
 */
router.post('/orders/:orderId/consume', requireRoles('orderConsume'), asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  ok(res, await svc.consumeForOrder({
    orderId: V.toInt(req.params.orderId, 'orderId'),
    items: items.map((i) => ({ menuItemId: V.toInt(i.menu_item_id, 'menu_item_id'),
      quantity: V.positiveNum(i.quantity, 'quantity') })),
    userId: req.invUser.id, userRole: req.invUser.role,
  }));
}));

module.exports = router;
