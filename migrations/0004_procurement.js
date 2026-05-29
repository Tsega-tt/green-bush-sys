'use strict';

// Schema only. Write endpoints for these tables are Phase 3 (deferred).
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE purchase_requisitions (
      id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pr_number         VARCHAR(30) NOT NULL UNIQUE,
      store_id          BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      status            pr_status NOT NULL DEFAULT 'draft',
      requested_by      INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      notes             TEXT,
      estimated_total   NUMERIC(16,2) NOT NULL DEFAULT 0,
      threshold_band    VARCHAR(20),
      fnb_approved_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      fnb_approved_at   TIMESTAMPTZ,
      owner_approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      owner_approved_at TIMESTAMPTZ,
      rejected_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rejected_at       TIMESTAMPTZ,
      rejection_reason  TEXT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_pr_updated BEFORE UPDATE ON purchase_requisitions
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_pr_status ON purchase_requisitions(status);
    CREATE INDEX idx_pr_store  ON purchase_requisitions(store_id);

    CREATE TABLE pr_lines (
      id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      pr_id              BIGINT NOT NULL REFERENCES purchase_requisitions(id) ON DELETE CASCADE,
      line_no            INTEGER NOT NULL,
      item_id            BIGINT REFERENCES inventory_items(id) ON DELETE RESTRICT,
      description        VARCHAR(200) NOT NULL,
      uom                VARCHAR(20) NOT NULL DEFAULT 'pcs',
      quantity_requested NUMERIC(14,3) NOT NULL CHECK (quantity_requested > 0),
      quantity_approved  NUMERIC(14,3) CHECK (quantity_approved >= 0),
      est_unit_cost      NUMERIC(14,4) NOT NULL DEFAULT 0,
      est_line_cost      NUMERIC(16,2) NOT NULL DEFAULT 0,
      UNIQUE (pr_id, line_no)
    );
    CREATE INDEX idx_pr_lines_pr ON pr_lines(pr_id);

    CREATE TABLE purchase_orders (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      po_number      VARCHAR(30) NOT NULL UNIQUE,
      pr_id          BIGINT REFERENCES purchase_requisitions(id) ON DELETE RESTRICT,
      supplier_id    BIGINT NOT NULL REFERENCES suppliers(id)    ON DELETE RESTRICT,
      status         po_status NOT NULL DEFAULT 'draft',
      purchaser_id   INTEGER NOT NULL REFERENCES users(id)       ON DELETE RESTRICT,
      order_date     DATE,
      expected_date  DATE,
      invoice_number VARCHAR(60),
      receipt_number VARCHAR(60),
      subtotal       NUMERIC(16,2) NOT NULL DEFAULT 0,
      total_amount   NUMERIC(16,2) NOT NULL DEFAULT 0,
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_po_updated BEFORE UPDATE ON purchase_orders
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_po_status   ON purchase_orders(status);
    CREATE INDEX idx_po_supplier ON purchase_orders(supplier_id);

    CREATE TABLE po_lines (
      id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      po_id             BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
      line_no           INTEGER NOT NULL,
      item_id           BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      description       VARCHAR(200) NOT NULL,
      uom               VARCHAR(20) NOT NULL DEFAULT 'pcs',
      quantity_ordered  NUMERIC(14,3) NOT NULL CHECK (quantity_ordered > 0),
      unit_cost         NUMERIC(14,4) NOT NULL DEFAULT 0,
      line_total        NUMERIC(16,2) NOT NULL DEFAULT 0,
      quantity_received NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_received >= 0),
      UNIQUE (po_id, line_no)
    );
    CREATE INDEX idx_po_lines_po ON po_lines(po_id);

    CREATE TABLE goods_receipts (
      id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      gr_number            VARCHAR(30) NOT NULL UNIQUE,
      po_id                BIGINT NOT NULL REFERENCES purchase_orders(id) ON DELETE RESTRICT,
      store_id             BIGINT NOT NULL REFERENCES stores(id)          ON DELETE RESTRICT,
      supplier_id          BIGINT NOT NULL REFERENCES suppliers(id)       ON DELETE RESTRICT,
      status               gr_status NOT NULL DEFAULT 'draft',
      received_by          INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      received_at          TIMESTAMPTZ,
      invoice_number       VARCHAR(60),
      grn_number           VARCHAR(60),
      delivery_note_number VARCHAR(60),
      has_variance         BOOLEAN NOT NULL DEFAULT false,
      posted_at            TIMESTAMPTZ,
      posted_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_gr_updated BEFORE UPDATE ON goods_receipts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_gr_po    ON goods_receipts(po_id);
    CREATE INDEX idx_gr_store ON goods_receipts(store_id);

    CREATE TABLE gr_lines (
      id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      gr_id             BIGINT NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
      po_line_id        BIGINT NOT NULL REFERENCES po_lines(id)       ON DELETE RESTRICT,
      item_id           BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      uom               VARCHAR(20) NOT NULL,
      quantity_received NUMERIC(14,3) NOT NULL CHECK (quantity_received >= 0),
      quantity_rejected NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (quantity_rejected >= 0),
      rejection_reason  TEXT,
      unit_cost         NUMERIC(14,4) NOT NULL DEFAULT 0,
      variance_qty      NUMERIC(14,3) NOT NULL DEFAULT 0,
      batch_number      VARCHAR(60),
      mfg_date          DATE,
      expiry_date       DATE,
      UNIQUE (gr_id, po_line_id)
    );
    CREATE INDEX idx_gr_lines_gr ON gr_lines(gr_id);

    -- wire the deferred inventory_batches.gr_id FK now that goods_receipts exists
    ALTER TABLE inventory_batches
      ADD CONSTRAINT fk_batches_gr FOREIGN KEY (gr_id)
      REFERENCES goods_receipts(id) ON DELETE RESTRICT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE inventory_batches DROP CONSTRAINT IF EXISTS fk_batches_gr;
    DROP TABLE IF EXISTS gr_lines;
    DROP TABLE IF EXISTS goods_receipts;
    DROP TABLE IF EXISTS po_lines;
    DROP TABLE IF EXISTS purchase_orders;
    DROP TABLE IF EXISTS pr_lines;
    DROP TABLE IF EXISTS purchase_requisitions;
  `);
};
