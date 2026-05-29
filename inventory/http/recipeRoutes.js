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

router.get('/recipes/:menuItemId', requireRoles('readInventory'), asyncHandler(async (req, res) => {
  ok(res, { recipe: await svc.getRecipe(V.toInt(req.params.menuItemId, 'menuItemId')) });
}));

router.put('/recipes/:menuItemId', requireRoles('recipes'), asyncHandler(async (req, res) => {
  V.requireFields(req.body, ['store_id', 'components']);
  ok(res, { recipe: await svc.setRecipe({
    menuItemId: V.toInt(req.params.menuItemId, 'menuItemId'),
    storeId: V.toInt(req.body.store_id, 'store_id'),
    availabilityMode: req.body.availability_mode,
    components: (req.body.components || []).map((c) => ({ itemId: V.toInt(c.item_id, 'item_id'),
      quantity: V.positiveNum(c.quantity, 'quantity'), uom: c.uom })),
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
