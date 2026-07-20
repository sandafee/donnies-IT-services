const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const db = require('./database');
const swaggerSpec = require('./swagger');

const app = express();
const PORT = process.env.PORT || 8080;

// Security: Cyber Attack Prevention Headers Middleware
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self' http://localhost:* https://*; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*; style-src 'self' 'unsafe-inline' https://*; img-src 'self' data: http://localhost:* https://*;");
  next();
});

// Security: Rate Limiting to prevent brute force / DDoS on key endpoints
const rateLimitMap = new Map();
function apiRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const windowMs = 60000; // 1 minute window
  const maxRequests = 60; // Allow max 60 requests/min
  
  if (!rateLimitMap.has(ip)) {
    rateLimitMap.set(ip, []);
  }
  
  const requests = rateLimitMap.get(ip).filter(timestamp => now - timestamp < windowMs);
  requests.push(now);
  rateLimitMap.set(ip, requests);
  
  if (requests.length > maxRequests) {
    return res.status(429).json({ error: 'Too many requests. Please retry in a minute.' });
  }
  next();
}

app.use(cors());
// Set JSON limit to 10MB for base64 image uploads
app.use(express.json({ limit: '10mb' }));

// Apply rate limiting middleware to all /api routes
app.use('/api', apiRateLimiter);

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve Swagger UI
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Root route redirects to Swagger documentation
app.get('/', (req, res) => {
  res.redirect('/docs');
});

/**
 * @openapi
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       required:
 *         - name
 *         - description
 *         - price
 *         - category
 *         - image_url
 *         - stock
 *       properties:
 *         id:
 *           type: integer
 *           description: Auto-generated product ID
 *         name:
 *           type: string
 *           description: The product name
 *         description:
 *           type: string
 *           description: Product specifications and narrative
 *         price:
 *           type: number
 *           description: Unit cost of the product in KES
 *         category:
 *           type: string
 *           enum: [Laptops, Phones]
 *           description: The product category
 *         image_url:
 *           type: string
 *           description: Public endpoint path to the product image asset
 *         stock:
 *           type: integer
 *           description: Available stock quantity
 *         created_at:
 *           type: string
 *           format: date-time
 *     Review:
 *       type: object
 *       required:
 *         - reviewer_name
 *         - rating
 *         - comment
 *       properties:
 *         id:
 *           type: integer
 *         product_id:
 *           type: integer
 *         reviewer_name:
 *           type: string
 *         rating:
 *           type: integer
 *           minimum: 1
 *           maximum: 5
 *         comment:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *     OrderInput:
 *       type: object
 *       required:
 *         - customer_name
 *         - customer_email
 *         - customer_phone
 *         - customer_address
 *         - items
 *       properties:
 *         customer_name:
 *           type: string
 *         customer_email:
 *           type: string
 *         customer_phone:
 *           type: string
 *         customer_address:
 *           type: string
 *         coupon_used:
 *           type: string
 *           description: Promo code like 'DONNES10' or 'NAIROBI10'
 *         items:
 *           type: array
 *           items:
 *             type: object
 *             required:
 *               - product_id
 *               - quantity
 *             properties:
 *               product_id:
 *                 type: integer
 *               quantity:
 *                 type: integer
 */

/**
 * @openapi
 * /api/categories:
 *   get:
 *     summary: Retrieve category names
 *     description: Returns a list of all active categories in the database.
 *     responses:
 *       200:
 *         description: Success
 */
app.get('/api/categories', (req, res) => {
  db.all('SELECT * FROM categories ORDER BY name ASC', [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

/**
 * @openapi
 * /api/categories:
 *   post:
 *     summary: Add new category
 *     description: Registers a new product category in the system.
 */
app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Category name is required.' });
  
  db.run('INSERT INTO categories (name) VALUES (?)', [name.trim()], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Category already exists.' });
      }
      return res.status(500).json({ error: err.message });
    }
    res.status(201).json({ id: this.lastID, name: name.trim() });
  });
});

/**
 * @openapi
 * /api/categories/{id}:
 *   delete:
 *     summary: Delete category
 *     description: Deletes an existing category by ID.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 */
app.delete('/api/categories/:id', (req, res) => {
  const { id } = req.params;
  db.run('DELETE FROM categories WHERE id = ?', [id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ message: 'Category deleted successfully.' });
  });
});

/**
 * @openapi
 * /api/upload:
 *   post:
 *     summary: Upload Base64 Image
 *     description: Uploads product image files directly as base64 string.
 */
app.post('/api/upload', (req, res) => {
  const { filename, base64Data } = req.body;
  if (!filename || !base64Data) {
    return res.status(400).json({ error: 'Missing filename or base64Data' });
  }

  try {
    const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(cleanBase64, 'base64');
    
    const uploadDir = path.join(__dirname, 'public', 'images', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const safeFilename = Date.now() + '_' + path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, '');
    const destPath = path.join(uploadDir, safeFilename);
    
    fs.writeFileSync(destPath, buffer);
    res.status(201).json({ image_url: `/images/uploads/${safeFilename}` });
  } catch (err) {
    res.status(500).json({ error: `Upload error: ${err.message}` });
  }
});

