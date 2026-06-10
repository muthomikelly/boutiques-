const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');
const axios = require('axios');
const uuid = require('uuid');
const path = require('path');
const fs = require('fs');

const { getDb } = require('./db/init');
const { requireAuth, requireAdmin } = require('./middleware/auth');

const router = express.Router();
router.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'uploads');

// M-Pesa configuration
const MPESA_CONSUMER_KEY = process.env.MPESA_CONSUMER_KEY;
const MPESA_CONSUMER_SECRET = process.env.MPESA_CONSUMER_SECRET;
const MPESA_SHORTCODE = process.env.MPESA_SHORTCODE;
const MPESA_PASSKEY = process.env.MPESA_PASSKEY;
const MPESA_CALLBACK_URL = process.env.MPESA_CALLBACK_URL;
const MPESA_ENV = process.env.MPESA_ENV;
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const upload = multer({ storage });

// SMTP transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Helper function to get M-Pesa access token
async function getMpesaAccessToken() {
  try {
    const auth = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
    const response = await axios.get(
      MPESA_ENV === 'sandbox'
        ? 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
        : 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
      {
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );
    return response.data.access_token;
  } catch (error) {
    console.error('Failed to get M-Pesa access token:', error.message);
    throw new Error('M-Pesa service unavailable');
  }
}

// Helper function to generate M-Pesa password
function generateMpesaPassword() {
  const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const password = Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${timestamp}`).toString('base64');
  return { password, timestamp };
}

// Auth routes
router.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const result = db
      .prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
      .run(name, email, hashed, 'customer');

    const token = jwt.sign(
      { id: result.lastInsertRowid, name, email, role: 'customer' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user: { id: result.lastInsertRowid, name, email, role: 'customer' } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    const { password: _, ...userData } = user;
    res.json({ user: userData });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ message: 'Logged out' });
});

router.get('/api/auth/me', requireAuth, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

// Products routes
router.get('/api/products', (req, res) => {
  try {
    const db = getDb();
    const { category, search } = req.query;

    let query = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (search) {
      query += ' AND (name LIKE ? OR description LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    const products = db.prepare(query).all(...params);
    res.json({ products });
  } catch (error) {
    console.error('Products error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/products/:id', (req, res) => {
  try {
    const db = getDb();
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }
    res.json({ product });
  } catch (error) {
    console.error('Product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/products', requireAuth, requireAdmin, upload.single('image'), (req, res) => {
  try {
    const { name, description, price, stock, category, item_type, sizes, colors } = req.body;
    if (!name || !description || !price || !stock || !category || !item_type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const image_url = req.file ? `/uploads/${req.file.filename}` : null;

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO products 
         (name, description, price, stock, image_url, category, item_type, sizes, colors)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(name, description, price, stock, image_url, category, item_type, sizes || null, colors || null);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ product });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Orders routes
router.get('/api/orders', requireAuth, (req, res) => {
  try {
    const db = getDb();
    let orders;

    if (req.user.role === 'admin') {
      orders = db.prepare(`
        SELECT o.*, u.name as customer_name, u.email as customer_email
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
      `).all();
    } else {
      orders = db.prepare(`
        SELECT o.* FROM orders o
        WHERE o.user_id = ?
        ORDER BY o.created_at DESC
      `).all(req.user.id);
    }

    res.json({ orders });
  } catch (error) {
    console.error('Orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/orders/:id', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare(`
      SELECT o.* FROM orders o
      WHERE o.id = ? AND (o.user_id = ? OR ? = 'admin')
    `).get(req.params.id, req.user.id, req.user.role);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const items = db.prepare(`
      SELECT oi.*, p.name, p.image_url, p.price as unit_price
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      WHERE oi.order_id = ?
    `).all(req.params.id);

    res.json({ order, items });
  } catch (error) {
    console.error('Order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/orders', requireAuth, async (req, res) => {
  try {
    const { items, shipping_address } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const db = getDb();
    let total = 0;

    // Calculate total and validate stock
    for (const item of items) {
      const product = db.prepare('SELECT price, stock FROM products WHERE id = ?').get(item.product_id);
      if (!product) {
        return res.status(400).json({ error: `Product ${item.product_id} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ error: `Insufficient stock for product ${item.product_id}` });
      }
      total += product.price * item.quantity;
    }

    const total_kes = Math.ceil(total * 130); // Convert USD to KES

    const orderResult = db
      .prepare(
        `INSERT INTO orders 
         (user_id, total, total_kes, shipping_address, status)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(req.user.id, total, total_kes, shipping_address || null, 'pending');

    const orderId = orderResult.lastInsertRowid;

    // Insert order items and update stock
    const insertItem = db.prepare(`
      INSERT INTO order_items (order_id, product_id, quantity, size, color, unit_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

    for (const item of items) {
      const product = db.prepare('SELECT price FROM products WHERE id = ?').get(item.product_id);
      insertItem.run(orderId, item.product_id, item.quantity, item.size || null, item.color || null, product.price);
      updateStock.run(item.quantity, item.product_id);
    }

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    res.status(201).json({ order });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Payment routes
router.post('/api/payments/stk-push', requireAuth, async (req, res) => {
  try {
    const { order_id, phone } = req.body;
    if (!order_id || !phone) {
      return res.status(400).json({ error: 'Order ID and phone number are required' });
    }

    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(order_id, req.user.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Order is not pending payment' });
    }

    // Format phone number (254XXXXXXXXX)
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.substring(1);
    } else if (formattedPhone.startsWith('+')) {
      formattedPhone = formattedPhone.substring(1);
    }

    if (formattedPhone.length !== 12 || !formattedPhone.startsWith('254')) {
      return res.status(400).json({ error: 'Invalid phone number format. Use 07XXXXXXXX or 2547XXXXXXXX' });
    }

    const accessToken = await getMpesaAccessToken();
    const { password, timestamp } = generateMpesaPassword();

    const checkoutId = uuid.v4();

    // For sandbox testing, use a callback URL that M-Pesa sandbox accepts
    // M-Pesa sandbox requires a valid HTTPS URL that it can reach
    const callbackUrl = MPESA_ENV === 'sandbox' 
      ? 'https://mydomain.com'  // M-Pesa sandbox accepts this for testing
      : MPESA_CALLBACK_URL;
    
    const response = await axios.post(
      MPESA_ENV === 'sandbox'
        ? 'https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest'
        : 'https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest',
      {
        BusinessShortCode: MPESA_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: 'CustomerPayBillOnline',
        Amount: order.total_kes,
        PartyA: formattedPhone,
        PartyB: MPESA_SHORTCODE,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: `ORDER-${order_id}`,
        TransactionDesc: `Payment for order #${order_id}`,
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    if (response.data.ResponseCode === '0') {
      // Update order with checkout ID
      db.prepare('UPDATE orders SET mpesa_checkout_id = ?, status = ? WHERE id = ?').run(
        checkoutId,
        'processing',
        order_id
      );

      res.json({
        checkoutId,
        message: 'Payment request sent to your phone. Please check your M-Pesa menu.',
      });
    } else {
      console.error('M-Pesa STK Push error:', response.data);
      res.status(400).json({ error: 'Failed to initiate payment. Please try again.' });
    }
  } catch (error) {
    console.error('STK Push error:', error.message);
    if (error.response) {
      console.error('M-Pesa API response:', error.response.data);
      // Return the actual M-Pesa error message
      const mpesaError = error.response.data.errorMessage || error.response.data.error || 'Payment service error';
      return res.status(500).json({ error: mpesaError });
    }
    res.status(500).json({ error: 'Payment service error. Please try again.' });
  }
});

router.get('/api/payments/status/:orderId', requireAuth, (req, res) => {
  try {
    const db = getDb();
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.orderId, req.user.id);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ status: order.status });
  } catch (error) {
    console.error('Payment status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/payments/mpesa-callback', async (req, res) => {
  try {
    const data = req.body;
    console.log('M-Pesa callback received:', JSON.stringify(data, null, 2));

    if (data.Body.stkCallback.ResultCode === 0) {
      // Payment successful
      const checkoutId = data.Body.stkCallback.CheckoutRequestID;
      const amount = data.Body.stkCallback.CallbackMetadata.Item.find(item => item.Name === 'Amount').Value;
      const mpesaReceipt = data.Body.stkCallback.CallbackMetadata.Item.find(item => item.Name === 'MpesaReceiptNumber').Value;
      const phone = data.Body.stkCallback.CallbackMetadata.Item.find(item => item.Name === 'PhoneNumber').Value;

      const db = getDb();
      const order = db.prepare('SELECT * FROM orders WHERE mpesa_checkout_id = ?').get(checkoutId);
      
      if (order) {
        db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', order.id);
        
        // Send confirmation email
        const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id);
        if (user && user.email) {
          try {
            await transporter.sendMail({
              from: process.env.EMAIL_FROM,
              to: user.email,
              subject: 'Payment Confirmation - LuxeBoutique',
              html: `
                <h2>Payment Successful</h2>
                <p>Your payment of KES ${amount} for order #${order.id} has been confirmed.</p>
                <p>M-Pesa Receipt: ${mpesaReceipt}</p>
                <p>Thank you for shopping with LuxeBoutique!</p>
              `,
            });
          } catch (emailError) {
            console.error('Failed to send confirmation email:', emailError);
          }
        }
      }
    }

    // Always respond to M-Pesa callback
    res.json({ ResultCode: 0, ResultDesc: 'Success' });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.status(500).json({ ResultCode: 1, ResultDesc: 'Failed' });
  }
});

// Admin routes
router.get('/api/admin/stats', requireAuth, requireAdmin, (req, res) => {
  try {
    const db = getDb();

    const totalSales = db.prepare(`
      SELECT COALESCE(SUM(total), 0) as total
      FROM orders 
      WHERE status = 'paid'
    `).get();

    const totalOrders = db.prepare(`
      SELECT COUNT(*) as count FROM orders
    `).get();

    const totalProducts = db.prepare(`
      SELECT COUNT(*) as count FROM products
    `).get();

    const totalUsers = db.prepare(`
      SELECT COUNT(*) as count FROM users
    `).get();

    const recentOrders = db.prepare(`
      SELECT o.*, u.name as customer_name
      FROM orders o
      LEFT JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
      LIMIT 5
    `).all();

    res.json({
      stats: {
        totalSales: totalSales.total,
        totalOrders: totalOrders.count,
        totalProducts: totalProducts.count,
        totalUsers: totalUsers.count,
      },
      recentOrders,
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Password reset routes
router.post('/api/auth/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user) {
      // Don't reveal if user exists
      return res.json({ message: 'If an account exists, a reset link has been sent.' });
    }

    const resetToken = jwt.sign({ id: user.id, email }, JWT_SECRET, { expiresIn: '1h' });
    const resetLink = `${BASE_URL}/reset-password.html?token=${resetToken}`;

    try {
      await transporter.sendMail({
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Password Reset - LuxeBoutique',
        html: `
          <h2>Password Reset Request</h2>
          <p>Click the link below to reset your password. This link expires in 1 hour.</p>
          <a href="${resetLink}">Reset Password</a>
          <p>If you didn't request this, please ignore this email.</p>
        `,
      });
    } catch (emailError) {
      console.error('Failed to send reset email:', emailError);
      return res.status(500).json({ error: 'Failed to send reset email' });
    }

    res.json({ message: 'If an account exists, a reset link has been sent.' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch {
      return res.status(400).json({ error: 'Invalid or expired token' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND email = ?').get(decoded.id, decoded.email);
    if (!user) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const hashed = await bcrypt.hash(password, 12);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, user.id);

    res.json({ message: 'Password reset successful. You can now login.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

function registerRoutes(app) {
  app.use(router);
}

module.exports = { registerRoutes };


// Test route to simulate M-Pesa callback (for development without ngrok)
router.post('/api/payments/test-callback/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const db = getDb();
    
    const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(orderId, req.user.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    // Simulate successful payment
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run('paid', orderId);
    
    // Send confirmation email
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(order.user_id);
    if (user && user.email) {
      try {
        const transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT) || 587,
          secure: false,
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
        
        await transporter.sendMail({
          from: process.env.EMAIL_FROM,
          to: user.email,
          subject: 'Payment Confirmation - LuxeBoutique',
          html: `
            <h2>Payment Successful</h2>
            <p>Your payment of KES ${order.total_kes} for order #${order.id} has been confirmed.</p>
            <p>M-Pesa Receipt: TEST-RECEIPT-${Date.now()}</p>
            <p>Thank you for shopping with LuxeBoutique!</p>
          `,
        });
      } catch (emailError) {
        console.error('Failed to send confirmation email:', emailError);
      }
    }
    
    res.json({ success: true, message: 'Payment simulated successfully' });
  } catch (error) {
    console.error('Test callback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Alternative: Use a publicly accessible test callback URL
// For M-Pesa sandbox testing, you can use: https://webhook.site
// 1. Go to https://webhook.site
// 2. Copy your unique URL
// 3. Update .env: MPESA_CALLBACK_URL=https://webhook.site/your-unique-id
// 4. You'll see the callback data when payment is made