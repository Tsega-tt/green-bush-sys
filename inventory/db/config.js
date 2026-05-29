'use strict';

/**
 * Central DB configuration for the inventory domain.
 *
 * The legacy app reads DB_HOST / DB_NAME / DB_USER / DB_PASSWORD / DB_PORT
 * (see config/database.js). We reuse the exact same env vars so there is a
 * single source of truth for the centralized LAN PostgreSQL server.
 *
 * Timezone is pinned to Africa/Addis_Ababa (UTC+3) so every connection
 * computes day boundaries / now() display consistently regardless of the OS
 * locale of the restaurant computer running the process.
 */

const BUSINESS_TZ = process.env.INVENTORY_TZ || 'Africa/Addis_Ababa';

function isConfigured() {
  return Boolean(
    process.env.DB_HOST &&
      process.env.DB_NAME &&
      process.env.DB_USER &&
      process.env.DB_PASSWORD
  );
}

/** Build a node-postgres / node-pg-migrate compatible client config object. */
function buildPgConfig() {
  return {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD || ''),
  };
}

/** Pool tuning for a centralized server hit by multiple LAN clients. */
function buildPoolConfig() {
  return {
    ...buildPgConfig(),
    max: parseInt(process.env.INVENTORY_PG_POOL_MAX || '25', 10),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    // Kill runaway queries so one bad statement cannot hold locks forever.
    statement_timeout: parseInt(process.env.INVENTORY_PG_STATEMENT_TIMEOUT_MS || '15000', 10),
    // Cap how long a txn may hold row locks while idle (anti lock-contention).
    idle_in_transaction_session_timeout: parseInt(
      process.env.INVENTORY_PG_IDLE_TXN_TIMEOUT_MS || '10000',
      10
    ),
  };
}

module.exports = { BUSINESS_TZ, isConfigured, buildPgConfig, buildPoolConfig };
