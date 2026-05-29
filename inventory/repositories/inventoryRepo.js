'use strict';

/**
 * Data-access for the transactional core: store_item_balances, inventory_batches,
 * inventory_transactions, item_price_history.
 *
 * Every function takes a `db` executor as the first argument — pass a transaction
 * CLIENT for any write/lock so it participates in the surrounding transaction;
 * pass the pool for read-only queries outside a transaction.
 */

// ---------------- store_item_balances ----------------
const balances = {
  /**
   * Ensure the (store,item) balance row exists, then lock it FOR UPDATE.
   * This is the serialization point for all movements of that item.
   */
  async lockOrCreate(client, storeId, itemId, defaults = {}) {
    await client.query(
      `INSERT INTO store_item_balances (store_id, item_id, min_quantity, reorder_point)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (store_id, item_id) DO NOTHING`,
      [storeId, itemId, defaults.minQuantity || 0, defaults.reorderPoint || 0]
    );
    const { rows } = await client.query(
      `SELECT * FROM store_item_balances
        WHERE store_id = $1 AND item_id = $2
        FOR UPDATE`,
      [storeId, itemId]
    );
    return rows[0];
  },

  async update(client, id, { quantity, weightedAvgCost, lastMovementAt }) {
    const { rows } = await client.query(
      `UPDATE store_item_balances
          SET quantity = $2,
              weighted_avg_cost = $3,
              last_movement_at = COALESCE($4, now())
        WHERE id = $1
        RETURNING *`,
      [id, quantity, weightedAvgCost, lastMovementAt || null]
    );
    return rows[0];
  },

  async get(db, storeId, itemId) {
    const { rows } = await db.query(
      `SELECT b.*, i.description, i.item_code, i.uom,
              (b.quantity * b.weighted_avg_cost)::numeric(16,2) AS value
         FROM store_item_balances b
         JOIN inventory_items i ON i.id = b.item_id
        WHERE b.store_id = $1 AND b.item_id = $2`,
      [storeId, itemId]
    );
    return rows[0] || null;
  },

  async listByStore(db, storeId, { lowOnly = false } = {}) {
    const { rows } = await db.query(
      `SELECT b.*, i.description, i.item_code, i.uom, i.category,
              (b.quantity * b.weighted_avg_cost)::numeric(16,2) AS value
         FROM store_item_balances b
         JOIN inventory_items i ON i.id = b.item_id
        WHERE b.store_id = $1
          AND ($2::boolean = false OR b.quantity <= b.min_quantity)
        ORDER BY i.description`,
      [storeId, lowOnly]
    );
    return rows;
  },

  async valuation(db, storeId = null) {
    const { rows } = await db.query(
      `SELECT b.store_id, s.name AS store_name,
              SUM(b.quantity * b.weighted_avg_cost)::numeric(16,2) AS total_value,
              COUNT(*) FILTER (WHERE b.quantity > 0) AS item_count
         FROM store_item_balances b
         JOIN stores s ON s.id = b.store_id
        WHERE ($1::bigint IS NULL OR b.store_id = $1)
        GROUP BY b.store_id, s.name
        ORDER BY s.name`,
      [storeId]
    );
    return rows;
  },
};

// ---------------- inventory_batches ----------------
const batches = {
  async insert(client, b) {
    const { rows } = await client.query(
      `INSERT INTO inventory_batches
         (store_id, item_id, supplier_id, gr_id, batch_number, mfg_date, expiry_date,
          qty_received, qty_remaining, unit_cost, received_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8,$9, COALESCE($10, now()))
       RETURNING *`,
      [
        b.storeId, b.itemId, b.supplierId || null, b.grId || null,
        b.batchNumber || null, b.mfgDate || null, b.expiryDate || null,
        b.qty, b.unitCost || 0, b.receivedAt || null,
      ]
    );
    return rows[0];
  },

  /** Lock all non-empty batches for an item in FEFO order (earliest expiry first). */
  async lockFefo(client, storeId, itemId) {
    const { rows } = await client.query(
      `SELECT * FROM inventory_batches
        WHERE store_id = $1 AND item_id = $2 AND qty_remaining > 0
        ORDER BY expiry_date ASC NULLS LAST, received_at ASC, id ASC
        FOR UPDATE`,
      [storeId, itemId]
    );
    return rows;
  },

  async decrement(client, batchId, amount) {
    const { rows } = await client.query(
      `UPDATE inventory_batches
          SET qty_remaining = qty_remaining - $2
        WHERE id = $1
        RETURNING *`,
      [batchId, amount]
    );
    return rows[0];
  },

  async listExpiring(db, { storeId = null, withinDays = 30 } = {}) {
    const { rows } = await db.query(
      `SELECT bt.*, i.description, s.name AS store_name,
              (bt.expiry_date - CURRENT_DATE) AS days_to_expiry
         FROM inventory_batches bt
         JOIN inventory_items i ON i.id = bt.item_id
         JOIN stores s ON s.id = bt.store_id
        WHERE bt.qty_remaining > 0
          AND bt.expiry_date IS NOT NULL
          AND bt.expiry_date <= CURRENT_DATE + ($2::int)
          AND ($1::bigint IS NULL OR bt.store_id = $1)
        ORDER BY bt.expiry_date ASC`,
      [storeId, withinDays]
    );
    return rows;
  },
};

