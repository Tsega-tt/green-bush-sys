'use strict';

/** Data access for the per-item purchase→F&B→store acceptance workflow. */

const ITEM_SELECT = `
  SELECT ai.*,
         b.batch_number, b.supplier_id, b.supplier_name, b.supplier_info,
         b.invoice_number, b.grn_number, b.purchaser_id, b.purchaser_name, b.notes AS batch_notes,
         s.name AS destination_store_name, s.icon AS destination_store_icon,
         i.item_code
    FROM acceptance_items ai
    JOIN acceptance_batches b ON b.id = ai.batch_id
    JOIN stores s ON s.id = ai.destination_store_id
    LEFT JOIN inventory_items i ON i.id = ai.item_id`;

const acceptance = {
  async insertBatch(client, b) {
    const { rows } = await client.query(
      `INSERT INTO acceptance_batches
         (batch_number, pr_id, purchaser_id, purchaser_name, supplier_id, supplier_name,
          supplier_info, invoice_number, grn_number, notes)
       VALUES ('PENDING',$1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [b.prId || null, b.purchaserId, b.purchaserName || null, b.supplierId || null,
       b.supplierName || null, b.supplierInfo || null, b.invoiceNumber || null,
       b.grnNumber || null, b.notes || null]
    );
    const batch = rows[0];
    const num = `ACC-${new Date().getFullYear()}-${String(batch.id).padStart(5, '0')}`;
    const upd = await client.query(`UPDATE acceptance_batches SET batch_number=$2 WHERE id=$1 RETURNING *`, [batch.id, num]);
    return upd.rows[0];
  },

  async insertItem(client, batchId, it) {
    const { rows } = await client.query(
      `INSERT INTO acceptance_items
         (batch_id, item_id, is_new_item, description, category, sub_category, item_type,
          uom, uom_attributes, specifications, storage_requirements, quantity, unit_cost,
          destination_store_id, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'awaiting_fnb') RETURNING *`,
      [batchId, it.itemId || null, !!it.isNewItem, it.description, it.category || null,
       it.subCategory || null, it.itemType || null, it.uom || 'pcs',
       JSON.stringify(it.uomAttributes || {}), it.specifications || null,
       it.storageRequirements || null, it.quantity, it.unitCost || 0, it.destinationStoreId]
    );
    return rows[0];
  },

  async addEvent(client, e) {
    await client.query(
      `INSERT INTO acceptance_events (item_id, from_status, to_status, actor_id, actor_role, reason)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [e.itemId, e.fromStatus || null, e.toStatus, e.actorId || null, e.actorRole || null, e.reason || null]
    );
  },

  async lockItem(client, id) {
    const { rows } = await client.query(`SELECT * FROM acceptance_items WHERE id=$1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },

  async updateItem(client, id, fields) {
    const sets = []; const vals = [id]; let i = 2;
    for (const [k, v] of Object.entries(fields)) { sets.push(`${k}=$${i}`); vals.push(v); i += 1; }
    const { rows } = await client.query(
      `UPDATE acceptance_items SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals);
    return rows[0];
  },

  async getItem(db, id) {
    const { rows } = await db.query(`${ITEM_SELECT} WHERE ai.id=$1`, [id]);
    if (!rows[0]) return null;
    const ev = await db.query(`SELECT * FROM acceptance_events WHERE item_id=$1 ORDER BY created_at`, [id]);
    return { ...rows[0], events: ev.rows };
  },

  /** Filtered list. opts: { status[], storeId, batchId, purchaserId } */
  async listItems(db, opts = {}) {
    const where = []; const vals = []; let i = 1;
    if (opts.status && opts.status.length) { where.push(`ai.status = ANY($${i})`); vals.push(opts.status); i += 1; }
    if (opts.storeId) { where.push(`ai.destination_store_id = $${i}`); vals.push(opts.storeId); i += 1; }
    if (opts.batchId) { where.push(`ai.batch_id = $${i}`); vals.push(opts.batchId); i += 1; }
    if (opts.purchaserId) { where.push(`b.purchaser_id = $${i}`); vals.push(opts.purchaserId); i += 1; }
    const { rows } = await db.query(
      `${ITEM_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ai.created_at DESC`,
      vals
    );
    return rows;
  },

  async getBatch(db, id) {
    const { rows } = await db.query(`SELECT * FROM acceptance_batches WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const items = await db.query(`${ITEM_SELECT} WHERE ai.batch_id=$1 ORDER BY ai.id`, [id]);
    return { ...rows[0], items: items.rows };
  },
};

module.exports = { acceptance };
