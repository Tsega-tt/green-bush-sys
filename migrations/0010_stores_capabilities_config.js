'use strict';

/**
 * Authoritative, data-driven capability matrix for the 9 stores. Behavior is
 * driven entirely by store_capabilities rows — no hardcoded per-store logic.
 *
 * Re-runnable: upserts every (store, capability) so the matrix below is the
 * single source of truth. Flip a value here (or via the Stores admin screen)
 * to change a store's behavior — no code change.
 */
exports.shorthands = undefined;

// Canonical capability keys (order = display order in admin UI).
const KEYS = [
  'can_purchase_directly',
  'can_request_items',
  'can_transfer',
  'can_receive_transfers',
  'can_sell',
  'requires_recipe_consumption',
  'requires_fnb_approval',
  'requires_keg_tracking',
  'tracks_expiry',
  'participates_in_daily_closing',
];

// 1 = enabled. Columns follow KEYS order:
// PD  RI  TI  RT  SD  REC FNB KEG EXP DC
const MATRIX = {
  main_store:     [1, 1, 1, 1, 1, 0, 0, 0, 1, 1],
  mini_store:     [1, 1, 1, 1, 0, 0, 0, 0, 1, 1],
  barman_store:   [1, 1, 1, 1, 1, 0, 0, 0, 0, 1],
  bar_store:      [1, 1, 1, 1, 1, 0, 0, 0, 0, 1],
  pizza_burger:   [0, 1, 1, 1, 1, 1, 0, 0, 0, 1],
  juice_store:    [1, 1, 1, 1, 1, 1, 0, 0, 1, 1],
  kitfo_store:    [0, 1, 1, 1, 1, 1, 0, 0, 1, 1],
  draft_george:   [1, 1, 1, 1, 1, 0, 0, 1, 0, 1],
  draft_heineken: [1, 1, 1, 1, 1, 0, 0, 1, 0, 1],
};

function buildValues() {
  const rows = [];
  for (const [code, flags] of Object.entries(MATRIX)) {
    KEYS.forEach((key, i) => {
      rows.push(`('${code}','${key}',${flags[i] ? 'true' : 'false'})`);
    });
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

exports.down = () => {
  // No-op: capabilities are configuration, not destructive schema. Leaving the
  // rows in place on rollback is intentional (down would orphan store behavior).
};
