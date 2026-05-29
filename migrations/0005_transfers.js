'use strict';

// Schema only. Write endpoints for transfers are Phase 2 (deferred).
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE transfers (
      id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      transfer_number    VARCHAR(30) NOT NULL UNIQUE,
      source_store_id    BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      dest_store_id      BIGINT NOT NULL REFERENCES stores(id) ON DELETE RESTRICT,
      source_request_ref BIGINT,
      status             transfer_status NOT NULL DEFAULT 'pending_fnb',
      requested_by       INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      approved_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      approved_at        TIMESTAMPTZ,
      sent_by            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sent_at            TIMESTAMPTZ,
      received_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      received_at        TIMESTAMPTZ,
      rejected_by        INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rejected_at        TIMESTAMPTZ,
      rejection_reason   TEXT,
      notes              TEXT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (source_store_id <> dest_store_id)
    );
    CREATE TRIGGER trg_transfers_updated BEFORE UPDATE ON transfers
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_transfers_status ON transfers(status);
    CREATE INDEX idx_transfers_src    ON transfers(source_store_id);
    CREATE INDEX idx_transfers_dest   ON transfers(dest_store_id);

    CREATE TABLE transfer_lines (
      id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      transfer_id        BIGINT NOT NULL REFERENCES transfers(id) ON DELETE CASCADE,
      line_no            INTEGER NOT NULL,
      item_id            BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      uom                VARCHAR(20) NOT NULL,
      quantity_requested NUMERIC(14,3) NOT NULL CHECK (quantity_requested > 0),
      quantity_approved  NUMERIC(14,3) CHECK (quantity_approved >= 0),
      quantity_sent      NUMERIC(14,3) CHECK (quantity_sent >= 0),
      quantity_received  NUMERIC(14,3) CHECK (quantity_received >= 0),
      UNIQUE (transfer_id, line_no)
    );
    CREATE INDEX idx_transfer_lines_t ON transfer_lines(transfer_id);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS transfer_lines;
    DROP TABLE IF EXISTS transfers;
  `);
};
