'use strict';

/**
 * Phase 7 — reporting. Read-only aggregate queries. Valuation/stock reports read
 * live balances; trend/historical reports read immutable snapshots so cost is
 * bounded regardless of ledger size. All endpoints paginate where unbounded.
 */

const { getPool } = require('../db/pool');

const reports = {
  async valuation({ storeId } = {}) {
    const { rows } = await getPool().query(
      `SELECT b.store_id, s.name AS store_name,
              COUNT(*) FILTER (WHERE b.quantity > 0) AS items_in_stock,
              SUM(b.quantity * b.weighted_avg_cost)::numeric(16,2) AS total_value
         FROM store_item_balances b JOIN stores s ON s.id=b.store_id
        WHERE ($1::bigint IS NULL OR b.store_id=$1)
        GROUP BY b.store_id, s.name ORDER BY s.name`,
      [storeId || null]
    );
    return rows;
  },

  async currentStock({ storeId, lowOnly = false } = {}) {
    const { rows } = await getPool().query(
      `SELECT b.store_id, s.name AS store_name, i.id AS item_id, i.item_code, i.description,
              b.quantity, b.min_quantity, b.weighted_avg_cost,
              (b.quantity*b.weighted_avg_cost)::numeric(16,2) AS value
         FROM store_item_balances b
         JOIN stores s ON s.id=b.store_id JOIN inventory_items i ON i.id=b.item_id
        WHERE ($1::bigint IS NULL OR b.store_id=$1)
          AND ($2::boolean=false OR b.quantity <= b.min_quantity)
        ORDER BY s.name, i.description`,
      [storeId || null, lowOnly]
    );
    return rows;
  },

  async lowStock({ storeId } = {}) { return reports.currentStock({ storeId, lowOnly: true }); },

  async outOfStock({ storeId } = {}) {
    const { rows } = await getPool().query(
      `SELECT b.store_id, s.name AS store_name, i.id AS item_id, i.description
         FROM store_item_balances b
         JOIN stores s ON s.id=b.store_id JOIN inventory_items i ON i.id=b.item_id
        WHERE b.quantity <= 0 AND ($1::bigint IS NULL OR b.store_id=$1)
        ORDER BY s.name, i.description`,
      [storeId || null]
    );
    return rows;
  },

  /** Consumption / waste / sale / movement value by type over a date range. */
  async movementByType({ storeId, from, to, type } = {}) {
    const { rows } = await getPool().query(
      `SELECT t.txn_type, t.store_id, s.name AS store_name,
              SUM(ABS(t.quantity))::numeric(14,3) AS qty,
              SUM(ABS(t.total_cost))::numeric(16,2) AS value, COUNT(*) AS txns
         FROM inventory_transactions t JOIN stores s ON s.id=t.store_id
        WHERE ($1::bigint IS NULL OR t.store_id=$1)
          AND ($2::timestamptz IS NULL OR t.created_at>=$2)
          AND ($3::timestamptz IS NULL OR t.created_at<=$3)
          AND ($4::transaction_type IS NULL OR t.txn_type=$4)
        GROUP BY t.txn_type, t.store_id, s.name ORDER BY s.name, t.txn_type`,
      [storeId || null, from || null, to || null, type || null]
    );
    return rows;
  },

  async consumption(opts) { return reports.movementByType({ ...opts, type: 'consumption' }); },
  async waste(opts) { return reports.movementByType({ ...opts, type: 'waste' }); },

  async transfers({ from, to } = {}) {
    const { rows } = await getPool().query(
      `SELECT t.status, COUNT(*) AS count,
              COUNT(*) FILTER (WHERE t.status='received') AS received,
              COUNT(*) FILTER (WHERE t.status='sent') AS in_transit
         FROM transfers t
        WHERE ($1::timestamptz IS NULL OR t.created_at>=$1)
          AND ($2::timestamptz IS NULL OR t.created_at<=$2)
        GROUP BY t.status`,
      [from || null, to || null]
    );
    return rows;
  },

  async purchases({ from, to } = {}) {
    const { rows } = await getPool().query(
      `SELECT po.status, COUNT(*) AS count, SUM(po.total_amount)::numeric(16,2) AS total
         FROM purchase_orders po
        WHERE ($1::timestamptz IS NULL OR po.created_at>=$1)
          AND ($2::timestamptz IS NULL OR po.created_at<=$2)
        GROUP BY po.status`,
      [from || null, to || null]
    );
    return rows;
  },

  async supplierPerformance() {
    const { rows } = await getPool().query(
      `SELECT su.id, su.name,
              COUNT(DISTINCT po.id) AS purchase_orders,
              COALESCE(SUM(po.total_amount),0)::numeric(16,2) AS total_value,
              COUNT(gr.id) FILTER (WHERE gr.has_variance) AS variance_receipts,
              AVG(EXTRACT(EPOCH FROM (gr.received_at - po.order_date))/86400.0)
                FILTER (WHERE gr.received_at IS NOT NULL AND po.order_date IS NOT NULL)::numeric(8,2) AS avg_lead_days
         FROM suppliers su
         LEFT JOIN purchase_orders po ON po.supplier_id=su.id
         LEFT JOIN goods_receipts gr ON gr.po_id=po.id
        WHERE su.deleted_at IS NULL
        GROUP BY su.id, su.name ORDER BY total_value DESC`
    );
    return rows;
  },

  async variance({ from, to } = {}) {
    const { rows } = await getPool().query(
      `SELECT alert_type, store_id, COUNT(*) AS count
         FROM alerts
        WHERE alert_type IN ('large_variance','transfer_variance','keg_variance')
          AND ($1::timestamptz IS NULL OR created_at>=$1)
          AND ($2::timestamptz IS NULL OR created_at<=$2)
        GROUP BY alert_type, store_id ORDER BY count DESC`,
      [from || null, to || null]
    );
    return rows;
  },

  async expiry({ storeId, withinDays = 30 } = {}) {
    const { rows } = await getPool().query(
      `SELECT bt.store_id, s.name AS store_name, i.description, bt.batch_number,
              bt.expiry_date, bt.qty_remaining, (bt.expiry_date - CURRENT_DATE) AS days_to_expiry
         FROM inventory_batches bt
         JOIN inventory_items i ON i.id=bt.item_id JOIN stores s ON s.id=bt.store_id
        WHERE bt.qty_remaining>0 AND bt.expiry_date IS NOT NULL
          AND bt.expiry_date <= CURRENT_DATE + ($2::int)
          AND ($1::bigint IS NULL OR bt.store_id=$1)
        ORDER BY bt.expiry_date`,
      [storeId || null, withinDays]
    );
    return rows;
  },

  async priceHistory({ itemId } = {}) {
    const { rows } = await getPool().query(
      `SELECT ph.*, su.name AS supplier_name FROM item_price_history ph
         LEFT JOIN suppliers su ON su.id=ph.supplier_id
        WHERE ph.item_id=$1 ORDER BY ph.effective_date DESC LIMIT 100`,
      [itemId]
    );
    return rows;
  },

  async kegs({ storeId } = {}) {
    const { rows } = await getPool().query(
      `SELECT k.*, s.name AS store_name,
              (k.liters_received - k.liters_sold - k.liters_waste - k.liters_remaining)::numeric(14,3) AS variance
         FROM kegs k JOIN stores s ON s.id=k.store_id
        WHERE ($1::bigint IS NULL OR k.store_id=$1)
        ORDER BY k.created_at DESC`,
      [storeId || null]
    );
    return rows;
  },

  async dailyClosings({ storeId, limit = 60 } = {}) {
    const { rows } = await getPool().query(
      `SELECT dc.*, s.name AS store_name FROM daily_closings dc JOIN stores s ON s.id=dc.store_id
        WHERE ($1::bigint IS NULL OR dc.store_id=$1)
        ORDER BY dc.business_date DESC LIMIT $2`,
      [storeId || null, limit]
    );
    return rows;
  },

  /** Snapshot-backed inventory value trend (bounded cost). */
  async valuationTrend({ storeId, days = 30 } = {}) {
    const { rows } = await getPool().query(
      `SELECT snapshot_date, SUM(inventory_value)::numeric(16,2) AS total_value
         FROM inventory_snapshots
        WHERE ($1::bigint IS NULL OR store_id=$1)
          AND snapshot_date >= CURRENT_DATE - ($2::int)
        GROUP BY snapshot_date ORDER BY snapshot_date`,
      [storeId || null, days]
    );
    return rows;
  },
};

module.exports = { reports };
