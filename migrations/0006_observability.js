'use strict';

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    -- ---------------------------------------------------------------
    -- alerts (centralized)
    -- ---------------------------------------------------------------
    CREATE TABLE alerts (
      id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      alert_type      VARCHAR(60) NOT NULL,
      severity        alert_severity NOT NULL DEFAULT 'warning',
      status          alert_status   NOT NULL DEFAULT 'open',
      store_id        BIGINT REFERENCES stores(id)          ON DELETE CASCADE,
      item_id         BIGINT REFERENCES inventory_items(id) ON DELETE CASCADE,
      entity_type     VARCHAR(40),
      entity_id       BIGINT,
      message         TEXT NOT NULL,
      details         JSONB,
      dedup_key       VARCHAR(120),
      acknowledged_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      acknowledged_at TIMESTAMPTZ,
      resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at     TIMESTAMPTZ,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_alerts_updated BEFORE UPDATE ON alerts
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE INDEX idx_alerts_open  ON alerts(status, severity) WHERE status = 'open';
    CREATE INDEX idx_alerts_store ON alerts(store_id);
    CREATE INDEX idx_alerts_type  ON alerts(alert_type);
    CREATE UNIQUE INDEX idx_alerts_dedup ON alerts(dedup_key)
      WHERE status = 'open' AND dedup_key IS NOT NULL;

    -- ---------------------------------------------------------------
    -- audit_logs (immutable)
    -- ---------------------------------------------------------------
    CREATE TABLE audit_logs (
      id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role  VARCHAR(30),
      action      VARCHAR(60) NOT NULL,
      entity_type VARCHAR(60) NOT NULL,
      entity_id   BIGINT,
      store_id    BIGINT REFERENCES stores(id) ON DELETE SET NULL,
      old_value   JSONB,
      new_value   JSONB,
      ip_address  INET,
      note        TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit_logs
      FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
    CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX idx_audit_actor  ON audit_logs(actor_id);
    CREATE INDEX idx_audit_time   ON audit_logs(created_at DESC);
    CREATE INDEX idx_audit_action ON audit_logs(action);

    -- ---------------------------------------------------------------
    -- inventory_snapshots (immutable, daily)
    -- ---------------------------------------------------------------
    CREATE TABLE inventory_snapshots (
      id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      snapshot_date     DATE   NOT NULL,
      store_id          BIGINT NOT NULL REFERENCES stores(id)          ON DELETE RESTRICT,
      item_id           BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      quantity          NUMERIC(14,3) NOT NULL,
      weighted_avg_cost NUMERIC(14,4) NOT NULL,
      inventory_value   NUMERIC(16,2) NOT NULL,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (snapshot_date, store_id, item_id)
    );
    CREATE TRIGGER trg_snap_immutable BEFORE UPDATE OR DELETE ON inventory_snapshots
      FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
    CREATE INDEX idx_snap_date  ON inventory_snapshots(snapshot_date);
    CREATE INDEX idx_snap_store ON inventory_snapshots(store_id, item_id);

    -- ---------------------------------------------------------------
    -- item_price_history
    -- ---------------------------------------------------------------
    CREATE TABLE item_price_history (
      id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      item_id        BIGINT NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
      supplier_id    BIGINT REFERENCES suppliers(id) ON DELETE SET NULL,
      store_id       BIGINT REFERENCES stores(id)    ON DELETE SET NULL,
      unit_cost      NUMERIC(14,4) NOT NULL CHECK (unit_cost >= 0),
      source_type    VARCHAR(30) NOT NULL DEFAULT 'goods_receipt',
      source_id      BIGINT,
      effective_date DATE NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_price_item     ON item_price_history(item_id, effective_date DESC);
    CREATE INDEX idx_price_supplier ON item_price_history(supplier_id);

    -- ---------------------------------------------------------------
    -- attachments (permanent, versioned, soft-delete only)
    -- ---------------------------------------------------------------
    CREATE TABLE attachments (
      id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      entity_type     attachment_entity NOT NULL,
      entity_id       BIGINT NOT NULL,
      doc_label       VARCHAR(60),
      file_name       VARCHAR(255) NOT NULL,
      original_name   VARCHAR(255) NOT NULL,
      mime_type       VARCHAR(100) NOT NULL,
      file_size       BIGINT NOT NULL CHECK (file_size >= 0),
      storage_path    TEXT NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      version         INTEGER NOT NULL DEFAULT 1,
      supersedes_id   BIGINT REFERENCES attachments(id) ON DELETE SET NULL,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      uploaded_by     INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX idx_attach_entity ON attachments(entity_type, entity_id);
    CREATE INDEX idx_attach_active ON attachments(entity_type, entity_id) WHERE is_active;

    -- ---------------------------------------------------------------
    -- approval_thresholds (configurable)
    -- ---------------------------------------------------------------
    CREATE TABLE approval_thresholds (
      id                          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      band_name                   VARCHAR(40) NOT NULL,
      min_amount                  NUMERIC(16,2) NOT NULL CHECK (min_amount >= 0),
      max_amount                  NUMERIC(16,2),
      requires_fnb                BOOLEAN NOT NULL DEFAULT true,
      requires_owner_notification BOOLEAN NOT NULL DEFAULT false,
      requires_owner_approval     BOOLEAN NOT NULL DEFAULT false,
      is_active                   BOOLEAN NOT NULL DEFAULT true,
      created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK (max_amount IS NULL OR max_amount > min_amount)
    );
    CREATE TRIGGER trg_thresholds_updated BEFORE UPDATE ON approval_thresholds
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();

    INSERT INTO approval_thresholds
      (band_name,min_amount,max_amount,requires_fnb,requires_owner_notification,requires_owner_approval)
    VALUES
      ('standard',     0,      10000, true, false, false),
      ('elevated', 10000,      50000, true, true,  false),
      ('high',     50000,       NULL, true, true,  true);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS approval_thresholds;
    DROP TABLE IF EXISTS attachments;
    DROP TABLE IF EXISTS item_price_history;
    DROP TABLE IF EXISTS inventory_snapshots;
    DROP TABLE IF EXISTS audit_logs;
    DROP TABLE IF EXISTS alerts;
  `);
};
