'use strict';

const { balances, batches, ledger, priceHistory } = require('./inventoryRepo');
const { stores, capabilities, items, suppliers, thresholds, usersRepo, servingSizes } = require('./masterRepo');
const { audit, alerts, snapshots } = require('./observabilityRepo');
const { transfers } = require('./transferRepo');
const { pr, po, grn } = require('./procurementRepo');
const { attachments } = require('./attachmentRepo');
const { recipes } = require('./recipeRepo');
const { waste, counts, closings, kegs } = require('./operationsRepo');

module.exports = {
  balances, batches, ledger, priceHistory,
  stores, capabilities, items, suppliers, thresholds, usersRepo, servingSizes,
  audit, alerts, snapshots,
  transfers, pr, po, grn, attachments, recipes,
  waste, counts, closings, kegs,
};