// ---------------- inventory_transactions (ledger) ----------------
const ledger = {
  async findByIdempotencyKey(client, key) {
    if (!key) return null;
    const { rows } = await client.query(
      `SELECT * FROM inventory_transactions WHERE idempotency_key = $1`,
      [key]
    );
    return rows[0] || null;
  },

  async insert(client, t) {
    const { rows } = await client.query(
      `INSERT INTO inventory_transactions
         (txn_number, txn_type, store_id, item_id, batch_id, quantity, uom,
          unit_cost, total_cost, balance_after, wac_after, reference_type,
          reference_id, counterparty_store_id, idempotency_key, note,
          created_by, created_by_role)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [
        t.txnNumber, t.txnType, t.storeId, t.itemId, t.batchId || null,
        t.quantity, t.uom, t.unitCost || 0, t.totalCost || 0,
        t.balanceAfter, t.wacAfter || 0, t.referenceType || null,
        t.referenceId || null, t.counterpartyStoreId || null,
        t.idempotencyKey || null, t.note || null, t.createdBy, t.createdByRole || null,
      ]
    );
    return rows[0];
  },

  async listByItem(db, { storeId, itemId, from, to, limit = 100, offset = 0 }) {
    const { rows } = await db.query(
      `SELECT * FROM inventory_transactions
        WHERE store_id = $1 AND item_id = $2
          AND ($3::timestamptz IS NULL OR created_at >= $3)
          AND ($4::timestamptz IS NULL OR created_at <= $4)
        ORDER BY created_at DESC, id DESC
        LIMIT $5 OFFSET $6`,
      [storeId, itemId, from || null, to || null, limit, offset]
    );
    return rows;
  },

  async listByStore(db, { storeId, type, from, to, limit = 100, offset = 0 }) {
    const { rows } = await db.query(
      `SELECT t.*, i.description AS item_description
         FROM inventory_transactions t
         JOIN inventory_items i ON i.id = t.item_id
        WHERE t.store_id = $1
          AND ($2::transaction_type IS NULL OR t.txn_type = $2)
          AND ($3::timestamptz IS NULL OR t.created_at >= $3)
          AND ($4::timestamptz IS NULL OR t.created_at <= $4)
        ORDER BY t.created_at DESC, t.id DESC
        LIMIT $5 OFFSET $6`,
      [storeId, type || null, from || null, to || null, limit, offset]
    );
    return rows;
  },

  /** Ledger replay total for reconciliation/verification. */
  async sumQuantity(db, storeId, itemId) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(quantity),0)::numeric(14,3) AS total
         FROM inventory_transactions WHERE store_id = $1 AND item_id = $2`,
      [storeId, itemId]
    );
    return rows[0].total;
  },
};

// ---------------- item_price_history ----------------
const priceHistory = {
  async insert(client, p) {
    await client.query(
      `INSERT INTO item_price_history
         (item_id, supplier_id, store_id, unit_cost, source_type, source_id, effective_date)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7, CURRENT_DATE))`,
      [p.itemId, p.supplierId || null, p.storeId || null, p.unitCost,
       p.sourceType || 'goods_receipt', p.sourceId || null, p.effectiveDate || null]
    );
  },

  async listByItem(db, itemId, { limit = 50 } = {}) {
    const { rows } = await db.query(
      `SELECT * FROM item_price_history
        WHERE item_id = $1 ORDER BY effective_date DESC, id DESC LIMIT $2`,
      [itemId, limit]
    );
    return rows;
  },
};

module.exports = { balances, batches, ledger, priceHistory };
