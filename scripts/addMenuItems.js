const db = require('../config/database');

const menuItems = [
  // Snacks Category
  {
    name: 'Duplex Burger',
    description: 'Two pieces of beef patty grilled, egg, cheese, and house dressing served with fries.',
    price: 440.00,
    category: 'snacks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop'
  },
  {
    name: 'Steak and Cheese Sandwich',
    description: 'Fillet steak grilled with sauteed onion, bell pepper, soy sauce, mushroom, and olives topped with cheese.',
    price: 390.00,
    category: 'snacks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1553909489-cd47e0ef937f?w=400&h=300&fit=crop'
  },
  {
    name: 'BBQ Burger',
    description: 'Tasty beef grilled with BBQ sauce, cheese, and house dressing served with fries.',
    price: 395.00,
    category: 'snacks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1571091718767-18b5b1457add?w=400&h=300&fit=crop'
  },
  {
    name: 'Club Sandwich',
    description: 'Boiled seasoning chicken, beef, lettuce, tomato, beef/chicken mortadella, cheese, boiled egg served with fries.',
    price: 420.00,
    category: 'snacks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1567234669003-dce7a7a88821?w=400&h=300&fit=crop'
  },
  {
    name: 'Tuna Sandwich',
    description: 'Tuna sauteed with onion, garlic, tomato and green pepper served with fries.',
    price: 315.00,
    category: 'snacks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1509722747041-616f39b57569?w=400&h=300&fit=crop'
  },
  {
    name: 'Vegetable Sandwich',
    description: 'Selection of fresh vegetables served with fries.',
    price: 245.00,
    category: 'snacks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400&h=300&fit=crop'
  },

  // Pizza Corner Category
  {
    name: 'Signature 1 (Beef Pizza)',
    description: 'Selection of red meats (beef fillet, beef sausage, beef mortadella), napolitana sauce, grilled mushroom, onion, oregano, olives, green pepper, and mozzarella cheese.',
    price: 540.00,
    category: 'pizza',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1513104890138-7c749659a591?w=400&h=300&fit=crop'
  },
  {
    name: 'Signature 2 (Tuna Pizza)',
    description: 'Napolitana sauce, olives, mushroom, tuna onion, tomato, oregano, fish, and mozzarella cheese.',
    price: 520.00,
    category: 'pizza',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1571407970349-bc81e7e96d47?w=400&h=300&fit=crop'
  },
  {
    name: 'Signature 3 (Chicken Pizza)',
    description: 'Selection of white meats (grilled chicken, chicken sausage, chicken mortadella), mushroom, olives, onion, green pepper, oregano, cream sauce, and mozzarella cheese.',
    price: 530.00,
    category: 'pizza',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1565299624946-b28f40a0ca4b?w=400&h=300&fit=crop'
  },
  {
    name: 'Addissinia Pizza',
    description: 'Pizza sauce, mozzarella cheese, mushroom, black olive, beef, and tuna.',
    price: 500.00,
    category: 'pizza',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1574071318508-1cdbab80d002?w=400&h=300&fit=crop'
  },
  {
    name: 'Margherita Pizza',
    description: 'Tomato sauce, mozzarella cheese, basil, oregano, and olives.',
    price: 470.00,
    category: 'pizza',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1604382354936-07c5d9983bd3?w=400&h=300&fit=crop'
  },
  {
    name: 'Vegetable Pizza',
    description: 'Tomato sauce with a variety of vegetables, black pepper, oregano.',
    price: 350.00,
    category: 'pizza',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1593560708920-61dd98c46a4e?w=400&h=300&fit=crop'
  },

  // Hot Drinks Category
  {
    name: 'Coffee',
    description: 'Traditional Ethiopian coffee, freshly brewed.',
    price: 50.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=400&h=300&fit=crop'
  },
  {
    name: 'Coffee with Tea',
    description: 'Coffee blended with tea for a unique flavor.',
    price: 55.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&h=300&fit=crop'
  },
  {
    name: 'Espresso',
    description: 'Strong, concentrated coffee shot.',
    price: 40.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1510707577719-ae7c14805e3a?w=400&h=300&fit=crop'
  },
  {
    name: 'Coffee with Milk',
    description: 'Smooth coffee with steamed milk.',
    price: 65.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1461023058943-07fcbe16d735?w=400&h=300&fit=crop'
  },
  {
    name: 'Cappuccino',
    description: 'Espresso with steamed milk and foam.',
    price: 70.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1534778101976-62847782c213?w=400&h=300&fit=crop'
  },
  {
    name: 'Tea',
    description: 'Traditional tea blend.',
    price: 40.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400&h=300&fit=crop'
  },
  {
    name: 'Macchiato',
    description: 'Espresso with a dollop of steamed milk.',
    price: 65.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1517701604599-bb29b565090c?w=400&h=300&fit=crop'
  },
  {
    name: 'Ginger Tea',
    description: 'Warming ginger tea with spices.',
    price: 40.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1597318181409-cf64d0b3754d?w=400&h=300&fit=crop'
  },
  {
    name: 'Fasting Macchiato',
    description: 'Dairy-free macchiato for fasting periods.',
    price: 65.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1559056199-641a0ac8b55e?w=400&h=300&fit=crop'
  },
  {
    name: 'Special Tea',
    description: 'Premium tea blend with special ingredients.',
    price: 85.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&h=300&fit=crop'
  },
  {
    name: 'Double Macchiato',
    description: 'Double shot macchiato for extra strength.',
    price: 85.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1572442388796-11668a67e53d?w=400&h=300&fit=crop'
  },
  {
    name: 'Milk',
    description: 'Fresh steamed milk.',
    price: 65.00,
    category: 'hot_drinks',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1550583724-b2692b85b150?w=400&h=300&fit=crop'
  },

  // Juice Corner Category
  {
    name: 'Papaya Juice',
    description: 'Fresh papaya juice, naturally sweet.',
    price: 110.00,
    category: 'juices',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1610970881699-44a5587cabec?w=400&h=300&fit=crop'
  },
  {
    name: 'Avocado Juice',
    description: 'Creamy avocado juice, rich and nutritious.',
    price: 110.00,
    category: 'juices',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1623065422902-30a2d299bbe4?w=400&h=300&fit=crop'
  },
  {
    name: 'Orange Juice',
    description: 'Freshly squeezed orange juice, vitamin C rich.',
    price: 150.00,
    category: 'juices',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1621506289937-a8e4df240d0b?w=400&h=300&fit=crop'
  },
  {
    name: 'Mango Juice',
    description: 'Tropical mango juice, sweet and refreshing.',
    price: 125.00,
    category: 'juices',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1605027990121-3b2c6c16b5fb?w=400&h=300&fit=crop'
  },
  {
    name: 'Watermelon Juice',
    description: 'Refreshing watermelon juice, perfect for hot days.',
    price: 110.00,
    category: 'juices',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400&h=300&fit=crop'
  },
  {
    name: 'Mixed Juice',
    description: 'Blend of seasonal fruits, refreshing and healthy.',
    price: 130.00,
    category: 'juices',
    type: 'cafe',
    is_available: true,
    image_url: 'https://images.unsplash.com/photo-1570197788417-0e82375c9371?w=400&h=300&fit=crop'
  }
];

async function addMenuItems() {
  try {
    console.log('Starting to add menu items...');
    
    for (const item of menuItems) {
      const query = `
        INSERT INTO menu_items (name, description, price, category, type, is_available, image_url, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, name
      `;
      
      const result = await db.query(query, [
        item.name,
        item.description,
        item.price,
        item.category,
        item.type,
        item.is_available,
        item.image_url
      ]);
      
      console.log(`✅ Added: ${result.rows[0].name} (ID: ${result.rows[0].id})`);
    }
    
    console.log(`\n🎉 Successfully added ${menuItems.length} menu items!`);
    console.log('\nCategories added:');
    console.log('- Snacks (6 items)');
    console.log('- Pizza (6 items)');
    console.log('- Hot Drinks (12 items)');
    console.log('- Juices (6 items)');
    
  } catch (error) {
    console.error('❌ Error adding menu items:', error);
  } finally {
    process.exit();
  }
}

// Run the script
addMenuItems();
