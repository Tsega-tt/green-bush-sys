'use strict';

const transfers = {
  async create(client, t) {
    const { rows } = await client.query(
      `INSERT INTO transfers
         (transfer_number, source_store_id, dest_store_id, source_request_ref,
          status, requested_by, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [t.transferNumber, t.sourceStoreId, t.destStoreId, t.sourceRequestRef || null,
       t.status || 'pending_fnb', t.requestedBy, t.notes || null]
    );
    return rows[0];
  },
  async addLine(client, transferId, line) {
    const { rows } = await client.query(
      `INSERT INTO transfer_lines
         (transfer_id, line_no, item_id, uom, quantity_requested)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [transferId, line.lineNo, line.itemId, line.uom || 'pcs', line.quantityRequested]
    );
    return rows[0];
  },
  async lockById(client, id) {
    const { rows } = await client.query(`SELECT * FROM transfers WHERE id = $1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM transfers WHERE id = $1`, [id]);
    if (!rows[0]) return null;
    const lines = await db.query(
      `SELECT tl.*, i.description, i.item_code FROM transfer_lines tl
        JOIN inventory_items i ON i.id = tl.item_id
       WHERE tl.transfer_id = $1 ORDER BY tl.line_no`, [id]
    );
    return { ...rows[0], lines: lines.rows };
  },
  async getLines(client, transferId) {
    const { rows } = await client.query(
      `SELECT * FROM transfer_lines WHERE transfer_id = $1 ORDER BY line_no`, [transferId]
    );
    return rows;
  },
  async list(db, { status, storeId, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT t.*, ss.name AS source_name, ds.name AS dest_name
         FROM transfers t
         JOIN stores ss ON ss.id = t.source_store_id
         JOIN stores ds ON ds.id = t.dest_store_id
        WHERE ($1::transfer_status IS NULL OR t.status = $1)
          AND ($2::bigint IS NULL OR t.source_store_id = $2 OR t.dest_store_id = $2)
        ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
      [status || null, storeId || null, limit, offset]
    );
    return rows;
  },
  async updateStatus(client, id, fields) {
    const sets = [];
    const vals = [id];
    let i = 2;
    for (const [k, v] of Object.entries(fields)) { sets.push(`${k} = $${i}`); vals.push(v); i += 1; }
    const { rows } = await client.query(
      `UPDATE transfers SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, vals
    );
    return rows[0];
  },
  async setLineApproved(client, lineId, qty) {
    await client.query(`UPDATE transfer_lines SET quantity_approved = $2 WHERE id = $1`, [lineId, qty]);
  },
  async setLineSent(client, lineId, qty, unitCost) {
    await client.query(
      `UPDATE transfer_lines SET quantity_sent = $2, sent_unit_cost = $3 WHERE id = $1`,
      [lineId, qty, unitCost]
    );
  },
  async setLineReceived(client, lineId, qty) {
    await client.query(`UPDATE transfer_lines SET quantity_received = $2 WHERE id = $1`, [lineId, qty]);
  },
};

module.exports = { transfers };
