'use strict';

/**
 * Connects Menu <-> Store <-> Inventory: recipe control settings, per-ingredient
 * waste, cached selling price (for costing/margin), recipe versioning, and an
 * immutable version-history table so past sales stay linked to the recipe used
 * at the time. Idempotent / additive.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE menu_recipes
      ADD COLUMN IF NOT EXISTS inventory_controlled         BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS auto_deduct                  BOOLEAN NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS allow_sale_when_insufficient BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS waste_factor_pct             NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (waste_factor_pct >= 0),
      ADD COLUMN IF NOT EXISTS selling_price                NUMERIC(14,2),
      ADD COLUMN IF NOT EXISTS serving_size                 NUMERIC(14,3),
      ADD COLUMN IF NOT EXISTS serving_uom                  VARCHAR(20),
      ADD COLUMN IF NOT EXISTS version                      INTEGER NOT NULL DEFAULT 1;

    ALTER TABLE recipe_components
      ADD COLUMN IF NOT EXISTS waste_factor_pct NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (waste_factor_pct >= 0);

    -- Immutable snapshot of each recipe version (components + settings as JSON).
    CREATE TABLE IF NOT EXISTS recipe_versions (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      menu_item_id INTEGER NOT NULL,
      version      INTEGER NOT NULL,
      store_id     BIGINT NOT NULL,
      snapshot     JSONB  NOT NULL,
      created_by   INTEGER,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (menu_item_id, version)
    );
    CREATE INDEX IF NOT EXISTS idx_recipe_versions_menu ON recipe_versions(menu_item_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS recipe_versions;
    ALTER TABLE recipe_components DROP COLUMN IF EXISTS waste_factor_pct;
    ALTER TABLE menu_recipes
      DROP COLUMN IF EXISTS inventory_controlled,
      DROP COLUMN IF EXISTS auto_deduct,
      DROP COLUMN IF EXISTS allow_sale_when_insufficient,
      DROP COLUMN IF EXISTS waste_factor_pct,
      DROP COLUMN IF EXISTS selling_price,
      DROP COLUMN IF EXISTS serving_size,
      DROP COLUMN IF EXISTS serving_uom,
      DROP COLUMN IF EXISTS version;
  `);
};
