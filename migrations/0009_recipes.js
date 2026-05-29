'use strict';

/**
 * Menu recipe / BOM. menu_item_id is the integer id from the legacy JSON menu
 * (data/menu.json) — there is intentionally no FK to a menu table because the
 * menu lives outside the inventory PG domain for now.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE menu_recipes (
      menu_item_id      INTEGER PRIMARY KEY,
      store_id          BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      availability_mode VARCHAR(20) NOT NULL DEFAULT 'auto'
                          CHECK (availability_mode IN ('auto','manual')),
      is_active         BOOLEAN NOT NULL DEFAULT true,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_menu_recipes_updated BEFORE UPDATE ON menu_recipes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_menu_recipes_store ON menu_recipes(store_id);

    CREATE TABLE recipe_components (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      menu_item_id INTEGER NOT NULL REFERENCES menu_recipes(menu_item_id) ON DELETE CASCADE,
      item_id      BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      quantity     NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
      uom          VARCHAR(20) NOT NULL DEFAULT 'pcs',
      UNIQUE (menu_item_id, item_id)
    );
    CREATE INDEX idx_recipe_components_menu ON recipe_components(menu_item_id);
    CREATE INDEX idx_recipe_components_item ON recipe_components(item_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS recipe_components;
    DROP TABLE IF EXISTS menu_recipes;
  `);
};
