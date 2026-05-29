#!/usr/bin/env node
'use strict';

// Periodic fraud / suspicious-activity scan. Schedule alongside the snapshot job.
require('dotenv').config({ override: true });
const { closePool } = require('../../inventory/db/pool');
const fraud = require('../../inventory/services/fraudService');

(async () => {
  const res = await fraud.runScan();
  console.log(`🔎 Fraud scan complete: ${res.emitted} alert(s) emitted`);
  await closePool();
})().catch(async (e) => { console.error('❌ Fraud scan failed:', e); await closePool(); process.exit(1); });
