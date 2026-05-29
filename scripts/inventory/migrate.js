#!/usr/bin/env node
'use strict';

/**
 * Cross-platform programmatic node-pg-migrate runner.
 *
 * Reuses the app's DB_* env vars (no DATABASE_URL juggling on Windows).
 *
 *   node scripts/inventory/migrate.js up      # apply all pending migrations
 *   node scripts/inventory/migrate.js down    # roll back the last migration
 *   node scripts/inventory/migrate.js down 0  # roll back everything
 */

require('dotenv').config({ override: true });
const path = require('path');
const runner = require('node-pg-migrate').default || require('node-pg-migrate');
const { buildPgConfig, isConfigured } = require('../../inventory/db/config');

async function main() {
  if (!isConfigured()) {
    console.error('❌ DB not configured. Set DB_HOST/DB_NAME/DB_USER/DB_PASSWORD in .env');
    process.exit(1);
  }

  const direction = process.argv[2] === 'down' ? 'down' : 'up';
  const countArg = process.argv[3];
  // up: run all pending by default; down: roll back ONE by default (safer).
  const count = countArg !== undefined ? parseInt(countArg, 10) : (direction === 'down' ? 1 : Infinity);

  try {
    const migrated = await runner({
      dbClient: undefined,
      databaseUrl: buildPgConfig(), // node-pg-migrate accepts a config object
      dir: path.join(__dirname, '..', '..', 'migrations'),
      direction,
      count,
      migrationsTable: 'pgmigrations',
      verbose: true,
      // each migration runs in its own transaction (default) — good for DDL
    });
    const names = migrated.map((m) => m.name);
    console.log(`✅ ${direction} complete. ${names.length} migration(s):`);
    names.forEach((n) => console.log('   -', n));
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

main();
