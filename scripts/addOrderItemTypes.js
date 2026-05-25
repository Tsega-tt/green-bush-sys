const { Pool } = require('pg');
require('dotenv').config();

const addOrderItemTypes = async () => {
  const requiredEnvVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
  const missingEnvVars = requiredEnvVars.filter((k) => !process.env[k]);
  if (missingEnvVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
  }

  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: String(process.env.DB_PASSWORD),
  });
  
  const client = await pool.connect();
  
  try {
    console.log('🔄 Adding item_type column to order_items table...');

    // Add item_type column to order_items table
    await client.query(`
      ALTER TABLE order_items 
      ADD COLUMN IF NOT EXISTS item_type VARCHAR(20) DEFAULT 'food'
    `);

    console.log('✅ item_type column added successfully!');

    // Update existing order items to categorize them
    console.log('🔄 Categorizing existing order items...');

    // Define beverage categories for classification
    const beverageCategories = [
      'coffee', 'beverages', 'drinks', 'tea', 'espresso', 
      'cappuccino', 'latte', 'americano', 'cold drinks',
      'hot drinks', 'iced coffee', 'frappuccino', 'smoothie',
      'juice', 'soda', 'water'
    ];

    // Update existing items based on menu item categories and names
    for (const bevCat of beverageCategories) {
      await client.query(`
        UPDATE order_items 
        SET item_type = 'beverage'
        FROM menu_items mi
        WHERE order_items.menu_item_id = mi.id
        AND (
          LOWER(mi.category) LIKE $1 
          OR LOWER(mi.name) LIKE $1
        )
      `, [`%${bevCat}%`]);
    }

    // Get count of updated items
    const beverageCount = await client.query(`
      SELECT COUNT(*) as count 
      FROM order_items 
      WHERE item_type = 'beverage'
    `);

    const foodCount = await client.query(`
      SELECT COUNT(*) as count 
      FROM order_items 
      WHERE item_type = 'food'
    `);

    console.log(`✅ Categorization completed!`);
    console.log(`📊 Beverage items: ${beverageCount.rows[0].count}`);
    console.log(`📊 Food items: ${foodCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error adding order item types:', error);
    throw error;
  } finally {
    client.release();
    pool.end();
  }
};

const runMigration = async () => {
  try {
    await addOrderItemTypes();
    console.log('🎉 Order item types migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('💥 Migration failed:', error);
    process.exit(1);
  }
};

// Run if called directly
if (require.main === module) {
  runMigration();
}

module.exports = addOrderItemTypes;
