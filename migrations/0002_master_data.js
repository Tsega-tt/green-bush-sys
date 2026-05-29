'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- ---------------------------------------------------------------
    -- users: created idempotently. The inventory domain needs users in
    -- PG for store-manager assignment, role scoping and created_by FKs.
    -- Legacy auth continues to read data/users.json until a later phase
    -- unifies it; the JSON->PG sync keeps ids aligned.
    -- ---------------------------------------------------------------
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL PRIMARY KEY,
      username      VARCHAR(50) UNIQUE NOT NULL,
      email         VARCHAR(100) UNIQUE,
      password_hash VARCHAR(255),
      pin_hash      VARCHAR(255),
      role          VARCHAR(30) NOT NULL DEFAULT 'cashier',
      first_name    VARCHAR(50),
      last_name     VARCHAR(50),
      phone         VARCHAR(20),
      is_active     BOOLEAN NOT NULL DEFAULT true,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Widen role domain (drop any legacy CHECK, add the ERP role set).
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN (
      'admin','owner','fnb_manager','store_manager','store_admin','purchaser',
      'cashier','kitchen_staff','cafe_waiter','waiter','bakery_employee','hr_admin','item_request'
    ));

    -- ---------------------------------------------------------------
    -- stores
    -- ---------------------------------------------------------------
    CREATE TABLE stores (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      code        VARCHAR(40)  NOT NULL UNIQUE,
      name        VARCHAR(120) NOT NULL,
      description TEXT,
      icon        VARCHAR(16),
      manager_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      is_active   BOOLEAN NOT NULL DEFAULT true,
      deleted_at  TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON stores
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_stores_active ON stores(is_active) WHERE deleted_at IS NULL;

    -- Now the circular users.store_id FK can be added.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS store_id BIGINT REFERENCES stores(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS idx_users_store ON users(store_id);
    CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

    -- ---------------------------------------------------------------
    -- store_capabilities  (data-driven; new stores/caps need no code)
    -- ---------------------------------------------------------------
    CREATE TABLE store_capabilities (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      store_id       BIGINT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
      capability_key VARCHAR(60) NOT NULL,
      enabled        BOOLEAN NOT NULL DEFAULT true,
      config         JSONB,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (store_id, capability_key)
    );
    CREATE TRIGGER trg_store_caps_updated BEFORE UPDATE ON store_capabilities
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_store_caps_store ON store_capabilities(store_id);

    -- ---------------------------------------------------------------
    -- suppliers
    -- ---------------------------------------------------------------
    CREATE TABLE suppliers (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name           VARCHAR(160) NOT NULL UNIQUE,
      contact_person VARCHAR(120),
      phone          VARCHAR(40),
      email          VARCHAR(120),
      address        TEXT,
      tax_number     VARCHAR(60),
      notes          TEXT,
      is_active      BOOLEAN NOT NULL DEFAULT true,
      deleted_at     TIMESTAMPTZ,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_suppliers_updated BEFORE UPDATE ON suppliers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE UNIQUE INDEX idx_suppliers_tax ON suppliers(tax_number) WHERE tax_number IS NOT NULL;

    -- ---------------------------------------------------------------
    -- inventory_items  (global product master — not per store)
    -- ---------------------------------------------------------------
    CREATE TABLE inventory_items (
      id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_code       VARCHAR(40)  NOT NULL UNIQUE,
      description     VARCHAR(200) NOT NULL,
      category        VARCHAR(60),
      uom             VARCHAR(20)  NOT NULL DEFAULT 'pcs',
      is_perishable   BOOLEAN NOT NULL DEFAULT false,
      track_batches   BOOLEAN NOT NULL DEFAULT false,
      default_min_qty NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (default_min_qty >= 0),
      default_reorder NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (default_reorder  >= 0),
      is_active       BOOLEAN NOT NULL DEFAULT true,
      deleted_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_items_updated BEFORE UPDATE ON inventory_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_items_active   ON inventory_items(is_active) WHERE deleted_at IS NULL;
    CREATE INDEX idx_items_category ON inventory_items(category);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS inventory_items;
    DROP TABLE IF EXISTS suppliers;
    DROP TABLE IF EXISTS store_capabilities;
    ALTER TABLE users DROP COLUMN IF EXISTS store_id;
    DROP TABLE IF EXISTS stores;
    -- users table is intentionally NOT dropped (shared with legacy domain).
  `);
};
