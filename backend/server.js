const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const swaggerUi = require('swagger-ui-express');
const db = require('./database');
const swaggerSpec = require('./swagger');

const app = express();
const PORT = process.env.PORT || 8080;

// Security: Cyber Attack Prevention Headers Middleware (Strict)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Content-Security-Policy', "default-src 'self' http://localhost:* http://127.0.0.1:* https://*; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*; style-src 'self' 'unsafe-inline' https://*; img-src 'self' data: http://localhost:* http://127.0.0.1:* https://*; frame-ancestors 'none';");
  next();
});

// Security: Rate Limiting map with automatic cleanup to prevent memory leak DoS
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

// Memory leak protection: clean rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  const windowMs = 60000;
  for (const [ip, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter(timestamp => now - timestamp < windowMs);
    if (valid.length === 0) {
      rateLimitMap.delete(ip);
    } else {
      rateLimitMap.set(ip, valid);
    }
  }
}, 300000);

// Security: Custom CORS Policy to prevent cross-origin abuse
const allowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://[::1]:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
  'http://[::1]:3001'
];
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      return callback(new Error('CORS Policy: Origin not allowed'), false);
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Set JSON limit to 5MB (reduced from 10MB to mitigate payload size DoS)
app.use(express.json({ limit: '5mb' }));

// Apply rate limiting middleware to all /api routes
app.use('/api', apiRateLimiter);

// ─── Cybersecurity Helper Functions ───

// Prevent Information Disclosure by hiding raw database queries/errors
function handleDbError(err, res) {
  console.error('Database query failure:', err);
  return res.status(500).json({ error: 'Internal database error.' });
}

// XSS Sanitizer: strip HTML tags
function sanitizeInput(val) {
  if (typeof val !== 'string') return val;
  return val.replace(/<[^>]*>/g, '').trim();
}

// Email syntax validator (RFC-compliant regex)
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
function isValidEmail(email) {
  return typeof email === 'string' && EMAIL_REGEX.test(email) && email.length <= 150;
}

// Phone format validator (7 to 25 characters, digits, spaces, hyphens, plus sign)
const PHONE_REGEX = /^\+?[0-9\s\-()]{7,25}$/;
function isValidPhone(phone) {
  return typeof phone === 'string' && PHONE_REGEX.test(phone);
}

// Validate base64 image magic byte signatures to prevent unrestricted non-image file uploads
function validateImageSignature(buffer) {
  if (buffer.length < 4) return null;
  // PNG: 89 50 4E 47
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }
  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }
  // GIF: 47 49 46 38 ("GIF8")
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38) {
    return 'image/gif';
  }
  // WebP: RIFF ... WEBP
  if (buffer.length >= 12 &&
      buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
      buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50) {
    return 'image/webp';
  }
  return null;
}

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
    if (err) return handleDbError(err, res);
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
  const rawName = req.body && req.body.name;
  if (!rawName || typeof rawName !== 'string') {
    return res.status(400).json({ error: 'Category name is required.' });
  }
  const name = sanitizeInput(rawName);
  if (name.length < 2 || name.length > 80) {
    return res.status(400).json({ error: 'Category name must be between 2 and 80 characters.' });
  }
  db.run('INSERT INTO categories (name) VALUES (?)', [name], function(err) {
    if (err) {
      if (err.message && err.message.includes('UNIQUE')) {
        return res.status(409).json({ error: 'Category already exists.' });
      }
      return handleDbError(err, res);
    }
    res.status(201).json({ id: this.lastID, name });
  });
});

app.delete('/api/categories/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid category ID.' });
  }
  db.run('DELETE FROM categories WHERE id = ?', [id], function(err) {
    if (err) return handleDbError(err, res);
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Category not found.' });
    }
    res.json({ message: 'Category deleted successfully.' });
  });
});

// Security: Stricter upload rate limiter (max 10 uploads/min per IP)
const uploadRateLimitMap = new Map();
function uploadRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const windowMs = 60000;
  const maxUploads = 10;
  if (!uploadRateLimitMap.has(ip)) uploadRateLimitMap.set(ip, []);
  const timestamps = uploadRateLimitMap.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  uploadRateLimitMap.set(ip, timestamps);
  if (timestamps.length > maxUploads) {
    return res.status(429).json({ error: 'Upload rate limit exceeded. Max 10 uploads per minute.' });
  }
  next();
}

