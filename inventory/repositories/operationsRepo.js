'use strict';

const waste = {
  async insert(client, w) {
    const { rows } = await client.query(
      `INSERT INTO waste (waste_number, store_id, item_id, quantity, uom, reason, value, txn_id, recorded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [w.wasteNumber, w.storeId, w.itemId, w.quantity, w.uom, w.reason, w.value || 0, w.txnId || null, w.recordedBy]
    );
    return rows[0];
  },
  async list(db, { storeId, from, to, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT w.*, i.description, s.name AS store_name FROM waste w
         JOIN inventory_items i ON i.id = w.item_id JOIN stores s ON s.id = w.store_id
        WHERE ($1::bigint IS NULL OR w.store_id=$1)
          AND ($2::timestamptz IS NULL OR w.created_at>=$2)
          AND ($3::timestamptz IS NULL OR w.created_at<=$3)
        ORDER BY w.created_at DESC LIMIT $4 OFFSET $5`,
      [storeId || null, from || null, to || null, limit, offset]
    );
    return rows;
  },
};

const counts = {
  async create(client, c) {
    const { rows } = await client.query(
      `INSERT INTO stock_counts (count_number, store_id, status, is_blind, note, counted_by)
       VALUES ($1,$2,'open',$3,$4,$5) RETURNING *`,
      [c.countNumber, c.storeId, !!c.isBlind, c.note || null, c.countedBy]
    );
    return rows[0];
  },
  async addLine(client, countId, l) {
    await client.query(
      `INSERT INTO stock_count_lines (count_id, item_id, system_qty) VALUES ($1,$2,$3)
       ON CONFLICT (count_id, item_id) DO NOTHING`,
      [countId, l.itemId, l.systemQty]
    );
  },
  async lockById(client, id) {
    const { rows } = await client.query(`SELECT * FROM stock_counts WHERE id=$1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM stock_counts WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const lines = await db.query(
      `SELECT cl.*, i.description FROM stock_count_lines cl
        JOIN inventory_items i ON i.id=cl.item_id WHERE cl.count_id=$1 ORDER BY i.description`, [id]
    );
    return { ...rows[0], lines: lines.rows };
  },
  async getLines(client, countId) {
    const { rows } = await client.query(`SELECT * FROM stock_count_lines WHERE count_id=$1`, [countId]);
    return rows;
  },
  async setLinePhysical(client, lineId, physicalQty) {
    await client.query(`UPDATE stock_count_lines SET physical_qty=$2 WHERE id=$1`, [lineId, physicalQty]);
  },
  async setLineResult(client, lineId, { physicalQty, variance, adjusted }) {
    await client.query(
      `UPDATE stock_count_lines SET physical_qty=$2, variance=$3, adjusted=$4 WHERE id=$1`,
      [lineId, physicalQty, variance, adjusted]
    );
  },
  async updateStatus(client, id, fields) { return upd(client, 'stock_counts', id, fields); },
  async list(db, { storeId, status, limit = 100, offset = 0 } = {}) {
    const { rows } = await db.query(
      `SELECT c.*, s.name AS store_name FROM stock_counts c JOIN stores s ON s.id=c.store_id
        WHERE ($1::bigint IS NULL OR c.store_id=$1) AND ($2::text IS NULL OR c.status=$2)
        ORDER BY c.created_at DESC LIMIT $3 OFFSET $4`,
      [storeId || null, status || null, limit, offset]
    );
    return rows;
  },
};

const closings = {
  async upsert(client, c) {
    const { rows } = await client.query(
      `INSERT INTO daily_closings
         (store_id, business_date, opening_value, purchases_value, transfers_in_value,
          transfers_out_value, consumption_value, sales_value, waste_value, adjustment_value,
          expected_value, details)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (store_id, business_date) DO UPDATE SET
         opening_value=EXCLUDED.opening_value, purchases_value=EXCLUDED.purchases_value,
         transfers_in_value=EXCLUDED.transfers_in_value, transfers_out_value=EXCLUDED.transfers_out_value,
         consumption_value=EXCLUDED.consumption_value, sales_value=EXCLUDED.sales_value,
         waste_value=EXCLUDED.waste_value, adjustment_value=EXCLUDED.adjustment_value,
         expected_value=EXCLUDED.expected_value, details=EXCLUDED.details
       WHERE daily_closings.status='open'
       RETURNING *`,
      [c.storeId, c.businessDate, c.openingValue, c.purchasesValue, c.transfersInValue,
       c.transfersOutValue, c.consumptionValue, c.salesValue, c.wasteValue, c.adjustmentValue,
       c.expectedValue, c.details ? JSON.stringify(c.details) : null]
    );
    return rows[0] || null;
  },
  async lockByStoreDate(client, storeId, date) {
    const { rows } = await client.query(
      `SELECT * FROM daily_closings WHERE store_id=$1 AND business_date=$2 FOR UPDATE`, [storeId, date]
    );
    return rows[0] || null;
  },
  async get(db, storeId, date) {
    const { rows } = await db.query(
      `SELECT * FROM daily_closings WHERE store_id=$1 AND business_date=$2`, [storeId, date]
    );
    return rows[0] || null;
  },
  async confirm(client, id, fields) { return upd(client, 'daily_closings', id, fields); },
  async list(db, { storeId, limit = 60 } = {}) {
    const { rows } = await db.query(
      `SELECT dc.*, s.name AS store_name FROM daily_closings dc JOIN stores s ON s.id=dc.store_id
        WHERE ($1::bigint IS NULL OR dc.store_id=$1)
        ORDER BY dc.business_date DESC LIMIT $2`, [storeId || null, limit]
    );
    return rows;
  },
};

const kegs = {
  async create(client, k) {
    const { rows } = await client.query(
      `INSERT INTO kegs (keg_code, store_id, item_id, supplier_id, size_liters,
         liters_received, liters_remaining, status, received_at)
       VALUES ($1,$2,$3,$4,$5,$5,$5,'received', now()) RETURNING *`,
      [k.kegCode, k.storeId, k.itemId || null, k.supplierId || null, k.sizeLiters]
    );
    return rows[0];
  },
  async lockById(client, id) {
    const { rows } = await client.query(`SELECT * FROM kegs WHERE id=$1 FOR UPDATE`, [id]);
    return rows[0] || null;
  },
  /**
   * Active keg to pour from for (store, beverage item): prefer a tapped keg,
   * then the oldest still-full one (FEFO). Locked for the sale transaction.
   */
  async lockActiveForItem(client, storeId, itemId) {
    const { rows } = await client.query(
      `SELECT * FROM kegs
        WHERE store_id=$1 AND item_id=$2 AND status IN ('tapped','received') AND liters_remaining > 0
        ORDER BY (status='tapped') DESC, received_at ASC
        LIMIT 1 FOR UPDATE`,
      [storeId, itemId]
    );
    return rows[0] || null;
  },
  async getById(db, id) {
    const { rows } = await db.query(`SELECT * FROM kegs WHERE id=$1`, [id]);
    if (!rows[0]) return null;
    const ev = await db.query(`SELECT * FROM keg_events WHERE keg_id=$1 ORDER BY created_at`, [id]);
    return { ...rows[0], events: ev.rows };
  },
  async update(client, id, fields) { return upd(client, 'kegs', id, fields); },
  async addEvent(client, e) {
    await client.query(
      `INSERT INTO keg_events (keg_id, event_type, liters, liters_remaining_after, note, created_by)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [e.kegId, e.eventType, e.liters, e.litersRemainingAfter, e.note || null, e.createdBy]
    );
  },
  async list(db, { storeId, status, limit = 100 } = {}) {
    const { rows } = await db.query(
      `SELECT k.*, s.name AS store_name FROM kegs k JOIN stores s ON s.id=k.store_id
        WHERE ($1::bigint IS NULL OR k.store_id=$1) AND ($2::text IS NULL OR k.status=$2)
        ORDER BY k.created_at DESC LIMIT $3`, [storeId || null, status || null, limit]
    );
    return rows;
  },
};

async function upd(client, table, id, fields) {
  const sets = []; const vals = [id]; let i = 2;
  for (const [k, v] of Object.entries(fields)) { sets.push(`${k}=$${i}`); vals.push(v); i += 1; }
  const { rows } = await client.query(`UPDATE ${table} SET ${sets.join(', ')} WHERE id=$1 RETURNING *`, vals);
  return rows[0];
}

module.exports = { waste, counts, closings, kegs };
