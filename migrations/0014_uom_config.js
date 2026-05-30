'use strict';

/**
 * Data-driven Units of Measure.
 *
 *  - uom_definitions : the list of UOMs (drives the dropdown).
 *  - uom_attributes  : per-UOM extra fields (the schema) — label, input type,
 *                      unit, required flag, tooltip, select options, order.
 *  - inventory_items.uom_attributes : the VALUES a user entered for an item.
 *
 * Adding a new UOM or a new UOM-specific field is pure DATA (insert rows) —
 * the UI renders whatever the schema says, so no code change is needed.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE uom_definitions (
      id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code       VARCHAR(40) NOT NULL UNIQUE,
      name       VARCHAR(80) NOT NULL,
      is_base    BOOLEAN NOT NULL DEFAULT false,
      is_active  BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_uom_def_updated BEFORE UPDATE ON uom_definitions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE uom_attributes (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      uom_code    VARCHAR(40) NOT NULL REFERENCES uom_definitions(code) ON DELETE CASCADE,
      attr_key    VARCHAR(60)  NOT NULL,
      label       VARCHAR(120) NOT NULL,
      input_type  VARCHAR(20)  NOT NULL DEFAULT 'number',   -- number | text | select
      unit        VARCHAR(30),                              -- e.g. kg, ml, cm
      is_required BOOLEAN NOT NULL DEFAULT false,
      help_text   TEXT,                                     -- tooltip
      options     JSONB,                                    -- for input_type='select'
      sort_order  INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (uom_code, attr_key)
    );
    CREATE TRIGGER trg_uom_attr_updated BEFORE UPDATE ON uom_attributes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_uom_attr_code ON uom_attributes (uom_code, sort_order);

    -- Per-item entered values for its UOM's attributes.
    ALTER TABLE inventory_items
      ADD COLUMN IF NOT EXISTS uom_attributes JSONB NOT NULL DEFAULT '{}'::jsonb;

    -- ---- Seed the UOM list (base units + packaging units) ----
    INSERT INTO uom_definitions (code, name, is_base) VALUES
      ('pcs','Pieces',true), ('kg','Kilogram',true), ('g','Gram',true),
      ('l','Litre',true), ('ml','Millilitre',true),
      ('box','Box',false), ('carton','Carton',false), ('pack','Pack',false),
      ('bottle','Bottle',false), ('can','Can',false), ('bag','Bag',false),
      ('roll','Roll',false), ('sheet','Sheet',false), ('dozen','Dozen',false),
      ('crate','Crate',false), ('sack','Sack',false)
    ON CONFLICT (code) DO NOTHING;

    -- ---- Seed per-UOM attribute schemas ----
    INSERT INTO uom_attributes (uom_code, attr_key, label, input_type, unit, is_required, help_text, options, sort_order) VALUES
      -- Box
      ('box','units_per_box','Units per box','number',NULL,true,'How many individual units are inside one box',NULL,1),
      ('box','base_uom','Unit inside box','select',NULL,true,'The base unit each box contains',$$["pcs","kg","g","l","ml","bottle","can","pack"]$$,2),
      ('box','gross_weight','Gross weight','number','kg',false,'Total weight of a full box',NULL,3),
      ('box','length','Length','number','cm',false,'Box length',NULL,4),
      ('box','width','Width','number','cm',false,'Box width',NULL,5),
      ('box','height','Height','number','cm',false,'Box height',NULL,6),
      -- Carton
      ('carton','units_per_carton','Units per carton','number',NULL,true,'How many units are inside one carton',NULL,1),
      ('carton','base_uom','Unit inside carton','select',NULL,true,'The base unit each carton contains',$$["pcs","bottle","can","pack","box"]$$,2),
      ('carton','gross_weight','Gross weight','number','kg',false,'Total weight of a full carton',NULL,3),
      -- Pack
      ('pack','units_per_pack','Units per pack','number',NULL,true,'How many units are inside one pack',NULL,1),
      ('pack','base_uom','Unit inside pack','select',NULL,true,'The base unit each pack contains',$$["pcs","g","ml","sheet"]$$,2),
      -- Bottle
      ('bottle','volume','Volume per bottle','number','ml',true,'Liquid volume contained in one bottle',NULL,1),
      ('bottle','bottles_per_case','Bottles per case','number',NULL,false,'How many bottles ship in a case',NULL,2),
      ('bottle','returnable','Returnable','select',NULL,false,'Is the bottle returnable/deposit?',$$["yes","no"]$$,3),
      -- Can
      ('can','volume','Volume per can','number','ml',true,'Liquid volume contained in one can',NULL,1),
      ('can','cans_per_pack','Cans per pack','number',NULL,false,'How many cans per pack',NULL,2),
      -- Bag
      ('bag','net_weight','Net weight per bag','number','kg',true,'Weight of contents in one bag',NULL,1),
      ('bag','base_uom','Content unit','select',NULL,false,'What the bag contains',$$["kg","g","pcs"]$$,2),
      -- Sack
      ('sack','net_weight','Net weight per sack','number','kg',true,'Weight of contents in one sack',NULL,1),
      -- Roll
      ('roll','length','Length per roll','number','m',true,'Length of material on one roll',NULL,1),
      ('roll','width','Width','number','cm',false,'Roll width',NULL,2),
      -- Sheet
      ('sheet','width','Width','number','cm',true,'Sheet width',NULL,1),
      ('sheet','height','Height','number','cm',true,'Sheet height',NULL,2),
      -- Dozen
      ('dozen','units_per_dozen','Units per dozen','number',NULL,true,'Usually 12',NULL,1),
      -- Crate
      ('crate','units_per_crate','Units per crate','number',NULL,true,'How many units/bottles per crate',NULL,1),
      ('crate','base_uom','Unit inside crate','select',NULL,true,'The base unit each crate contains',$$["bottle","can","pcs"]$$,2),
      -- Base liquid/weight units: optional density for conversions
      ('l','density','Density','number','kg/l',false,'Optional — weight per litre, for weight conversions',NULL,1),
      ('kg','pieces_per_kg','Pieces per kg','number',NULL,false,'Optional — approximate count per kilogram',NULL,1)
    ON CONFLICT (uom_code, attr_key) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE inventory_items DROP COLUMN IF EXISTS uom_attributes;
    DROP TABLE IF EXISTS uom_attributes;
    DROP TABLE IF EXISTS uom_definitions;
  `);
};
