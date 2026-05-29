'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE SEQUENCE seq_waste;
    CREATE SEQUENCE seq_count;
    CREATE SEQUENCE seq_keg;

    -- transfers: persist the source WAC captured at dispatch so the destination
    -- receipt can value transfer_in at the cost that travelled with the goods.
    ALTER TABLE transfer_lines ADD COLUMN IF NOT EXISTS sent_unit_cost NUMERIC(14,4);

    -- ---------------- waste ----------------
    CREATE TABLE waste (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      waste_number  VARCHAR(30) NOT NULL UNIQUE,
      store_id      BIGINT NOT NULL REFERENCES stores(id)          ON DELETE RESTRICT,
      item_id       BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      quantity      NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
      uom           VARCHAR(20) NOT NULL,
      reason        TEXT NOT NULL,
      status        VARCHAR(20) NOT NULL DEFAULT 'recorded'
                      CHECK (status IN ('recorded','approved','rejected')),
      value         NUMERIC(16,2) NOT NULL DEFAULT 0,
      txn_id        BIGINT REFERENCES inventory_transactions(id) ON DELETE RESTRICT,
      recorded_by   INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at   TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_waste_updated BEFORE UPDATE ON waste
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_waste_store ON waste(store_id);
    CREATE INDEX idx_waste_time  ON waste(created_at DESC);

    -- ---------------- stock counts ----------------
    CREATE TABLE stock_counts (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      count_number  VARCHAR(30) NOT NULL UNIQUE,
      store_id      BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      status        VARCHAR(20) NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','finalized','cancelled')),
      is_blind      BOOLEAN NOT NULL DEFAULT false,
      note          TEXT,
      counted_by    INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      finalized_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
      finalized_at  TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_counts_updated BEFORE UPDATE ON stock_counts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_counts_store ON stock_counts(store_id, status);

    CREATE TABLE stock_count_lines (
      id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      count_id     BIGINT NOT NULL REFERENCES stock_counts(id) ON DELETE CASCADE,
      item_id      BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      system_qty   NUMERIC(14,3) NOT NULL DEFAULT 0,
      physical_qty NUMERIC(14,3),
      variance     NUMERIC(14,3) NOT NULL DEFAULT 0,
      adjusted     BOOLEAN NOT NULL DEFAULT false,
      UNIQUE (count_id, item_id)
    );
    CREATE INDEX idx_count_lines_count ON stock_count_lines(count_id);

    -- ---------------- daily closing ----------------
    CREATE TABLE daily_closings (
      id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      store_id            BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      business_date       DATE NOT NULL,
      status              VARCHAR(20) NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open','confirmed')),
      opening_value       NUMERIC(16,2) NOT NULL DEFAULT 0,
      purchases_value     NUMERIC(16,2) NOT NULL DEFAULT 0,
      transfers_in_value  NUMERIC(16,2) NOT NULL DEFAULT 0,
      transfers_out_value NUMERIC(16,2) NOT NULL DEFAULT 0,
      consumption_value   NUMERIC(16,2) NOT NULL DEFAULT 0,
      sales_value         NUMERIC(16,2) NOT NULL DEFAULT 0,
      waste_value         NUMERIC(16,2) NOT NULL DEFAULT 0,
      adjustment_value    NUMERIC(16,2) NOT NULL DEFAULT 0,
      expected_value      NUMERIC(16,2) NOT NULL DEFAULT 0,
      physical_value      NUMERIC(16,2),
      variance_value      NUMERIC(16,2) NOT NULL DEFAULT 0,
      details             JSONB,
      confirmed_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      confirmed_at        TIMESTAMPTZ,
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (store_id, business_date)
    );
    CREATE TRIGGER trg_closing_updated BEFORE UPDATE ON daily_closings
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    -- ---------------- kegs ----------------
    CREATE TABLE kegs (
      id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      keg_code        VARCHAR(40) NOT NULL UNIQUE,
      store_id        BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      item_id         BIGINT REFERENCES inventory_items(id) ON DELETE SET NULL,
      supplier_id     BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
      size_liters     NUMERIC(14,3) NOT NULL CHECK (size_liters > 0),
      liters_received NUMERIC(14,3) NOT NULL DEFAULT 0,
      liters_sold     NUMERIC(14,3) NOT NULL DEFAULT 0,
      liters_waste    NUMERIC(14,3) NOT NULL DEFAULT 0,
      liters_remaining NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (liters_remaining >= 0),
      status          VARCHAR(20) NOT NULL DEFAULT 'received'
                        CHECK (status IN ('received','tapped','empty','returned')),
      received_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      tapped_at       TIMESTAMPTZ,
      emptied_at      TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_kegs_updated BEFORE UPDATE ON kegs
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_kegs_store ON kegs(store_id, status);

    CREATE TABLE keg_events (
      id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      keg_id                 BIGINT NOT NULL REFERENCES kegs(id) ON DELETE CASCADE,
      event_type             VARCHAR(20) NOT NULL
                               CHECK (event_type IN ('received','tapped','sale','waste','adjustment','empty','return')),
      liters                 NUMERIC(14,3) NOT NULL DEFAULT 0,
      liters_remaining_after NUMERIC(14,3) NOT NULL DEFAULT 0,
      note                   TEXT,
      created_by             INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_keg_events_keg ON keg_events(keg_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS keg_events;
    DROP TABLE IF EXISTS kegs;
    DROP TABLE IF EXISTS daily_closings;
    DROP TABLE IF EXISTS stock_count_lines;
    DROP TABLE IF EXISTS stock_counts;
    DROP TABLE IF EXISTS waste;
    ALTER TABLE transfer_lines DROP COLUMN IF EXISTS sent_unit_cost;
    DROP SEQUENCE IF EXISTS seq_keg, seq_count, seq_waste;
  `);
};
