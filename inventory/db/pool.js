'use strict';

const { Pool } = require('pg');
const { buildPoolConfig, isConfigured, BUSINESS_TZ } = require('./config');

let pool = null;

function getPool() {
  if (!isConfigured()) {
    throw new Error(
      'Inventory DB not configured. Set DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.'
    );
  }
  if (!pool) {
    pool = new Pool(buildPoolConfig());

    // Pin the session timezone for every pooled connection.
    pool.on('connect', (client) => {
      client.query(`SET TIME ZONE '${BUSINESS_TZ}'`).catch(() => {});
    });

    pool.on('error', (err) => {
      // A broken idle client should not crash the whole process.
      console.error('[inventory] idle pg client error:', err.message);
    });
  }
  return pool;
}

/** Convenience query against the pool (NOT for use inside a transaction). */
async function query(text, params) {
  return getPool().query(text, params);
}

async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, closePool };
