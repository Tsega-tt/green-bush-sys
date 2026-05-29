'use strict';

/**
 * Document number generation backed by DB sequences (created in migration 0001).
 * Must be called with a transaction client so the number is allocated atomically
 * with the row that uses it. nextval is non-blocking and gap-tolerant by design.
 */

const PREFIX = {
  txn: { seq: 'seq_inventory_txn', prefix: 'ITX', pad: 6 },
  pr: { seq: 'seq_pr', prefix: 'PR', pad: 5 },
  po: { seq: 'seq_po', prefix: 'PO', pad: 5 },
  gr: { seq: 'seq_gr', prefix: 'GRN', pad: 5 },
  transfer: { seq: 'seq_transfer', prefix: 'TRF', pad: 5 },
  waste: { seq: 'seq_waste', prefix: 'WST', pad: 5 },
  count: { seq: 'seq_count', prefix: 'CNT', pad: 5 },
  keg: { seq: 'seq_keg', prefix: 'KEG', pad: 5 },
};

async function nextNumber(client, kind) {
  const cfg = PREFIX[kind];
  if (!cfg) throw new Error(`Unknown document kind: ${kind}`);
  const { rows } = await client.query(`SELECT nextval($1) AS n`, [cfg.seq]);
  const n = String(rows[0].n).padStart(cfg.pad, '0');
  return `${cfg.prefix}-${n}`;
}

module.exports = { nextNumber };
