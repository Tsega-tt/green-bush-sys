'use strict';

const repos = require('../repositories');
const { getPool } = require('../db/pool');
const { Errors } = require('../errors');

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

module.exports = { hasCapability, requireCapability, invalidate, refresh };
