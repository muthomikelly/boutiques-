const path = require('path');
const bcrypt = require('bcrypt');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { initDb, getDb } = require('./db/init');

const products = [
  {
    name: 'Classic White Tee',
    description: 'Soft cotton tee for everyday styling.',
    price: 24.99,
    stock: 50,
    category: 'Women',
    item_type: 'Shirt',
    sizes: 'XS, S, M, L, XL',
    colors: 'White, Black, Pink',
    image_url: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=600&q=80',
  },
  {
    name: 'Floral Summer Dress',
    description: 'Light floral dress for warm days and evenings out.',
    price: 49.99,
    stock: 20,
    category: 'Women',
    item_type: 'Dress',
    sizes: 'XS, S, M, L, XL',
    colors: 'Pink, Red, White',
    image_url: 'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=600&q=80',
  },
  {
    name: 'Leather Handbag',
    description: 'Structured handbag with practical compartments.',
    price: 89.99,
    stock: 15,
    category: 'Women',
    item_type: 'Bag',
    sizes: null,
    colors: 'Black, Brown, Gold',
    image_url: 'https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=600&q=80',
  },
  {
    name: "Men's Slim Fit Jeans",
    description: 'Classic blue denim with a modern slim fit.',
    price: 59.99,
    stock: 30,
    category: 'Men',
    item_type: 'Pants',
    sizes: '28, 30, 32, 34, 36, 38',
    colors: 'Blue, Navy, Black',
    image_url: 'https://images.unsplash.com/photo-1542272604-787c3835535d?w=600&q=80',
  },
  {
    name: "Men's Polo Shirt",
    description: 'Premium polo shirt for clean smart-casual looks.',
    price: 34.99,
    stock: 45,
    category: 'Men',
    item_type: 'Shirt',
    sizes: 'S, M, L, XL, XXL',
    colors: 'White, Navy, Grey',
    image_url: 'https://images.unsplash.com/photo-1586363104862-3a5e2ab60d99?w=600&q=80',
  },
  {
    name: "Men's Oxford Shoes",
    description: 'Polished oxford shoes for work and formal occasions.',
    price: 89.99,
    stock: 15,
    category: 'Men',
    item_type: 'Shoes',
    sizes: '39, 40, 41, 42, 43, 44, 45',
    colors: 'Black, Brown',
    image_url: 'https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?w=600&q=80',
  },
  {
    name: 'Kids Denim Overalls',
    description: 'Durable denim overalls for everyday play.',
    price: 29.99,
    stock: 35,
    category: 'Kids',
    item_type: 'Outfit',
    sizes: '2Y, 3Y, 4Y, 5Y, 6Y, 7Y, 8Y',
    colors: 'Blue, Navy',
    image_url: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=600&q=80',
  },
  {
    name: 'Kids Sneakers',
    description: 'Comfortable sneakers with a bright non-slip sole.',
    price: 34.99,
    stock: 40,
    category: 'Kids',
    item_type: 'Shoes',
    sizes: '25, 26, 27, 28, 29, 30, 31, 32',
    colors: 'Blue, Pink, Yellow',
    image_url: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=600&q=80',
  },
  {
    name: 'Matte Lipstick Set',
    description: 'Six long-lasting matte shades for day and evening looks.',
    price: 29.99,
    stock: 60,
    category: 'Cosmetics',
    item_type: 'Lipstick',
    sizes: null,
    colors: 'Nude, Red, Pink, Berry',
    image_url: 'https://images.unsplash.com/photo-1586495777744-4e6232bf2f9a?w=600&q=80',
  },
  {
    name: 'Skincare Gift Set',
    description: 'Cleanser, toner, serum and moisturizer for a simple routine.',
    price: 59.99,
    stock: 20,
    category: 'Cosmetics',
    item_type: 'Skincare',
    sizes: null,
    colors: null,
    image_url: 'https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&q=80',
  },
];

async function seed() {
  await initDb();
  const db = getDb();

  const adminPassword = await bcrypt.hash('admin123', 12);
  const customerPassword = await bcrypt.hash('customer123', 12);

  const reset = db.transaction(() => {
    db.exec('PRAGMA foreign_keys = OFF');
    db.exec('DELETE FROM chat_messages');
    db.exec('DELETE FROM order_items');
    db.exec('DELETE FROM orders');
    db.exec('DELETE FROM products');
    db.exec('DELETE FROM users');
    db.exec("DELETE FROM sqlite_sequence WHERE name IN ('chat_messages', 'order_items', 'orders', 'products', 'users')");
    db.exec('PRAGMA foreign_keys = ON');
  });
  reset();

  const insertUser = db.prepare(
    'INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)'
  );
  insertUser.run('Admin User', 'admin@luxeboutique.com', adminPassword, 'admin');
  insertUser.run('Demo Customer', 'customer@example.com', customerPassword, 'customer');

  const insertProduct = db.prepare(
    `INSERT INTO products
      (name, description, price, stock, image_url, category, item_type, sizes, colors)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const product of products) {
    insertProduct.run(
      product.name,
      product.description,
      product.price,
      product.stock,
      product.image_url,
      product.category,
      product.item_type,
      product.sizes,
      product.colors
    );
  }

  console.log(`[seed] Created ${products.length} products.`);
  console.log('[seed] Admin login: admin@luxeboutique.com / admin123');
  console.log('[seed] Customer login: customer@example.com / customer123');
}

seed().catch(err => {
  console.error('[seed] Failed:', err);
  process.exit(1);
});
