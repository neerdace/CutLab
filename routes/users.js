const express = require('express');
const db = require('../db/connection');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users: rows });
});

router.patch('/:id/role', requireAdmin, (req, res) => {
  const { role } = req.body || {};
  if (!['customer', 'admin'].includes(role)) return res.status(400).json({ error: "Role must be 'customer' or 'admin'." });
  const id = Number(req.params.id);
  if (id === req.user.id && role !== 'admin') {
    return res.status(400).json({ error: "You can't remove your own admin access." });
  }
  const info = db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, id);
  if (info.changes === 0) return res.status(404).json({ error: 'User not found.' });
  res.json({ ok: true });
});

module.exports = router;
