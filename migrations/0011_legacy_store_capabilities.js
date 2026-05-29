'use strict';

/**
 * Baseline capabilities for the legacy JSON-migrated stores (dry_goods, bar,
 * pastry, kitchen, barman). These pre-date the 9-store catalog and only carried
 * the original 0007 keys, so the newer capability gates (can_request_items,
 * can_receive_transfers, participates_in_daily_closing) would otherwise block
 * them. Grant a sensible general-purpose set so they stay fully operational.
 *
 * Idempotent. Adjust per store later via the Stores admin screen.
 */
exports.shorthands = undefined;

const LEGACY = ['dry_goods', 'bar', 'pastry', 'kitchen', 'barman'];
const BASELINE = [
  'can_purchase_directly', 'can_request_items', 'can_transfer',
  'can_receive_transfers', 'can_sell', 'tracks_expiry', 'participates_in_daily_closing',
];

function buildValues() {
  const rows = [];
  for (const code of LEGACY) {
    for (const key of BASELINE) rows.push(`('${code}','${key}',true)`);
  }
  return rows.join(',\n        ');
}

exports.up = (pgm) => {
  pgm.sql(`
    WITH caps(store_code, capability_key, enabled) AS (
      VALUES
        ${buildValues()}
    )
    INSERT INTO store_capabilities (store_id, capability_key, enabled)
    SELECT s.id, caps.capability_key, caps.enabled
      FROM caps JOIN stores s ON s.code = caps.store_code
    ON CONFLICT (store_id, capability_key)
      DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
  `);
};

exports.down = () => { /* configuration, not schema — no-op */ };
