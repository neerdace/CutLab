const express = require('express');
const db = require('../db/connection');

const router = express.Router();

function attachLessons(t) {
  const lessons = db.prepare('SELECT title, duration FROM lessons WHERE tutorial_id = ? ORDER BY idx ASC').all(t.id);
  return { ...t, lessons };
}

router.get('/', (req, res) => {
  const { software, level, topic } = req.query;
  let rows = db.prepare('SELECT * FROM tutorials').all();
  if (software && software !== 'All') rows = rows.filter(t => t.software === software);
  if (level && level !== 'All') rows = rows.filter(t => t.level === level);
  if (topic && topic !== 'All') rows = rows.filter(t => t.topic === topic);
  res.json({ tutorials: rows.map(attachLessons) });
});

router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM tutorials WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Tutorial not found.' });
  res.json({ tutorial: attachLessons(row) });
});

module.exports = router;
