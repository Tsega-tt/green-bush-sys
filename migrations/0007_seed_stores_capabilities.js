'use strict';

/**
 * Seed the 9 Green Bush Garden stores and their capabilities as DATA.
 * Adding/altering a store later is an INSERT/UPDATE — no code change.
 * Idempotent: re-running is safe.
 */
exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    INSERT INTO stores (code, name, description, icon) VALUES
      ('main_store',     'Main Store',            'Meat, fish, chicken, frozen & refrigerated', '🥩'),
      ('mini_store',     'Mini Store',            'Salt, spices, dry ingredients, consumables', '🧂'),
      ('barman_store',   'Barman Store',          'Spirits, liquor, wine, alcohol',             '🍸'),
      ('bar_store',      'Bar Store',             'Bottled & soft drinks, alcoholic beverages', '🍷'),
      ('pizza_burger',   'Pizza & Burger Store',  'Pizza & burger production',                  '🍕'),
      ('juice_store',    'Juice Store',           'Juice & smoothie production',                '🧃'),
      ('kitfo_store',    'Kitfo Store',           'Kitfo & traditional food preparation',       '🍖'),
      ('draft_george',   'Draft St. George Store','Draft St. George kegs',                      '🍺'),
      ('draft_heineken', 'Draft Heineken Store',  'Draft Heineken kegs',                        '🍺')
    ON CONFLICT (code) DO NOTHING;

    -- capability rows (store_code, capability_key)
    WITH caps(store_code, capability_key) AS (
      VALUES
        ('main_store','can_purchase_directly'),('main_store','can_transfer'),('main_store','tracks_expiry'),
        ('mini_store','can_purchase_directly'),('mini_store','can_transfer'),
        ('barman_store','can_purchase_directly'),('barman_store','can_transfer'),('barman_store','can_sell'),
        ('bar_store','can_purchase_directly'),('bar_store','can_transfer'),('bar_store','can_sell'),
        ('pizza_burger','can_transfer'),('pizza_burger','requires_recipe_consumption'),('pizza_burger','requires_fnb_approval'),
        ('juice_store','can_purchase_directly'),('juice_store','can_transfer'),('juice_store','requires_recipe_consumption'),
        ('kitfo_store','can_transfer'),('kitfo_store','requires_recipe_consumption'),
        ('draft_george','can_purchase_directly'),('draft_george','can_transfer'),('draft_george','can_sell'),('draft_george','requires_keg_tracking'),
        ('draft_heineken','can_purchase_directly'),('draft_heineken','can_transfer'),('draft_heineken','can_sell'),('draft_heineken','requires_keg_tracking')
    )
    INSERT INTO store_capabilities (store_id, capability_key, enabled)
    SELECT s.id, caps.capability_key, true
      FROM caps JOIN stores s ON s.code = caps.store_code
    ON CONFLICT (store_id, capability_key) DO NOTHING;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DELETE FROM store_capabilities WHERE store_id IN (
      SELECT id FROM stores WHERE code IN
        ('main_store','mini_store','barman_store','bar_store','pizza_burger',
         'juice_store','kitfo_store','draft_george','draft_heineken')
    );
    DELETE FROM stores WHERE code IN
      ('main_store','mini_store','barman_store','bar_store','pizza_burger',
       'juice_store','kitfo_store','draft_george','draft_heineken');
  `);
};