app.post('/api/upload', uploadRateLimiter, (req, res) => {
  const { filename, base64Data } = req.body;
  if (!filename || !base64Data) {
    return res.status(400).json({ error: 'Missing filename or base64Data.' });
  }

  // Sanitize filename: only alphanumeric, dot, dash, underscore — no path traversal
  const rawName = path.basename(String(filename)).replace(/[^a-zA-Z0-9.\-_]/g, '');
  if (!rawName || rawName.length > 120) {
    return res.status(400).json({ error: 'Invalid filename.' });
  }

  try {
    const cleanBase64 = String(base64Data).replace(/^data:image\/\w+;base64,/, '');

    // Enforce maximum decoded size: 4MB
    if (cleanBase64.length > 5592406) {
      return res.status(413).json({ error: 'Image too large. Maximum size is 4MB.' });
    }

    const buffer = Buffer.from(cleanBase64, 'base64');

    // Validate actual image magic bytes — blocks executables, scripts, zip bombs, etc.
    const detectedMime = validateImageSignature(buffer);
    if (!detectedMime) {
      return res.status(415).json({ error: 'Unsupported file type. Only PNG, JPEG, GIF, and WebP images are allowed.' });
    }

    const uploadDir = path.join(__dirname, 'public', 'images', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    // Double-check resolved path stays within uploadDir (path traversal guard)
    const safeFilename = Date.now() + '_' + rawName;
    const destPath = path.join(uploadDir, safeFilename);
    if (!destPath.startsWith(uploadDir)) {
      return res.status(400).json({ error: 'Invalid file path.' });
    }

    fs.writeFileSync(destPath, buffer);
    res.status(201).json({ image_url: `/images/uploads/${safeFilename}` });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'File upload failed.' });
  }
});

app.get('/api/products', (req, res) => {
  // Sanitize and clamp query params
  const category = req.query.category ? sanitizeInput(String(req.query.category)).slice(0, 100) : null;
  const search = req.query.search ? sanitizeInput(String(req.query.search)).slice(0, 200) : null;

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
    if (err) return handleDbError(err, res);
    res.json(rows);
  });
});

app.get('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid product ID.' });

  db.get('SELECT * FROM products WHERE id = ?', [id], (err, product) => {
    if (err) return handleDbError(err, res);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    db.all('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC', [id], (err, reviews) => {
      if (err) return handleDbError(err, res);
      product.reviews = reviews || [];
      res.json(product);
    });
  });
});

app.post('/api/products', (req, res) => {
  let { name, description, price, category, image_url, stock, contact_phone } = req.body;

  if (!name || !description || price === undefined || !category || !image_url || stock === undefined) {
    return res.status(400).json({ error: 'Missing required product fields.' });
  }

  // Sanitize text fields
  name        = sanitizeInput(String(name)).slice(0, 200);
  description = sanitizeInput(String(description)).slice(0, 2000);
  category    = sanitizeInput(String(category)).slice(0, 100);
  image_url   = sanitizeInput(String(image_url)).slice(0, 500);

  // Validate numeric fields
  price = parseFloat(price);
  stock = parseInt(stock, 10);
  if (isNaN(price) || price < 0 || price > 100000000) {
    return res.status(400).json({ error: 'Invalid price value.' });
  }
  if (isNaN(stock) || stock < 0 || stock > 100000) {
    return res.status(400).json({ error: 'Invalid stock value.' });
  }

  const phone = contact_phone ? sanitizeInput(String(contact_phone)).slice(0, 30) : '+254 712 345678';

  db.run(
    'INSERT INTO products (name, description, price, category, image_url, stock, contact_phone) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [name, description, price, category, image_url, stock, phone],
    function (err) {
      if (err) return handleDbError(err, res);
      res.status(201).json({ id: this.lastID, name, description, price, category, image_url, stock, contact_phone: phone });
    }
  );
});

app.put('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid product ID.' });

  let { name, description, price, category, image_url, stock, contact_phone } = req.body;

  if (!name || !description || price === undefined || !category || !image_url || stock === undefined) {
    return res.status(400).json({ error: 'Missing required product fields for update.' });
  }

  name        = sanitizeInput(String(name)).slice(0, 200);
  description = sanitizeInput(String(description)).slice(0, 2000);
  category    = sanitizeInput(String(category)).slice(0, 100);
  image_url   = sanitizeInput(String(image_url)).slice(0, 500);
  price       = parseFloat(price);
  stock       = parseInt(stock, 10);

  if (isNaN(price) || price < 0 || price > 100000000) {
    return res.status(400).json({ error: 'Invalid price value.' });
  }
  if (isNaN(stock) || stock < 0 || stock > 100000) {
    return res.status(400).json({ error: 'Invalid stock value.' });
  }

  const phone = contact_phone ? sanitizeInput(String(contact_phone)).slice(0, 30) : '+254 712 345678';

  db.run(
    'UPDATE products SET name = ?, description = ?, price = ?, category = ?, image_url = ?, stock = ?, contact_phone = ? WHERE id = ?',
    [name, description, price, category, image_url, stock, phone, id],
    function (err) {
      if (err) return handleDbError(err, res);
      if (this.changes === 0) return res.status(404).json({ error: 'Product not found.' });
      res.json({ message: 'Product updated successfully.', id });
    }
  );
});