app.get('/api/products', (req, res) => {
  const { category, search } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];

  if (category) {
    sql += ' AND category = ?';
    params.push(category);
  }

  if (search) {
    sql += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.json(rows);
  });
});

app.get('/api/products/:id', (req, res) => {
  db.get('SELECT * FROM products WHERE id = ?', [req.params.id], (err, product) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.all('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [product.id], (err, reviews) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      product.reviews = reviews || [];
      res.json(product);
    });
  });
});

app.post('/api/products', (req, res) => {
  const { name, description, price, category, image_url, stock, contact_phone } = req.body;
  if (!name || !description || price === undefined || !category || !image_url || stock === undefined) {
    return res.status(400).json({ error: 'Missing required product fields.' });
  }

  const phone = contact_phone || '+254 712 345678';

  db.run(
    'INSERT INTO products (name, description, price, category, image_url, stock, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, description, price, category, image_url, stock, phone],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, name, description, price, category, image_url, stock, contact_phone: phone });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const { name, description, price, category, image_url, stock, contact_phone } = req.body;
  if (!name || !description || price === undefined || !category || !image_url || stock === undefined) {
    return res.status(400).json({ error: 'Missing required product fields for update.' });
  }

  const phone = contact_phone || '+254 712 345678';

  db.run(
    'UPDATE products SET name = ?, description = ?, price = ?, category = ?, image_url = ?, stock = ?, contact_phone = ? WHERE id = ?',
    [name, description, price, category, image_url, stock, phone, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }
      res.json({ message: 'Product updated successfully', id: req.params.id });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  db.run('DELETE FROM products WHERE id = ?', [req.params.id], function (err) {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ message: 'Product deleted successfully' });
  });
});

/**
 * @openapi
 * /api/products/{id}/reviews:
 *   post:
 *     summary: Add product review
 *     description: Enables consumers to submit ratings and reviews.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Review'
 *     responses:
 *       201:
 *         description: Review submitted successfully
 */
app.post('/api/products/:id/reviews', (req, res) => {
  const { reviewer_name, rating, comment } = req.body;
  const productId = req.params.id;

  if (!reviewer_name || rating === undefined || !comment) {
    return res.status(400).json({ error: 'Missing reviewer name, rating or comment.' });
  }

  db.run(
    'INSERT INTO reviews (product_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)',
    [productId, reviewer_name, rating, comment],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      res.status(201).json({ id: this.lastID, product_id: productId, reviewer_name, rating, comment });
    }
  );
});

/**
 * @openapi
 * /api/orders:
 *   post:
 *     summary: Place a new order
 *     description: Submits items to cart, checks stock limits, applies discount coupon, and processes order details.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/OrderInput'
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Insufficient stock or invalid items
 */
app.post('/api/orders', (req, res) => {
  const { customer_name, customer_email, customer_phone, customer_address, items, coupon_used } = req.body;

  if (!customer_name || !customer_email || !customer_phone || !customer_address || !items || !items.length) {
    return res.status(400).json({ error: 'Missing customer details or order items.' });
  }

  // Sequential validations: Fetch all products ordered to verify price & stock
  const productIds = items.map(i => i.product_id);
  const placeholders = productIds.map(() => '?').join(',');

  db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds, (err, dbProducts) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    const productsMap = {};
    dbProducts.forEach(p => {
      productsMap[p.id] = p;
    });

    // Verify stock availability
    let subtotal = 0;
    for (let i = 0; i < items.length; i++) {
      const orderItem = items[i];
      const dbProd = productsMap[orderItem.product_id];
      if (!dbProd) {
        return res.status(400).json({ error: `Product ID ${orderItem.product_id} not found.` });
      }
      if (dbProd.stock < orderItem.quantity) {
        return res.status(400).json({ error: `Insufficient stock for product: ${dbProd.name}. Available: ${dbProd.stock}` });
      }
      subtotal += dbProd.price * orderItem.quantity;
    }

    // Apply Coupon Code
    let discount = 0;
    if (coupon_used === 'DONNES10' || coupon_used === 'NAIROBI10') {
      discount = subtotal * 0.1; // 10% discount
    }
    const finalAmount = subtotal - discount;

    // Serialize database writes
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run(
        'INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, total_amount, discount_amount, coupon_used, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [customer_name, customer_email, customer_phone, customer_address, finalAmount, discount, coupon_used, 'Pending'],
        function (err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: err.message });
          }

          const orderId = this.lastID;
          let insertErrors = false;

          const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
          const stockUpdateStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

          items.forEach(item => {
            const dbProd = productsMap[item.product_id];
            stmt.run(orderId, item.product_id, item.quantity, dbProd.price, (err) => {
              if (err) insertErrors = true;
            });
            stockUpdateStmt.run(item.quantity, item.product_id, (err) => {
              if (err) insertErrors = true;
            });
          });

          stmt.finalize();
          stockUpdateStmt.finalize();

          db.run('COMMIT', (err) => {
            if (err || insertErrors) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to commit transaction.' });
            }

            res.status(201).json({
              message: 'Order placed successfully',
              order_id: orderId,
              total_amount: finalAmount,
              discount_amount: discount,
              status: 'Pending'
            });
          });
        }
      );
    });
  });
});

