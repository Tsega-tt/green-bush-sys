'use strict';

const stores = {
  async list(db, { activeOnly = true } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM stores
        WHERE deleted_at IS NULL AND ($1::boolean = false OR is_active = true)
        ORDER BY name`,
      [activeOnly]
    );
    return rows;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM stores WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return rows[0] || null;
  },
  async getByCode(db, code) {
    const { rows } = await db.query(`SELECT * FROM stores WHERE code = $1 AND deleted_at IS NULL`, [code]);
    return rows[0] || null;
  },
  async insert(db, s) {
    const { rows } = await db.query(
      `INSERT INTO stores (code, name, description, icon, manager_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [s.code, s.name, s.description || null, s.icon || null, s.managerId || null]
    );
    return rows[0];
  },
  async update(db, id, patch) {
    const { rows } = await db.query(
      `UPDATE stores SET
         name        = COALESCE($2, name),
         description = COALESCE($3, description),
         icon        = COALESCE($4, icon),
         manager_id  = COALESCE($5, manager_id),
         is_active   = COALESCE($6, is_active)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, patch.name, patch.description, patch.icon, patch.managerId, patch.isActive]
    );
    return rows[0] || null;
  },
};

const capabilities = {
  async listByStore(db, storeId) {
    const { rows } = await db.query(
      `SELECT * FROM store_capabilities WHERE store_id = $1 ORDER BY capability_key`,
      [storeId]
    );
    return rows;
  },
  async allEnabled(db) {
    const { rows } = await db.query(
      `SELECT store_id, capability_key FROM store_capabilities WHERE enabled = true`
    );
    return rows;
  },
  async upsert(db, storeId, key, enabled, config = null) {
    const { rows } = await db.query(
      `INSERT INTO store_capabilities (store_id, capability_key, enabled, config)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (store_id, capability_key)
       DO UPDATE SET enabled = EXCLUDED.enabled, config = EXCLUDED.config
       RETURNING *`,
      [storeId, key, enabled, config]
    );
    return rows[0];
  },
};

const items = {
  async list(db, { q = null, category = null, activeOnly = true, limit = 200, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM inventory_items
        WHERE ($1::text IS NULL OR description ILIKE '%'||$1||'%' OR item_code ILIKE '%'||$1||'%')
          AND ($2::text IS NULL OR category = $2)
          AND ($3::boolean = false OR (is_active = true AND deleted_at IS NULL))
        ORDER BY description
        LIMIT $4 OFFSET $5`,
      [q, category, activeOnly, limit, offset]
    );
    return rows;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM inventory_items WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async getByCode(db, code) {
    const { rows } = await db.query(`SELECT * FROM inventory_items WHERE item_code = $1`, [code]);
    return rows[0] || null;
  },
  async insert(db, it) {
    const { rows } = await db.query(
      `INSERT INTO inventory_items
         (item_code, description, category, uom, is_perishable, track_batches,
          default_min_qty, default_reorder)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [it.itemCode, it.description, it.category || null, it.uom || 'pcs',
       !!it.isPerishable, !!it.trackBatches, it.defaultMinQty || 0, it.defaultReorder || 0]
    );
    return rows[0];
  },
  async update(db, id, patch) {
    const { rows } = await db.query(
      `UPDATE inventory_items SET
         description     = COALESCE($2, description),
         category        = COALESCE($3, category),
         uom             = COALESCE($4, uom),
         is_perishable   = COALESCE($5, is_perishable),
         track_batches   = COALESCE($6, track_batches),
         default_min_qty = COALESCE($7, default_min_qty),
         default_reorder = COALESCE($8, default_reorder),
         is_active       = COALESCE($9, is_active)
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id, patch.description, patch.category, patch.uom, patch.isPerishable,
       patch.trackBatches, patch.defaultMinQty, patch.defaultReorder, patch.isActive]
    );
    return rows[0] || null;
  },
  async softDelete(db, id) {
    const { rows } = await db.query(
      `UPDATE inventory_items SET deleted_at = now(), is_active = false
        WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return rows[0] || null;
  },
  /** total on-hand across all stores (used to block deletion of stocked items) */
  async totalOnHand(db, id) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(quantity),0)::numeric(14,3) AS qty
         FROM store_item_balances WHERE item_id = $1`,
      [id]
    );
    return rows[0].qty;
  },
};

const suppliers = {
  async list(db, { q = null, activeOnly = true } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM suppliers
        WHERE deleted_at IS NULL
          AND ($1::text IS NULL OR name ILIKE '%'||$1||'%')
          AND ($2::boolean = false OR is_active = true)
        ORDER BY name`,
      [q, activeOnly]
    );
    return rows;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM suppliers WHERE id = $1 AND deleted_at IS NULL`, [id]);
    return rows[0] || null;
  },
  async insert(db, s) {
    const { rows } = await db.query(
      `INSERT INTO suppliers (name, contact_person, phone, email, address, tax_number, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [s.name, s.contactPerson || null, s.phone || null, s.email || null,
       s.address || null, s.taxNumber || null, s.notes || null]
    );
    return rows[0];
  },
  async update(db, id, patch) {
    const { rows } = await db.query(
      `UPDATE suppliers SET
         name           = COALESCE($2, name),
         contact_person = COALESCE($3, contact_person),
         phone          = COALESCE($4, phone),
         email          = COALESCE($5, email),
         address        = COALESCE($6, address),
         tax_number     = COALESCE($7, tax_number),
         notes          = COALESCE($8, notes),
         is_active      = COALESCE($9, is_active)
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, patch.name, patch.contactPerson, patch.phone, patch.email,
       patch.address, patch.taxNumber, patch.notes, patch.isActive]
    );
    return rows[0] || null;
  },
};

const thresholds = {
  async listActive(db) {
    const { rows } = await db.query(
      `SELECT * FROM approval_thresholds WHERE is_active = true ORDER BY min_amount`
    );
    return rows;
  },
  async replaceAll(client, bands) {
    await client.query(`UPDATE approval_thresholds SET is_active = false`);
    for (const b of bands) {
      await client.query(
        `INSERT INTO approval_thresholds
           (band_name, min_amount, max_amount, requires_fnb,
            requires_owner_notification, requires_owner_approval, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,true)`,
        [b.bandName, b.minAmount, b.maxAmount ?? null, b.requiresFnb !== false,
         !!b.requiresOwnerNotification, !!b.requiresOwnerApproval]
      );
    }
  },
};

const usersRepo = {
  async getById(db, id) {
    const { rows } = await db.query(
      `SELECT id, username, role, store_id, is_active,
              first_name, last_name FROM users WHERE id = $1`,
      [id]
    );
    return rows[0] || null;
  },
};

module.exports = { stores, capabilities, items, suppliers, thresholds, usersRepo };