app.delete('/api/products/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid product ID.' });

  db.run('DELETE FROM products WHERE id = ?', [id], function (err) {
    if (err) return handleDbError(err, res);
    if (this.changes === 0) return res.status(404).json({ error: 'Product not found.' });
    res.json({ message: 'Product deleted successfully.' });
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
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  let { reviewer_name, rating, comment } = req.body;

  if (!reviewer_name || rating === undefined || !comment) {
    return res.status(400).json({ error: 'Missing reviewer name, rating or comment.' });
  }

  // Sanitize strings
  reviewer_name = sanitizeInput(String(reviewer_name)).slice(0, 150);
  comment       = sanitizeInput(String(comment)).slice(0, 2000);

  // Validate rating is 1-5 integer
  rating = parseInt(rating, 10);
  if (isNaN(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'Rating must be an integer between 1 and 5.' });
  }

  // Verify the product actually exists before inserting review
  db.get('SELECT id FROM products WHERE id = ?', [productId], (err, product) => {
    if (err) return handleDbError(err, res);
    if (!product) return res.status(404).json({ error: 'Product not found.' });

    db.run(
      'INSERT INTO reviews (product_id, reviewer_name, rating, comment) VALUES (?, ?, ?, ?)',
      [productId, reviewer_name, rating, comment],
      function (err) {
        if (err) return handleDbError(err, res);
        res.status(201).json({ id: this.lastID, product_id: productId, reviewer_name, rating, comment });
      }
    );
  });
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
// Security: Stricter rate limiter for orders (max 5 orders/minute per IP)
const orderRateLimitMap = new Map();
function orderRateLimiter(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const windowMs = 60000;
  const maxOrders = 5;
  if (!orderRateLimitMap.has(ip)) orderRateLimitMap.set(ip, []);
  const timestamps = orderRateLimitMap.get(ip).filter(t => now - t < windowMs);
  timestamps.push(now);
  orderRateLimitMap.set(ip, timestamps);
  if (timestamps.length > maxOrders) {
    return res.status(429).json({ error: 'Too many order attempts. Please wait before placing another order.' });
  }
  next();
}

app.post('/api/orders', orderRateLimiter, (req, res) => {
  let { customer_name, customer_email, customer_phone, customer_address, items, coupon_used } = req.body;

  if (!customer_name || !customer_email || !customer_phone || !customer_address || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Missing customer details or order items.' });
  }

  // Sanitize and validate customer fields
  customer_name    = sanitizeInput(String(customer_name)).slice(0, 200);
  customer_address = sanitizeInput(String(customer_address)).slice(0, 500);

  if (!isValidEmail(customer_email)) {
    return res.status(400).json({ error: 'Invalid email address.' });
  }
  if (!isValidPhone(customer_phone)) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }

  // Validate coupon — only exact known codes allowed
  const VALID_COUPONS = ['DONNES10', 'NAIROBI10'];
  const validatedCoupon = (typeof coupon_used === 'string' && VALID_COUPONS.includes(coupon_used.toUpperCase()))
    ? coupon_used.toUpperCase()
    : null;

  // Validate item list: max 50 unique items, quantities 1-100
  if (items.length > 50) {
    return res.status(400).json({ error: 'Order cannot contain more than 50 line items.' });
  }
  for (const item of items) {
    const qty = parseInt(item.quantity, 10);
    const pid = parseInt(item.product_id, 10);
    if (isNaN(pid) || pid <= 0) return res.status(400).json({ error: 'Invalid product ID in order items.' });
    if (isNaN(qty) || qty < 1 || qty > 100) return res.status(400).json({ error: 'Item quantity must be between 1 and 100.' });
    item.product_id = pid;
    item.quantity   = qty;
  }

  // Sequential validations: Fetch all products ordered to verify price & stock
  const productIds = items.map(i => i.product_id);
  const placeholders = productIds.map(() => '?').join(',');

  db.all(`SELECT * FROM products WHERE id IN (${placeholders})`, productIds, (err, dbProducts) => {
    if (err) return handleDbError(err, res);

    const productsMap = {};
    dbProducts.forEach(p => { productsMap[p.id] = p; });

    let subtotal = 0;
    for (const orderItem of items) {
      const dbProd = productsMap[orderItem.product_id];
      if (!dbProd) {
        return res.status(400).json({ error: 'One or more products were not found.' });
      }
      if (dbProd.stock < orderItem.quantity) {
        return res.status(400).json({ error: `Insufficient stock for: ${dbProd.name}. Available: ${dbProd.stock}` });
      }
      subtotal += dbProd.price * orderItem.quantity;
    }

    // Apply Coupon
    let discount = 0;
    if (validatedCoupon) {
      discount = subtotal * 0.1;
    }
    const finalAmount = subtotal - discount;

    // Serialize database writes
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');

      db.run(
        'INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, total_amount, discount_amount, coupon_used, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [customer_name, customer_email, customer_phone, customer_address, finalAmount, discount, validatedCoupon, 'Pending'],
        function (err) {
          if (err) {
            db.run('ROLLBACK');
            return handleDbError(err, res);
          }

          const orderId = this.lastID;
          let insertErrors = false;

          const stmt = db.prepare('INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?, ?, ?, ?)');
          const stockUpdateStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

          items.forEach(item => {
            const dbProd = productsMap[item.product_id];
            stmt.run(orderId, item.product_id, item.quantity, dbProd.price, (err) => { if (err) insertErrors = true; });
            stockUpdateStmt.run(item.quantity, item.product_id, (err) => { if (err) insertErrors = true; });
          });

          stmt.finalize();
          stockUpdateStmt.finalize();

          db.run('COMMIT', (err) => {
            if (err || insertErrors) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Failed to commit order transaction.' });
            }
            res.status(201).json({
              message: 'Order placed successfully.',
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
    if (err) return handleDbError(err, res);
    if (!orders || orders.length === 0) return res.json([]);

    db.all(`
      SELECT oi.*, p.name as product_name, p.image_url 
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
    `, [], (err, allItems) => {
      if (err) return handleDbError(err, res);
      const itemsGroupedByOrder = {};
      (allItems || []).forEach(item => {
        if (!itemsGroupedByOrder[item.order_id]) itemsGroupedByOrder[item.order_id] = [];
        itemsGroupedByOrder[item.order_id].push(item);
      });
      orders.forEach(order => { order.items = itemsGroupedByOrder[order.id] || []; });
      res.json(orders);
    });
  });
});

app.get('/api/orders/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid order ID.' });

  db.get('SELECT * FROM orders WHERE id = ?', [id], (err, order) => {
    if (err) return handleDbError(err, res);
    if (!order) return res.status(404).json({ error: 'Order not found.' });

    db.all(`
      SELECT oi.*, p.name as product_name, p.image_url 
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `, [id], (err, items) => {
      if (err) return handleDbError(err, res);
      order.items = items || [];
      res.json(order);
    });
  });
});

// Security: Whitelist-only order status transitions
const VALID_ORDER_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

app.put('/api/orders/:id/status', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Invalid order ID.' });

  const { status } = req.body;
  if (!status || !VALID_ORDER_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_ORDER_STATUSES.join(', ')}.` });
  }

  db.run('UPDATE orders SET status = ? WHERE id = ?', [status, id], function (err) {
    if (err) return handleDbError(err, res);
    if (this.changes === 0) return res.status(404).json({ error: 'Order not found.' });
    res.json({ message: 'Order status updated successfully.', id, status });
  });
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
  const stats = { totalSales: 0, totalOrders: 0, outOfStockCount: 0, lowStockCount: 0, salesByDay: [] };

  db.get("SELECT SUM(total_amount) as sales, COUNT(*) as orders FROM orders WHERE status != 'Cancelled'", (err, row) => {
    if (err) return handleDbError(err, res);
    stats.totalSales = row.sales || 0;
    stats.totalOrders = row.orders || 0;

    db.get("SELECT COUNT(*) as outCount FROM products WHERE stock = 0", (err, outRow) => {
      if (err) return handleDbError(err, res);
      stats.outOfStockCount = outRow.outCount || 0;

      db.get("SELECT COUNT(*) as lowCount FROM products WHERE stock > 0 AND stock <= 3", (err, lowRow) => {
        if (err) return handleDbError(err, res);
        stats.lowStockCount = lowRow.lowCount || 0;

        db.all(`
          SELECT strftime('%Y-%m-%d', created_at) as date, SUM(total_amount) as sales, COUNT(*) as count 
          FROM orders WHERE status != 'Cancelled' 
          GROUP BY date ORDER BY date ASC LIMIT 7
        `, (err, chartRows) => {
          if (err) return handleDbError(err, res);
          stats.salesByDay = chartRows || [];
          res.json(stats);
        });
      });
    });
  });
});

// ─── Catch-all 404 for unknown /api routes ───
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// ─── Global Error Handler (prevents Express from leaking stack traces) ───
app.use((err, req, res, next) => {
  // CORS policy errors
  if (err.message && err.message.startsWith('CORS Policy')) {
    return res.status(403).json({ error: err.message });
  }
  // JSON parse errors
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body.' });
  }
  // Payload too large
  if (err.status === 413) {
    return res.status(413).json({ error: 'Request payload too large.' });
  }
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
  console.log(`Swagger documentation available at http://localhost:${PORT}/docs`);
});
