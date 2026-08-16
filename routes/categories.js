const express = require('express');
const db = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function slugify(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

router.get('/', (req, res) => {
  const rows = db.prepare(`
    SELECT c.id, c.name, c.slug, COUNT(p.id) AS product_count
    FROM categories c LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id ORDER BY c.name ASC
  `).all();
  res.json({ categories: rows });
});

router.post('/', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Category name is required.' });
  const slug = slugify(name);
  const existing = db.prepare('SELECT id FROM categories WHERE name = ? OR slug = ?').get(name.trim(), slug);
  if (existing) return res.status(409).json({ error: 'That category already exists.' });
  const info = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name.trim(), slug);
  res.status(201).json({ category: { id: info.lastInsertRowid, name: name.trim(), slug, product_count: 0 } });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const inUse = db.prepare('SELECT COUNT(*) AS c FROM products WHERE category_id = ?').get(id);
  if (inUse.c > 0) return res.status(409).json({ error: `Category is used by ${inUse.c} product(s) — reassign or delete them first.` });
  const info = db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  if (info.changes === 0) return res.status(404).json({ error: 'Category not found.' });
  res.json({ ok: true });
});

module.exports = router;
