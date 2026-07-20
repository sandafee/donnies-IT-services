const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Determine database storage path
const dbDir = '/data';
let dbPath = path.join(__dirname, 'nairobi.db');
if (fs.existsSync(dbDir) || process.env.NODE_ENV === 'production') {
  dbPath = '/data/nairobi.db';
  const parentDir = path.dirname(dbPath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }
}

console.log(`Connecting to database at: ${dbPath}`);
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Create Products Table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT NOT NULL,
      image_url TEXT NOT NULL,
      stock INTEGER NOT NULL,
      contact_phone TEXT DEFAULT '+254 712 345678',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Migrate older db schemas to include contact_phone
  db.run("ALTER TABLE products ADD COLUMN contact_phone TEXT DEFAULT '+254 712 345678'", (err) => {
    // ignore error if column already exists
  });

  // 1b. Create Categories Table
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL
    )
  `);

  // Seed categories
  db.get("SELECT COUNT(*) as count FROM categories", (err, row) => {
    if (!err && row.count === 0) {
      console.log("Seeding initial product categories...");
      const initialCats = ['Laptops', 'CCTV', 'Desktop for Gaming', 'Play Station'];
      const stmt = db.prepare("INSERT INTO categories (name) VALUES (?)");
      initialCats.forEach(cat => {
        stmt.run(cat);
      });
      stmt.finalize();
    }
  });

  // 2. Create Orders Table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      customer_address TEXT NOT NULL,
      total_amount REAL NOT NULL,
      discount_amount REAL DEFAULT 0,
      coupon_used TEXT,
      status TEXT DEFAULT 'Pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Create Order Items Table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // 4. Create Reviews Table
  db.run(`
    CREATE TABLE IF NOT EXISTS reviews (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL,
      reviewer_name TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
    )
  `);

  // Seed data if products table is empty
  db.get("SELECT COUNT(*) as count FROM products", (err, row) => {
    if (err) {
      console.error("Failed to query products count:", err);
      return;
    }
    if (row.count === 0) {
      console.log("Seeding database with premium tech categories...");
      
      const seedProducts = [
        {
          name: "Apple MacBook Pro 16\"",
          description: "Equipped with the Apple M3 Max chip, 36GB unified memory, and 1TB SSD. Featuring a gorgeous 16.2-inch Liquid Retina XDR display. The space black finish gives it a sleek and sophisticated look. Built for developers, creators, and professionals demanding ultimate power.",
          price: 450000,
          category: "Laptops",
          image_url: "/images/macbook_pro.png",
          stock: 8
        },
        {
          name: "ASUS ROG Zephyrus G14",
          description: "Compact gaming beast with AMD Ryzen 9 processor, NVIDIA GeForce RTX 4070, 16GB DDR5 RAM, and 1TB SSD. Features the AniMe Matrix LED display on the lid and a vivid 120Hz Nebula display. Highly portable power for gamers and creators on the move.",
          price: 320000,
          category: "Laptops",
          image_url: "/images/gaming_laptop.png",
          stock: 5
        },
        {
          name: "Lenovo ThinkPad X1 Carbon",
          description: "The gold standard for enterprise. Powered by Intel Core i7, 32GB RAM, and 1TB SSD. Constructed with lightweight carbon fiber, featuring a signature tactile keyboard, robust security features, and exceptional battery life.",
          price: 280000,
          category: "Laptops",
          image_url: "/images/macbook_pro.png",
          stock: 12
        },
        {
          name: "Hikvision Smart Dome IP Camera",
          description: "4MP Outdoor smart security CCTV camera with darkfighter technology for premium night vision, smart intrusion detection, IP67 weatherproof housing, and built-in microphone.",
          price: 15000,
          category: "CCTV",
          image_url: "/images/cctv.png",
          stock: 25
        },
        {
          name: "Dahua 4-Camera Security Pack",
          description: "Ultra HD Dahua CCTV surveillance system including 4 outdoor bullet cameras, a 4-channel NVR with 1TB pre-installed hard drive, mobile tracking integration, and motion alert detection.",
          price: 45000,
          category: "CCTV",
          image_url: "/images/cctv.png",
          stock: 10
        },
        {
          name: "DONNES Vanguard RTX 4090 Monster",
          description: "Custom-built gaming desktop featuring the flagship NVIDIA RTX 4090 24GB GPU, Intel Core i9-14900K, 64GB DDR5 RGB RAM, 2TB NVMe SSD, and custom neon blue loop liquid cooling in a dual-chamber panoramic glass chassis.",
          price: 420000,
          category: "Desktop for Gaming",
          image_url: "/images/gaming_desktop.png",
          stock: 3
        },
        {
          name: "HP Omen Liquid-Cooled Battlebox",
          description: "HP Omen high-performance gaming PC with AMD Ryzen 7, RTX 4070 Ti, 32GB RAM, 1TB SSD, advanced RGB liquid CPU cooler, and elegant tempered glass design.",
          price: 260000,
          category: "Desktop for Gaming",
          image_url: "/images/gaming_desktop.png",
          stock: 6
        },
        {
          name: "Sony PlayStation 5 Pro Console",
          description: "Sony's ultimate high-fidelity console. 2TB SSD storage, advanced ray tracing performance, custom AI-driven resolution scaling (PSSR), and dualsense wireless controller package.",
          price: 120000,
          category: "Play Station",
          image_url: "/images/playstation.png",
          stock: 8
        },
        {
          name: "Sony PlayStation 5 Slim Console",
          description: "Sleek, lightweight PS5 Slim model with 1TB SSD storage, immersive 3D audio, haptic feedback controller, and ultra-high-speed disk drive interface.",
          price: 85000,
          category: "Play Station",
          image_url: "/images/playstation.png",
          stock: 14
        }
      ];

      const stmt = db.prepare("INSERT INTO products (name, description, price, category, image_url, stock) VALUES (?, ?, ?, ?, ?, ?)");
      seedProducts.forEach((p, idx) => {
        stmt.run(p.name, p.description, p.price, p.category, p.image_url, p.stock, function(err) {
          if (err) {
            console.error("Error seeding product:", err);
            return;
          }
          // Seed some reviews for each product
          const productId = this.lastID;
          const reviewStmt = db.prepare("INSERT INTO reviews (product_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)");
          reviewStmt.run(productId, "Kimani N.", 5, "Absolutely stellar performance. Exceeded all expectations!");
          reviewStmt.run(productId, "Achieng O.", 4, "Premium build quality and very fast delivery by DONNES I.T SERVICES.");
          reviewStmt.finalize();
        });
      });
      stmt.finalize();
      console.log("Seeding complete!");
    } else {
      console.log("Products table already seeded.");
    }
  });
});

module.exports = db;
