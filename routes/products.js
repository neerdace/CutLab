const express = require('express');
const db = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function serialize(row) {
  return {
    id: row.id, name: row.name, price: row.price,
    category: row.category_name, categoryId: row.category_id,
    software: JSON.parse(row.software || '[]'),
    formats: row.formats, fileCount: row.file_count, resolution: row.resolution,
    license: row.license, ref: row.ref,
    colorFrom: row.color_from, colorTo: row.color_to, icon: row.icon,
    description: row.description,
  };
}

const BASE_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM products p JOIN categories c ON c.id = p.category_id
`;

router.get('/', (req, res) => {
  const { category, software, sort, ids, limit } = req.query;

  if (ids) {
    const idList = String(ids).split(',').map(s => s.trim()).filter(Boolean);
    if (idList.length === 0) return res.json({ products: [] });
    const placeholders = idList.map(() => '?').join(',');
    const rows = db.prepare(`${BASE_SELECT} WHERE p.id IN (${placeholders})`).all(...idList);
    return res.json({ products: rows.map(serialize) });
  }

  let rows = db.prepare(BASE_SELECT).all();
  if (category && category !== 'All') rows = rows.filter(r => r.category_name === category);
  if (software && software !== 'All') {
    rows = rows.filter(r => {
      const list = JSON.parse(r.software || '[]');
      return list.includes(software) || (software !== 'Universal' && list.includes('Universal'));
    });
  }
  if (sort === 'price-asc') rows.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') rows.sort((a, b) => b.price - a.price);
  else if (sort === 'name') rows.sort((a, b) => a.name.localeCompare(b.name));

  if (limit) rows = rows.slice(0, Number(limit));
  res.json({ products: rows.map(serialize) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare(`${BASE_SELECT} WHERE p.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Product not found.' });
  res.json({ product: serialize(row) });
});

function slugifyId(name) {
  return String(name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

router.post('/', requireAdmin, (req, res) => {
  const b = req.body || {};
  if (!b.name || !String(b.name).trim()) return res.status(400).json({ error: 'Product name is required.' });
  if (!b.categoryId) return res.status(400).json({ error: 'Category is required.' });
  if (b.price == null || isNaN(Number(b.price)) || Number(b.price) < 0) return res.status(400).json({ error: 'A valid price is required.' });
  const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(b.categoryId));
  if (!cat) return res.status(400).json({ error: 'Unknown category.' });

  let id = b.id ? slugifyId(b.id) : slugifyId(b.name);
  let unique = id, n = 2;
  while (db.prepare('SELECT id FROM products WHERE id = ?').get(unique)) { unique = `${id}-${n++}`; }
  id = unique;

  const software = Array.isArray(b.software) ? b.software : String(b.software || '').split(',').map(s => s.trim()).filter(Boolean);

  db.prepare(`
    INSERT INTO products (id, name, category_id, price, software, formats, file_count, resolution, license, ref, color_from, color_to, icon, description)
    VALUES (@id, @name, @category_id, @price, @software, @formats, @file_count, @resolution, @license, @ref, @color_from, @color_to, @icon, @description)
  `).run({
    id, name: b.name.trim(), category_id: Number(b.categoryId), price: Number(b.price),
    software: JSON.stringify(software), formats: b.formats || '', file_count: b.fileCount || '',
    resolution: b.resolution || '', license: b.license || 'Personal & Commercial', ref: b.ref || id.toUpperCase(),
    color_from: b.colorFrom || '#FF7A3D', color_to: b.colorTo || '#7A3115', icon: b.icon || 'layers',
    description: b.description || '',
  });

  const row = db.prepare(`${BASE_SELECT} WHERE p.id = ?`).get(id);
  res.status(201).json({ product: serialize(row) });
});

router.put('/:id', requireAdmin, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found.' });
  const b = req.body || {};

  let categoryId = existing.category_id;
  if (b.categoryId) {
    const cat = db.prepare('SELECT id FROM categories WHERE id = ?').get(Number(b.categoryId));
    if (!cat) return res.status(400).json({ error: 'Unknown category.' });
    categoryId = Number(b.categoryId);
  }
  const software = b.software != null
    ? (Array.isArray(b.software) ? b.software : String(b.software).split(',').map(s => s.trim()).filter(Boolean))
    : JSON.parse(existing.software || '[]');

  db.prepare(`
    UPDATE products SET
      name=@name, category_id=@category_id, price=@price, software=@software,
      formats=@formats, file_count=@file_count, resolution=@resolution, license=@license,
      ref=@ref, color_from=@color_from, color_to=@color_to, icon=@icon, description=@description
    WHERE id=@id
  `).run({
    id: existing.id,
    name: b.name != null ? String(b.name).trim() : existing.name,
    category_id: categoryId,
    price: b.price != null ? Number(b.price) : existing.price,
    software: JSON.stringify(software),
    formats: b.formats != null ? b.formats : existing.formats,
    file_count: b.fileCount != null ? b.fileCount : existing.file_count,
    resolution: b.resolution != null ? b.resolution : existing.resolution,
    license: b.license != null ? b.license : existing.license,
    ref: b.ref != null ? b.ref : existing.ref,
    color_from: b.colorFrom != null ? b.colorFrom : existing.color_from,
    color_to: b.colorTo != null ? b.colorTo : existing.color_to,
    icon: b.icon != null ? b.icon : existing.icon,
    description: b.description != null ? b.description : existing.description,
  });

  const row = db.prepare(`${BASE_SELECT} WHERE p.id = ?`).get(existing.id);
  res.json({ product: serialize(row) });
});

router.delete('/:id', requireAdmin, (req, res) => {
  const info = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Product not found.' });
  res.json({ ok: true });
});

module.exports = router;
