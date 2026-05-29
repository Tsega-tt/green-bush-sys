'use strict';

const express = require('express');
const { reports } = require('../services/reportingService');
const fraud = require('../services/fraudService');
const { resolveUser, requireRoles, asyncHandler, ok } = require('./permissions');
const V = require('./validators');

const router = express.Router();
router.use(resolveUser);

function range(req) {
  return {
    storeId: req.query.store_id ? V.toInt(req.query.store_id, 'store_id') : null,
    from: req.query.from || null, to: req.query.to || null,
  };
}

router.get('/reports/valuation', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.valuation(range(req)) })));

router.get('/reports/valuation-trend', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.valuationTrend({ storeId: range(req).storeId,
    days: req.query.days ? V.toInt(req.query.days, 'days') : 30 }) })));

router.get('/reports/current-stock', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.currentStock(range(req)) })));

router.get('/reports/low-stock', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.lowStock(range(req)) })));

router.get('/reports/out-of-stock', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.outOfStock(range(req)) })));

router.get('/reports/consumption', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.consumption(range(req)) })));

router.get('/reports/waste', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.waste(range(req)) })));

router.get('/reports/transfers', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.transfers(range(req)) })));

router.get('/reports/purchases', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.purchases(range(req)) })));

router.get('/reports/supplier-performance', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.supplierPerformance() })));

router.get('/reports/variance', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.variance(range(req)) })));

router.get('/reports/expiry', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.expiry({ storeId: range(req).storeId,
    withinDays: req.query.within_days ? V.toInt(req.query.within_days, 'within_days') : 30 }) })));

router.get('/reports/price-history', requireRoles('reports'), asyncHandler(async (req, res) => {
  V.requireFields(req.query, ['item_id']);
  ok(res, { rows: await reports.priceHistory({ itemId: V.toInt(req.query.item_id, 'item_id') }) });
}));

router.get('/reports/kegs', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.kegs(range(req)) })));

router.get('/reports/daily-closings', requireRoles('reports'), asyncHandler(async (req, res) =>
  ok(res, { rows: await reports.dailyClosings({ storeId: range(req).storeId }) })));

// Fraud / suspicious-activity scan (manual trigger; normally scheduled).
router.post('/fraud/scan', requireRoles('ops'), asyncHandler(async (req, res) =>
  ok(res, await fraud.runScan())));

module.exports = router;
