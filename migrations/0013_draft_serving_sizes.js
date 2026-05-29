'use strict';

/**
 * Configurable draft serving sizes. Liter amounts live in DATA, never in code —
 * admins create/edit/activate sizes and change liter values without a deploy.
 * Menu recipes reference a serving size; keg sales read the liter quantity from
 * here at sale time. Seeds Large/Medium/Small as DEFAULTS only.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE draft_serving_sizes (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name           VARCHAR(60)  NOT NULL,
      code           VARCHAR(40)  NOT NULL UNIQUE,
      liter_quantity NUMERIC(10,3) NOT NULL CHECK (liter_quantity > 0),
      is_active      BOOLEAN NOT NULL DEFAULT true,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_serving_sizes_updated BEFORE UPDATE ON draft_serving_sizes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    INSERT INTO draft_serving_sizes (name, code, liter_quantity) VALUES
      ('Large',  'large',  0.500),
      ('Medium', 'medium', 0.400),
      ('Small',  'small',  0.250)
    ON CONFLICT (code) DO NOTHING;

    -- Recipes reference a serving size instead of a hardcoded liter amount.
    ALTER TABLE menu_recipes
      ADD COLUMN IF NOT EXISTS serving_size_id BIGINT REFERENCES draft_serving_sizes(id) ON DELETE SET NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE menu_recipes DROP COLUMN IF EXISTS serving_size_id;
    DROP TABLE IF EXISTS draft_serving_sizes;
  `);
};
