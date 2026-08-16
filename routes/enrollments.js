const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.get('/mine', requireAuth, (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, t.title, t.software, t.level, t.topic
    FROM enrollments e JOIN tutorials t ON t.id = e.tutorial_id
    WHERE e.user_id = ? ORDER BY e.started_at DESC
  `).all(req.user.id);

  const enrollments = rows.map(r => {
    const lessonCount = db.prepare('SELECT COUNT(*) AS c FROM lessons WHERE tutorial_id = ?').get(r.tutorial_id).c;
    return {
      tutorialId: r.tutorial_id, title: r.title, software: r.software, level: r.level, topic: r.topic,
      completed: JSON.parse(r.completed || '[]'), lessonCount, startedAt: r.started_at,
    };
  });
  res.json({ enrollments });
});

router.post('/', requireAuth, (req, res) => {
  const { tutorialId } = req.body || {};
  const tutorial = db.prepare('SELECT id FROM tutorials WHERE id = ?').get(tutorialId);
  if (!tutorial) return res.status(404).json({ error: 'Tutorial not found.' });

  const existing = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND tutorial_id = ?').get(req.user.id, tutorialId);
  if (existing) return res.json({ enrollment: { tutorialId, completed: JSON.parse(existing.completed) } });

  db.prepare('INSERT INTO enrollments (user_id, tutorial_id, completed) VALUES (?, ?, ?)').run(req.user.id, tutorialId, '[]');
  res.status(201).json({ enrollment: { tutorialId, completed: [] } });
});

router.patch('/:tutorialId/toggle', requireAuth, (req, res) => {
  const { lessonIndex } = req.body || {};
  const row = db.prepare('SELECT * FROM enrollments WHERE user_id = ? AND tutorial_id = ?').get(req.user.id, req.params.tutorialId);
  if (!row) return res.status(404).json({ error: 'Not enrolled in this tutorial yet.' });

  const completed = JSON.parse(row.completed || '[]');
  const idx = completed.indexOf(lessonIndex);
  if (idx >= 0) completed.splice(idx, 1); else completed.push(lessonIndex);

  db.prepare('UPDATE enrollments SET completed = ? WHERE id = ?').run(JSON.stringify(completed), row.id);
  res.json({ enrollment: { tutorialId: req.params.tutorialId, completed } });
});

module.exports = router;
