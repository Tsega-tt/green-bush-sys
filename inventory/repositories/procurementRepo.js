'use strict';

const pr = {
  async create(client, h) {
    const { rows } = await client.query(
      `INSERT INTO purchase_requisitions
         (pr_number, store_id, status, requested_by, notes, estimated_total, threshold_band)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [h.prNumber, h.storeId, h.status || 'pending_fnb', h.requestedBy, h.notes || null,
       h.estimatedTotal || 0, h.thresholdBand || null]
    );
    return rows[0];
  },
  async addLine(client, prId, l) {
    const { rows } = await client.query(
      `INSERT INTO pr_lines
         (pr_id, line_no, item_id, description, uom, quantity_requested, est_unit_cost, est_line_cost)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [prId, l.lineNo, l.itemId || null, l.description, l.uom || 'pcs',
       l.quantityRequested, l.estUnitCost || 0, l.estLineCost || 0]
    );
    return rows[0];
  },
  async lockById(client, id) {
    const { rows } = await client.query(`SELECT * FROM purchase_requisitions WHERE id=$1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM purchase_requisitions WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const lines = await db.query(`SELECT * FROM pr_lines WHERE pr_id=$1 ORDER BY line_no`, [id]);
    return { ...rows[0], lines: lines.rows };
  },
  async getLines(client, prId) {
    const { rows } = await client.query(`SELECT * FROM pr_lines WHERE pr_id=$1 ORDER BY line_no`, [prId]);
    return rows;
  },
  async setLineApproved(client, lineId, qty) {
    await client.query(`UPDATE pr_lines SET quantity_approved=$2 WHERE id=$1`, [lineId, qty]);
  },
  async updateStatus(client, id, fields) { return updateGeneric(client, 'purchase_requisitions', id, fields); },
  async list(db, { status, storeId, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT p.*, s.name AS store_name FROM purchase_requisitions p
         JOIN stores s ON s.id = p.store_id
        WHERE ($1::pr_status IS NULL OR p.status=$1)
          AND ($2::bigint IS NULL OR p.store_id=$2)
        ORDER BY p.created_at DESC LIMIT $3 OFFSET $4`,
      [status || null, storeId || null, limit, offset]
    );
    return rows;
  },
};

const po = {
  async create(client, h) {
    const { rows } = await client.query(
      `INSERT INTO purchase_orders
         (po_number, pr_id, supplier_id, status, purchaser_id, order_date, expected_date,
          subtotal, total_amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9) RETURNING *`,
      [h.poNumber, h.prId || null, h.supplierId, h.status || 'issued', h.purchaserId,
       h.orderDate || null, h.expectedDate || null, h.total || 0, h.notes || null]
    );
    return rows[0];
  },
  async addLine(client, poId, l) {
    const { rows } = await client.query(
      `INSERT INTO po_lines
         (po_id, line_no, item_id, description, uom, quantity_ordered, unit_cost, line_total)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [poId, l.lineNo, l.itemId, l.description, l.uom || 'pcs',
       l.quantityOrdered, l.unitCost || 0, l.lineTotal || 0]
    );
    return rows[0];
  },
  async lockById(client, id) {
    const { rows } = await client.query(`SELECT * FROM purchase_orders WHERE id=$1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM purchase_orders WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const lines = await db.query(`SELECT * FROM po_lines WHERE po_id=$1 ORDER BY line_no`, [id]);
    return { ...rows[0], lines: lines.rows };
  },
  async getLine(client, lineId) {
    const { rows } = await client.query(`SELECT * FROM po_lines WHERE id=$1`, [lineId]);
    return rows[0] || null;
  },
  async addReceived(client, lineId, qty) {
    await client.query(`UPDATE po_lines SET quantity_received = quantity_received + $2 WHERE id=$1`, [lineId, qty]);
  },
  async updateStatus(client, id, fields) { return updateGeneric(client, 'purchase_orders', id, fields); },
  async list(db, { status, supplierId, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT po.*, su.name AS supplier_name FROM purchase_orders po
         JOIN suppliers su ON su.id = po.supplier_id
        WHERE ($1::po_status IS NULL OR po.status=$1)
          AND ($2::bigint IS NULL OR po.supplier_id=$2)
        ORDER BY po.created_at DESC LIMIT $3 OFFSET $4`,
      [status || null, supplierId || null, limit, offset]
    );
    return rows;
  },
};

const grn = {
  async create(client, h) {
    const { rows } = await client.query(
      `INSERT INTO goods_receipts
         (gr_number, po_id, store_id, supplier_id, status, received_by,
          invoice_number, grn_number, delivery_note_number)
       VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8) RETURNING *`,
      [h.grNumber, h.poId, h.storeId, h.supplierId, h.receivedBy,
       h.invoiceNumber || null, h.grnNumber || null, h.deliveryNoteNumber || null]
    );
    return rows[0];
  },
  async addLine(client, grId, l) {
    const { rows } = await client.query(
      `INSERT INTO gr_lines
         (gr_id, po_line_id, item_id, uom, quantity_received, quantity_rejected,
          rejection_reason, unit_cost, variance_qty, batch_number, mfg_date, expiry_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [grId, l.poLineId, l.itemId, l.uom || 'pcs', l.quantityReceived, l.quantityRejected || 0,
       l.rejectionReason || null, l.unitCost || 0, l.varianceQty || 0,
       l.batchNumber || null, l.mfgDate || null, l.expiryDate || null]
    );
    return rows[0];
  },
  async lockById(client, id) {
    const { rows } = await client.query(`SELECT * FROM goods_receipts WHERE id=$1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM goods_receipts WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const lines = await db.query(`SELECT * FROM gr_lines WHERE gr_id=$1 ORDER BY id`, [id]);
    return { ...rows[0], lines: lines.rows };
  },
  async getLines(client, grId) {
    const { rows } = await client.query(`SELECT * FROM gr_lines WHERE gr_id=$1 ORDER BY id`, [grId]);
    return rows;
  },
  async updateStatus(client, id, fields) { return updateGeneric(client, 'goods_receipts', id, fields); },
  async list(db, { status, storeId, poId, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT gr.*, s.name AS store_name FROM goods_receipts gr
         JOIN stores s ON s.id = gr.store_id
        WHERE ($1::gr_status IS NULL OR gr.status=$1)
          AND ($2::bigint IS NULL OR gr.store_id=$2)
          AND ($3::bigint IS NULL OR gr.po_id=$3)
        ORDER BY gr.created_at DESC LIMIT $4 OFFSET $5`,
      [status || null, storeId || null, poId || null, limit, offset]
    );
    return rows;
  },
};

async function updateGeneric(client, table, id, fields) {
  const sets = [];
  const vals = [id];
  let i = 2;
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = $${i}`); vals.push(v); i += 1; }
  const { rows } = await client.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals);
  return rows[0];
}

module.exports = { pr, po, grn };
