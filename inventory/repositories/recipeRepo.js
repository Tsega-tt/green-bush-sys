'use strict';

const recipes = {
  async upsertHeader(client, h) {
    const { rows } = await client.query(
      `INSERT INTO menu_recipes
         (menu_item_id, store_id, availability_mode, is_active,
          inventory_controlled, auto_deduct, allow_sale_when_insufficient,
          waste_factor_pct, selling_price, serving_size, serving_uom, serving_size_id, version)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (menu_item_id) DO UPDATE SET
         store_id = EXCLUDED.store_id, availability_mode = EXCLUDED.availability_mode,
         is_active = EXCLUDED.is_active, inventory_controlled = EXCLUDED.inventory_controlled,
         auto_deduct = EXCLUDED.auto_deduct, allow_sale_when_insufficient = EXCLUDED.allow_sale_when_insufficient,
         waste_factor_pct = EXCLUDED.waste_factor_pct, selling_price = EXCLUDED.selling_price,
         serving_size = EXCLUDED.serving_size, serving_uom = EXCLUDED.serving_uom,
         serving_size_id = EXCLUDED.serving_size_id, version = EXCLUDED.version
       RETURNING *`,
      [h.menuItemId, h.storeId, h.availabilityMode || 'auto', h.isActive !== false,
       h.inventoryControlled !== false, h.autoDeduct !== false, !!h.allowSaleWhenInsufficient,
       h.wasteFactorPct || 0, h.sellingPrice ?? null, h.servingSize ?? null, h.servingUom || null,
       h.servingSizeId ?? null, h.version || 1]
    );
    return rows[0];
  },
  async maxVersion(db, menuItemId) {
    const { rows } = await db.query(`SELECT COALESCE(MAX(version),0)::int AS v FROM recipe_versions WHERE menu_item_id=$1`, [menuItemId]);
    return rows[0].v;
  },
  async recordVersion(client, { menuItemId, version, storeId, snapshot, createdBy }) {
    await client.query(
      `INSERT INTO recipe_versions (menu_item_id, version, store_id, snapshot, created_by)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (menu_item_id, version) DO NOTHING`,
      [menuItemId, version, storeId, JSON.stringify(snapshot), createdBy || null]
    );
  },
  async listVersions(db, menuItemId) {
    const { rows } = await db.query(
      `SELECT version, store_id, snapshot, created_by, created_at
         FROM recipe_versions WHERE menu_item_id=$1 ORDER BY version DESC`, [menuItemId]);
    return rows;
  },
  /** WAC-based recipe cost from the assigned store's balances, incl. waste. */
  async recipeCost(db, menuItemId) {
    const { rows } = await db.query(
      `SELECT COALESCE(SUM(
                 rc.quantity * (1 + (COALESCE(rc.waste_factor_pct,0) + COALESCE(mr.waste_factor_pct,0))/100.0)
                 * COALESCE(b.weighted_avg_cost,0)
               ),0)::numeric(16,4) AS cost
         FROM recipe_components rc
         JOIN menu_recipes mr ON mr.menu_item_id = rc.menu_item_id
         LEFT JOIN store_item_balances b ON b.store_id = mr.store_id AND b.item_id = rc.item_id
        WHERE rc.menu_item_id = $1`,
      [menuItemId]
    );
    return Number(rows[0].cost);
  },
  async replaceComponents(client, menuItemId, components) {
    await client.query(`DELETE FROM recipe_components WHERE menu_item_id=$1`, [menuItemId]);
    for (const c of components) {
      await client.query(
        `INSERT INTO recipe_components (menu_item_id, item_id, quantity, uom, waste_factor_pct)
         VALUES ($1,$2,$3,$4,$5)`,
        [menuItemId, c.itemId, c.quantity, c.uom || 'pcs', c.wasteFactorPct || 0]
      );
    }
  },
  async getHeader(db, menuItemId) {
    const { rows } = await db.query(
      `SELECT mr.*, ss.code AS serving_size_code, ss.name AS serving_size_name,
              ss.liter_quantity AS serving_liters, ss.is_active AS serving_size_active
         FROM menu_recipes mr
         LEFT JOIN draft_serving_sizes ss ON ss.id = mr.serving_size_id
        WHERE mr.menu_item_id=$1`,
      [menuItemId]
    );
    return rows[0] || null;
  },
  async getComponents(db, menuItemId) {
    const { rows } = await db.query(
      `SELECT rc.*, i.description, i.item_code, i.uom AS item_uom
         FROM recipe_components rc JOIN inventory_items i ON i.id = rc.item_id
        WHERE rc.menu_item_id=$1 ORDER BY rc.id`,
      [menuItemId]
    );
    return rows;
  },
  async list(db) {
    const { rows } = await db.query(
      `SELECT mr.*, s.name AS store_name,
              (SELECT COUNT(*) FROM recipe_components rc WHERE rc.menu_item_id=mr.menu_item_id) AS component_count,
              (SELECT COALESCE(SUM(
                 rc.quantity * (1 + (COALESCE(rc.waste_factor_pct,0) + COALESCE(mr.waste_factor_pct,0))/100.0)
                 * COALESCE(b.weighted_avg_cost,0)
               ),0)
               FROM recipe_components rc
               LEFT JOIN store_item_balances b ON b.store_id = mr.store_id AND b.item_id = rc.item_id
              WHERE rc.menu_item_id = mr.menu_item_id)::numeric(16,4) AS recipe_cost
         FROM menu_recipes mr JOIN stores s ON s.id = mr.store_id
        ORDER BY mr.menu_item_id`
    );
    return rows;
  },
  /** All components that draw on a given inventory item (for availability fanout). */
  async menuItemsUsingItem(db, itemId) {
    const { rows } = await db.query(
      `SELECT DISTINCT menu_item_id FROM recipe_components WHERE item_id=$1`, [itemId]
    );
    return rows.map((r) => r.menu_item_id);
  },
};

module.exports = { recipes };
