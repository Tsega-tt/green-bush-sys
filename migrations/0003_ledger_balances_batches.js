'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- ---------------------------------------------------------------
    -- store_item_balances: the fast, lockable, non-negative truth.
    -- ---------------------------------------------------------------
    CREATE TABLE store_item_balances (
      id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      store_id          BIGINT NOT NULL REFERENCES stores(id)          ON DELETE RESTRICT,
      item_id           BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      quantity          NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
      weighted_avg_cost NUMERIC(14,4) NOT NULL DEFAULT 0 CHECK (weighted_avg_cost >= 0),
      min_quantity      NUMERIC(14,3) NOT NULL DEFAULT 0,
      reorder_point     NUMERIC(14,3) NOT NULL DEFAULT 0,
      last_movement_at  TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (store_id, item_id)
    );
    CREATE TRIGGER trg_balances_updated BEFORE UPDATE ON store_item_balances
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_balances_store ON store_item_balances(store_id);
    CREATE INDEX idx_balances_low   ON store_item_balances(store_id) WHERE quantity <= min_quantity;

    -- ---------------------------------------------------------------
    -- inventory_batches: batch/expiry tracking, FEFO. gr_id FK is wired
    -- later (0004) once goods_receipts exists.
    -- ---------------------------------------------------------------
    CREATE TABLE inventory_batches (
      id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      store_id      BIGINT NOT NULL REFERENCES stores(id)          ON DELETE RESTRICT,
      item_id       BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      supplier_id   BIGINT REFERENCES suppliers(id)                ON DELETE SET NULL,
      gr_id         BIGINT,
      batch_number  VARCHAR(60),
      mfg_date      DATE,
      expiry_date   DATE,
      qty_received  NUMERIC(14,3) NOT NULL CHECK (qty_received > 0),
      qty_remaining NUMERIC(14,3) NOT NULL CHECK (qty_remaining >= 0),
      unit_cost     NUMERIC(14,4) NOT NULL DEFAULT 0,
      received_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (qty_remaining <= qty_received),
      UNIQUE (store_id, item_id, batch_number)
    );
    CREATE TRIGGER trg_batches_updated BEFORE UPDATE ON inventory_batches
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_batches_fefo   ON inventory_batches(store_id, item_id, expiry_date)
      WHERE qty_remaining > 0;
    CREATE INDEX idx_batches_expiry ON inventory_batches(expiry_date) WHERE qty_remaining > 0;

    -- ---------------------------------------------------------------
    -- inventory_transactions: the immutable append-only ledger (spine).
    -- ---------------------------------------------------------------
    CREATE TABLE inventory_transactions (
      id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      txn_number            VARCHAR(30) NOT NULL UNIQUE,
      txn_type              transaction_type NOT NULL,
      store_id              BIGINT NOT NULL REFERENCES stores(id)          ON DELETE RESTRICT,
      item_id               BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      batch_id              BIGINT REFERENCES inventory_batches(id)        ON DELETE RESTRICT,
      quantity              NUMERIC(14,3) NOT NULL CHECK (quantity <> 0),
      uom                   VARCHAR(20) NOT NULL,
      unit_cost             NUMERIC(14,4) NOT NULL DEFAULT 0,
      total_cost            NUMERIC(16,4) NOT NULL DEFAULT 0,
      balance_after         NUMERIC(14,3) NOT NULL CHECK (balance_after >= 0),
      wac_after             NUMERIC(14,4) NOT NULL DEFAULT 0,
      reference_type        VARCHAR(40),
      reference_id          BIGINT,
      counterparty_store_id BIGINT REFERENCES stores(id) ON DELETE RESTRICT,
      idempotency_key       VARCHAR(80) UNIQUE,
      note                  TEXT,
      created_by            INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      created_by_role       VARCHAR(30),
      created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_txn_immutable BEFORE UPDATE OR DELETE ON inventory_transactions
      FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
    CREATE INDEX idx_txn_store_item_time ON inventory_transactions(store_id, item_id, created_at DESC);
    CREATE INDEX idx_txn_type            ON inventory_transactions(txn_type);
    CREATE INDEX idx_txn_reference       ON inventory_transactions(reference_type, reference_id);
    CREATE INDEX idx_txn_batch           ON inventory_transactions(batch_id);
    CREATE INDEX idx_txn_time            ON inventory_transactions(created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS inventory_transactions;
    DROP TABLE IF EXISTS inventory_batches;
    DROP TABLE IF EXISTS store_item_balances;
  `);
};
