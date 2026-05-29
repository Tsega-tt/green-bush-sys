'use strict';

const recipes = {
  async upsertHeader(client, { menuItemId, storeId, availabilityMode = 'auto', isActive = true }) {
    const { rows } = await client.query(
      `INSERT INTO menu_recipes (menu_item_id, store_id, availability_mode, is_active)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (menu_item_id) DO UPDATE SET
         store_id = EXCLUDED.store_id, availability_mode = EXCLUDED.availability_mode,
         is_active = EXCLUDED.is_active
       RETURNING *`,
      [menuItemId, storeId, availabilityMode, isActive]
    );
    return rows[0];
  },
  async replaceComponents(client, menuItemId, components) {
    await client.query(`DELETE FROM recipe_components WHERE menu_item_id=$1`, [menuItemId]);
    for (const c of components) {
      await client.query(
        `INSERT INTO recipe_components (menu_item_id, item_id, quantity, uom)
         VALUES ($1,$2,$3,$4)`,
        [menuItemId, c.itemId, c.quantity, c.uom || 'pcs']
      );
    }
  },
  async getHeader(db, menuItemId) {
    const { rows } = await db.query(`SELECT * FROM menu_recipes WHERE menu_item_id=$1`, [menuItemId]);
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
              (SELECT COUNT(*) FROM recipe_components rc WHERE rc.menu_item_id=mr.menu_item_id) AS component_count
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
