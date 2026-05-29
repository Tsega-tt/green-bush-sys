#!/usr/bin/env node
'use strict';

/**
 * Daily snapshot + expiry-alert sweep. Intended to run at 00:00 Africa/Addis_Ababa
 * via OS scheduler (Windows Task Scheduler / cron) or pg_cron. Idempotent.
 */

require('dotenv').config({ override: true });
const { closePool } = require('../../inventory/db/pool');
const { runDailySnapshot, runExpiryAlerts } = require('../../inventory/services/snapshotService');

async function main() {
  const snap = await runDailySnapshot(process.argv[2] || null);
  console.log(`📸 Snapshot ${snap.snapshotDate}: ${snap.written} row(s) written`);
  const exp = await runExpiryAlerts();
  console.log(`⏰ Expiry sweep: scanned ${exp.scanned}, emitted ${exp.emitted} alert(s)`);
  await closePool();
}

main().catch(async (e) => { console.error('❌ Snapshot job failed:', e); await closePool(); process.exit(1); });
