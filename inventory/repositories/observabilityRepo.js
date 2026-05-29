'use strict';

const audit = {
  /** Append an audit row. Pass a tx client to bind it to the surrounding txn. */
  async insert(db, a) {
    const { rows } = await db.query(
      `INSERT INTO audit_logs
         (actor_id, actor_role, action, entity_type, entity_id, store_id,
          old_value, new_value, ip_address, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id`,
      [
        a.actorId || null, a.actorRole || null, a.action, a.entityType,
        a.entityId || null, a.storeId || null,
        a.oldValue ? JSON.stringify(a.oldValue) : null,
        a.newValue ? JSON.stringify(a.newValue) : null,
        a.ipAddress || null, a.note || null,
      ]
    );
    return rows[0].id;
  },
  async list(db, { entityType, entityId, actorId, action, storeId, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM audit_logs
        WHERE ($1::text   IS NULL OR entity_type = $1)
          AND ($2::bigint IS NULL OR entity_id  = $2)
          AND ($3::int    IS NULL OR actor_id   = $3)
          AND ($4::text   IS NULL OR action     = $4)
          AND ($5::bigint IS NULL OR store_id   = $5)
        ORDER BY created_at DESC, id DESC
        LIMIT $6 OFFSET $7`,
      [entityType || null, entityId || null, actorId || null, action || null, storeId || null, limit, offset]
    );
    return rows;
  },
};

const alerts = {
  /**
   * Emit an alert. `dedupKey` keeps only one OPEN alert per condition (enforced
   * by a partial unique index); a duplicate is silently ignored.
   */
  async emit(db, a) {
    const { rows } = await db.query(
      `INSERT INTO alerts
         (alert_type, severity, store_id, item_id, entity_type, entity_id, message, details, dedup_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (dedup_key) WHERE (status = 'open' AND dedup_key IS NOT NULL)
       DO NOTHING
       RETURNING *`,
      [
        a.alertType, a.severity || 'warning', a.storeId || null, a.itemId || null,
        a.entityType || null, a.entityId || null, a.message,
        a.details ? JSON.stringify(a.details) : null, a.dedupKey || null,
      ]
    );
    return rows[0] || null;
  },
  async list(db, { status, storeId, type, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT a.*, s.name AS store_name, i.description AS item_description
         FROM alerts a
         LEFT JOIN stores s ON s.id = a.store_id
         LEFT JOIN inventory_items i ON i.id = a.item_id
        WHERE ($1::alert_status IS NULL OR a.status = $1)
          AND ($2::bigint IS NULL OR a.store_id = $2)
          AND ($3::text   IS NULL OR a.alert_type = $3)
        ORDER BY
          CASE a.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
          a.created_at DESC
        LIMIT $4 OFFSET $5`,
      [status || null, storeId || null, type || null, limit, offset]
    );
    return rows;
  },
  async acknowledge(db, id, userId) {
    const { rows } = await db.query(
      `UPDATE alerts SET status='acknowledged', acknowledged_by=$2, acknowledged_at=now()
        WHERE id=$1 AND status='open' RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  },
  async resolve(db, id, userId) {
    const { rows } = await db.query(
      `UPDATE alerts SET status='resolved', resolved_by=$2, resolved_at=now()
        WHERE id=$1 AND status IN ('open','acknowledged') RETURNING *`,
      [id, userId]
    );
    return rows[0] || null;
  },
};

const snapshots = {
  /**
   * Materialize one immutable row per (store,item) for the given local date.
   * Idempotent for the day via the UNIQUE(snapshot_date,store_id,item_id) index.
   * Returns number of rows written.
   */
  async run(client, snapshotDate) {
    const { rowCount } = await client.query(
      `INSERT INTO inventory_snapshots
         (snapshot_date, store_id, item_id, quantity, weighted_avg_cost, inventory_value)
       SELECT $1::date, b.store_id, b.item_id, b.quantity, b.weighted_avg_cost,
              (b.quantity * b.weighted_avg_cost)::numeric(16,2)
         FROM store_item_balances b
       ON CONFLICT (snapshot_date, store_id, item_id) DO NOTHING`,
      [snapshotDate]
    );
    return rowCount;
  },
  async list(db, { storeId, date, limit = 1000 } = {}) {
    const { rows } = await db.query(
      `SELECT sn.*, i.description, s.name AS store_name
         FROM inventory_snapshots sn
         JOIN inventory_items i ON i.id = sn.item_id
         JOIN stores s ON s.id = sn.store_id
        WHERE ($1::bigint IS NULL OR sn.store_id = $1)
          AND ($2::date   IS NULL OR sn.snapshot_date = $2)
        ORDER BY sn.snapshot_date DESC, s.name, i.description
        LIMIT $3`,
      [storeId || null, date || null, limit]
    );
    return rows;
  },
};

module.exports = { audit, alerts, snapshots };