/**
 * @openapi
 * /api/orders:
 *   get:
 *     summary: Retrieve list of orders
 *     description: Returns all orders with list of ordered items (Admin dashboard).
 *     responses:
 *       200:
 *         description: List of orders retrieved successfully
 */
app.get('/api/orders', (req, res) => {
  db.all('SELECT * FROM orders ORDER BY created_at DESC', [], (err, orders) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }

    if (!orders || orders.length === 0) {
      return res.json([]);
    }

    // Attach items to orders
    db.all(`
      SELECT oi.*, p.name as product_name, p.image_url 
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
    `, [], (err, allItems) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }

      const itemsGroupedByOrder = {};
      allItems.forEach(item => {
        if (!itemsGroupedByOrder[item.order_id]) {
          itemsGroupedByOrder[item.order_id] = [];
        }
        itemsGroupedByOrder[item.order_id].push(item);
      });

      orders.forEach(order => {
        order.items = itemsGroupedByOrder[order.id] || [];
      });

      res.json(orders);
    });
  });
});

/**
 * @openapi
 * /api/orders/{id}:
 *   get:
 *     summary: Retrieve single order details
 *     description: Returns status and detail of an order (Customer tracking / Admin invoice).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Order found
 *       404:
 *         description: Order not found
 */
app.get('/api/orders/:id', (req, res) => {
  db.get('SELECT * FROM orders WHERE id = ?', [req.params.id], (err, order) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    db.all(`
      SELECT oi.*, p.name as product_name, p.image_url 
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [order.id], (err, items) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      order.items = items || [];
      res.json(order);
    });
  });
});

/**
 * @openapi
 * /api/orders/{id}/status:
 *   put:
 *     summary: Update order status
 *     description: Modifies status of a customer order (Admin control).
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [Pending, Processing, Shipped, Delivered, Cancelled]
 *     responses:
 *       200:
 *         description: Order status updated successfully
 */
app.put('/api/orders/:id/status', (req, res) => {
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ error: 'Missing status.' });
  }

  db.run(
    'UPDATE orders SET status = ? WHERE id = ?',
    [status, req.params.id],
    function (err) {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (this.changes === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json({ message: 'Order status updated successfully', id: req.params.id, status });
    }
  );
});

/**
 * @openapi
 * /api/dashboard/stats:
 *   get:
 *     summary: Fetch Admin Dashboard statistics
 *     description: Aggregates sales figures, order counts, stock alerts, and recent sales trends for charting.
 *     responses:
 *       200:
 *         description: Stats fetched successfully
 */
app.get('/api/dashboard/stats', (req, res) => {
  const stats = {
    totalSales: 0,
    totalOrders: 0,
    outOfStockCount: 0,
    lowStockCount: 0,
    salesByDay: []
  };

  // Queries sequence
  db.get("SELECT SUM(total_amount) as sales, COUNT(*) as orders FROM orders WHERE status != 'Cancelled'", (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    stats.totalSales = row.sales || 0;
    stats.totalOrders = row.orders || 0;

    db.get("SELECT COUNT(*) as outCount FROM products WHERE stock = 0", (err, outRow) => {
      if (err) return res.status(500).json({ error: err.message });
      stats.outOfStockCount = outRow.outCount || 0;

      db.get("SELECT COUNT(*) as lowCount FROM products WHERE stock > 0 AND stock <= 3", (err, lowRow) => {
        if (err) return res.status(500).json({ error: err.message });
        stats.lowStockCount = lowRow.lowCount || 0;

        // Fetch sales trends for last 7 active days
        db.all(`
          SELECT strftime('%Y-%m-%d', created_at) as date, SUM(total_amount) as sales, COUNT(*) as count 
          FROM orders 
          WHERE status != 'Cancelled' 
          GROUP BY date 
          ORDER BY date ASC 
          LIMIT 7
        `, (err, chartRows) => {
          if (err) return res.status(500).json({ error: err.message });
          stats.salesByDay = chartRows || [];
          res.json(stats);
        });
      });
    });
  });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Swagger documentation available at http://localhost:${PORT}/docs`);
});
