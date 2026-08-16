require('dotenv').config();
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { init } = require('./db/init');
const { attachUser } = require('./middleware/auth');

// Ensure DB exists and is seeded before the server starts handling requests.
init();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(attachUser);

app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/tutorials', require('./routes/tutorials'));
app.use('/api/enrollments', require('./routes/enrollments'));
app.use('/api/users', require('./routes/users'));

app.use(express.static(path.join(__dirname, 'public')));

// Fallback 404 for unknown API routes (keep JSON, not the HTML 404 page)
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

app.listen(PORT, () => {
  console.log(`CutLab running at http://localhost:${PORT}`);
});
