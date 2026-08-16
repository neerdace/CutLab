const express = require('express');
const crypto = require('crypto');
const db = require('../db/connection');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

function genOrderId() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function serializeOrder(order) {
  const items = db.prepare('SELECT product_id, name, price, qty FROM order_items WHERE order_id = ?').all(order.id);
  return {
    id: order.id, total: order.total, createdAt: order.created_at,
    billing: { name: order.billing_name, email: order.billing_email, company: order.billing_company, country: order.billing_country },
    lines: items.map(i => ({ id: i.product_id, name: i.name, price: i.price, qty: i.qty })),
  };
}

// Place an order. Prices are always re-read from the database — the client
// only sends product ids + quantities, never trusted prices.
router.post('/', requireAuth, (req, res) => {
  const { items, billing } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty.' });

  const lines = [];
  for (const it of items) {
    const p = db.prepare('SELECT id, name, price FROM products WHERE id = ?').get(it.id);
    if (!p) continue;
    const qty = Math.max(1, Number(it.qty) || 1);
    lines.push({ id: p.id, name: p.name, price: p.price, qty });
  }
  if (lines.length === 0) return res.status(400).json({ error: 'No valid items in cart.' });

  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const id = genOrderId();

  db.withTransaction(() => {
    db.prepare(`
      INSERT INTO orders (id, user_id, total, billing_name, billing_email, billing_company, billing_country)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, req.user.id, total, billing?.name || req.user.name, billing?.email || req.user.email, billing?.company || '', billing?.country || '');

    const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, qty) VALUES (?, ?, ?, ?, ?)');
    lines.forEach(l => insertItem.run(id, l.id, l.name, l.price, l.qty));
  });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  res.status(201).json({ order: serializeOrder(order) });
});

router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ orders: rows.map(serializeOrder) });
});

router.get('/:id', requireAuth, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.user_id !== req.user.id && req.user.role !== 'admin') return res.status(403).json({ error: 'Not your order.' });
  res.json({ order: serializeOrder(order) });
});

// Admin: list all orders
router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT o.*, u.name AS user_name, u.email AS user_email
    FROM orders o JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
  `).all();
  res.json({ orders: rows.map(r => ({ ...serializeOrder(r), userName: r.user_name, userEmail: r.user_email })) });
});

module.exports = router;
