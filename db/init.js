const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./connection');
const { CATEGORIES, PRODUCTS, TUTORIALS } = require('./seedData');

function tableIsEmpty(table) {
  const row = db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get();
  return row.c === 0;
}

function runSchema() {
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  db.exec(schema);
}

function seedCategories() {
  const insert = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  db.withTransaction(() => { CATEGORIES.forEach(c => insert.run(c.name, c.slug)); });
}

function seedProducts() {
  const catRow = db.prepare('SELECT id FROM categories WHERE name = ?');
  const insert = db.prepare(`
    INSERT INTO products (id, name, category_id, price, software, formats, file_count, resolution, license, ref, color_from, color_to, icon, description)
    VALUES (@id, @name, @category_id, @price, @software, @formats, @file_count, @resolution, @license, @ref, @color_from, @color_to, @icon, @description)
  `);
  db.withTransaction(() => {
    PRODUCTS.forEach(p => {
      const cat = catRow.get(p.category);
      if (!cat) throw new Error('Unknown seed category: ' + p.category);
      insert.run({
        id: p.id, name: p.name, category_id: cat.id, price: p.price,
        software: JSON.stringify(p.software), formats: p.formats, file_count: p.file_count,
        resolution: p.resolution, license: p.license, ref: p.ref,
        color_from: p.color_from, color_to: p.color_to, icon: p.icon, description: p.description,
      });
    });
  });
}

function seedTutorials() {
  const insertT = db.prepare(`
    INSERT INTO tutorials (id, title, software, level, topic, instructor, role, summary)
    VALUES (@id, @title, @software, @level, @topic, @instructor, @role, @summary)
  `);
  const insertL = db.prepare('INSERT INTO lessons (tutorial_id, idx, title, duration) VALUES (?, ?, ?, ?)');
  db.withTransaction(() => {
    TUTORIALS.forEach(t => {
      insertT.run({ id: t.id, title: t.title, software: t.software, level: t.level, topic: t.topic,
        instructor: t.instructor, role: t.role, summary: t.summary });
      t.lessons.forEach((l, i) => insertL.run(t.id, i, l[0], l[1]));
    });
  });
}

function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || 'admin@cutlab.test';
  const password = process.env.ADMIN_PASSWORD || 'Admin123!';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return;
  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)')
    .run('CutLab Admin', email, hash, 'admin');
  console.log(`Seeded admin user -> ${email} / ${password} (change this after first login)`);
}

function init({ reseed = false } = {}) {
  runSchema();
  if (reseed) {
    db.exec('DELETE FROM lessons; DELETE FROM tutorials; DELETE FROM order_items; DELETE FROM orders; DELETE FROM products; DELETE FROM categories; DELETE FROM enrollments;');
  }
  if (tableIsEmpty('categories')) seedCategories();
  if (tableIsEmpty('products')) seedProducts();
  if (tableIsEmpty('tutorials')) seedTutorials();
  seedAdmin();
}

if (require.main === module) {
  require('dotenv').config();
  const reseed = process.argv.includes('--reseed');
  init({ reseed });
  console.log('Database ready at db/../data/cutlab.db');
  process.exit(0);
}

module.exports = { init };
