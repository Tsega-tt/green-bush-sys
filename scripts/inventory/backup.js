#!/usr/bin/env node
'use strict';

/**
 * Backup: pg_dump (custom format) -> local dir, checksum, copy to offsite dir.
 * Run nightly via OS scheduler and on demand. Restore runbook:
 *   pg_restore --clean --if-exists -d <db> <dumpfile>
 *
 * Env: INVENTORY_BACKUP_DIR, INVENTORY_BACKUP_OFFSITE_DIR, PG_DUMP_PATH, DB_*.
 */

require('dotenv').config({ override: true });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { buildPgConfig, isConfigured } = require('../../inventory/db/config');

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sha256(file) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(file));
  return hash.digest('hex');
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { env: { ...process.env, ...env } }, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr}`));
      resolve(stdout);
    });
  });
}

async function main() {
  if (!isConfigured()) { console.error('❌ DB not configured.'); process.exit(1); }
  const cfg = buildPgConfig();
  const backupDir = path.resolve(process.env.INVENTORY_BACKUP_DIR || './backups/inventory');
  fs.mkdirSync(backupDir, { recursive: true });

  const outFile = path.join(backupDir, `inv_${cfg.database}_${ts()}.dump`);
  const pgDump = process.env.PG_DUMP_PATH || 'pg_dump';

  console.log(`💾 Dumping ${cfg.database} -> ${outFile}`);
  await run(pgDump, [
    '-h', cfg.host, '-p', String(cfg.port), '-U', cfg.user,
    '-d', cfg.database, '-F', 'c', '-f', outFile,
  ], { PGPASSWORD: cfg.password });

  const checksum = sha256(outFile);
  const size = fs.statSync(outFile).size;
  const manifest = { file: path.basename(outFile), size, checksum_sha256: checksum,
    created_at: new Date().toISOString(), database: cfg.database };
  fs.writeFileSync(`${outFile}.manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`   ${size} bytes, sha256=${checksum}`);

  const offsite = process.env.INVENTORY_BACKUP_OFFSITE_DIR;
  if (offsite && String(offsite).trim()) {
    const dest = path.resolve(offsite);
    fs.mkdirSync(dest, { recursive: true });
    fs.copyFileSync(outFile, path.join(dest, path.basename(outFile)));
    fs.copyFileSync(`${outFile}.manifest.json`, path.join(dest, `${path.basename(outFile)}.manifest.json`));
    console.log(`☁️  Copied to offsite: ${dest}`);
  } else {
    console.log('ℹ️  INVENTORY_BACKUP_OFFSITE_DIR not set — local backup only.');
  }
  console.log('✅ Backup complete.');
}

main().catch((e) => { console.error('❌ Backup failed:', e.message); process.exit(1); });
