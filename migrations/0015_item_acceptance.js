'use strict';

/**
 * Per-ITEM purchase → receiving → F&B review → store acceptance workflow.
 *
 * A purchaser submits an acceptance batch (with supplier + documents). Each
 * purchased item is tracked INDIVIDUALLY through its own status lifecycle:
 *   awaiting_fnb → fnb_approved → sent_to_store → awaiting_store
 *               → store_accepted → added_to_inventory
 * with fnb_rejected / store_rejected branches that route the item back.
 *
 * Inventory only moves when a Store Admin ACCEPTS an item (ledger receipt).
 * Documents (receipt/invoice/GRN) reuse the generic `attachments` table with
 * entity_type='acceptance_batch'.
 */
exports.shorthands = undefined;

const STATUSES = [
  'purchase_requested', 'purchased', 'documents_uploaded', 'awaiting_fnb',
  'fnb_approved', 'fnb_rejected', 'sent_to_store', 'awaiting_store',
  'store_accepted', 'store_rejected', 'added_to_inventory',
];

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE acceptance_batches (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      batch_number   VARCHAR(40) NOT NULL UNIQUE,
      pr_id          BIGINT REFERENCES purchase_requisitions(id) ON DELETE SET NULL,
      purchaser_id   BIGINT NOT NULL,
      purchaser_name VARCHAR(120),
      supplier_id    BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
      supplier_name  VARCHAR(160),
      supplier_info  TEXT,
      invoice_number VARCHAR(80),
      grn_number     VARCHAR(80),
      notes          TEXT,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_acc_batch_updated BEFORE UPDATE ON acceptance_batches
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    CREATE TABLE acceptance_items (
      id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      batch_id            BIGINT NOT NULL REFERENCES acceptance_batches(id) ON DELETE CASCADE,
      item_id             BIGINT REFERENCES inventory_items(id) ON DELETE SET NULL,
      is_new_item         BOOLEAN NOT NULL DEFAULT false,
      -- snapshot of item details (so the row is self-describing for reviewers)
      description         VARCHAR(200) NOT NULL,
      category            VARCHAR(80),
      sub_category        VARCHAR(80),
      item_type           VARCHAR(80),
      uom                 VARCHAR(40) NOT NULL DEFAULT 'pcs',
      uom_attributes      JSONB NOT NULL DEFAULT '{}'::jsonb,
      specifications      TEXT,
      storage_requirements TEXT,
      -- quantity + costing
      quantity            NUMERIC(16,3) NOT NULL CHECK (quantity > 0),
      unit_cost           NUMERIC(16,4) NOT NULL DEFAULT 0,
      total_cost          NUMERIC(18,4) GENERATED ALWAYS AS (quantity * unit_cost) STORED,
      -- routing
      destination_store_id BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      -- lifecycle
      status              VARCHAR(30) NOT NULL DEFAULT 'awaiting_fnb'
                            CHECK (status IN (${STATUSES.map((s) => `'${s}'`).join(',')})),
      fnb_by              BIGINT,
      fnb_at              TIMESTAMPTZ,
      fnb_reason          TEXT,
      store_by            BIGINT,
      store_at            TIMESTAMPTZ,
      store_reason        TEXT,
      inventory_txn_id    BIGINT,        -- ledger txn created on store-accept
      created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_acc_item_updated BEFORE UPDATE ON acceptance_items
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_acc_item_status ON acceptance_items (status);
    CREATE INDEX idx_acc_item_store  ON acceptance_items (destination_store_id, status);
    CREATE INDEX idx_acc_item_batch  ON acceptance_items (batch_id);

    -- Append-only history of every status transition (per item).
    CREATE TABLE acceptance_events (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_id     BIGINT NOT NULL REFERENCES acceptance_items(id) ON DELETE CASCADE,
      from_status VARCHAR(30),
      to_status   VARCHAR(30) NOT NULL,
      actor_id    BIGINT,
      actor_role  VARCHAR(40),
      reason      TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_acc_event_item ON acceptance_events (item_id, created_at);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS acceptance_events;
    DROP TABLE IF EXISTS acceptance_items;
    DROP TABLE IF EXISTS acceptance_batches;
  `);
};
