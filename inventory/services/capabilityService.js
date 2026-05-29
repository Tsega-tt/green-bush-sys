'use strict';

const repos = require('../repositories');
const { getPool } = require('../db/pool');
const { Errors } = require('../errors');

/**
 * Canonical catalog of every capability the engine understands. This is the
 * list of POSSIBLE behaviors; whether each is ON for a given store lives in
 * store_capabilities (data). The admin UI renders toggles from this catalog.
 */
const CAPABILITY_CATALOG = [
  { key: 'can_purchase_directly', label: 'Can Purchase Directly', description: 'May raise Purchase Orders directly to suppliers' },
  { key: 'can_request_items', label: 'Can Request Items', description: 'May raise Purchase/Item Requests for approval' },
  { key: 'can_transfer', label: 'Can Transfer Items', description: 'May send stock transfers to other stores' },
  { key: 'can_receive_transfers', label: 'Can Receive Transfers', description: 'May receive stock transfers from other stores' },
  { key: 'can_sell', label: 'Can Sell Directly', description: 'Acts as a sales point of issue' },
  { key: 'requires_recipe_consumption', label: 'Uses Recipe/BOM Consumption', description: 'Sales deduct ingredients via recipe/BOM' },
  { key: 'requires_fnb_approval', label: 'Requires F&B Approval', description: 'Movements require F&B manager approval' },
  { key: 'requires_keg_tracking', label: 'Requires Keg Tracking', description: 'Beverages tracked by keg with liter lifecycle' },
  { key: 'tracks_expiry', label: 'Tracks Expiry Dates', description: 'Batches carry expiry; FEFO + expiry alerts' },
  { key: 'participates_in_daily_closing', label: 'Participates In Daily Closing', description: 'Included in daily closing reconciliation' },
];

/**
 * In-memory capability cache. Behavior is data-driven (store_capabilities);
 * this just avoids a DB hit on every check. Invalidated on any capability write
 * and on a short TTL as a safety net for multi-process deployments.
 */
const TTL_MS = parseInt(process.env.INVENTORY_CAP_CACHE_TTL_MS || '60000', 10);
let cache = null; // Map<`${storeId}:${key}`, true>
let loadedAt = 0;

async function refresh() {
  const rows = await repos.capabilities.allEnabled(getPool());
  cache = new Set(rows.map((r) => `${r.store_id}:${r.capability_key}`));
  loadedAt = Date.now();
}

async function ensureFresh() {
  if (!cache || Date.now() - loadedAt > TTL_MS) await refresh();
}

function invalidate() {
  cache = null;
  loadedAt = 0;
}

async function hasCapability(storeId, key) {
  await ensureFresh();
  return cache.has(`${storeId}:${key}`);
}

/** Throw FORBIDDEN/CAP_NOT_ENABLED unless the store has the capability. */
async function requireCapability(storeId, key) {
  if (!(await hasCapability(storeId, key))) throw Errors.capNotEnabled(key);
}

module.exports = { hasCapability, requireCapability, invalidate, refresh, CAPABILITY_CATALOG };
