const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const dbPath = path.join(dataDir, 'cutlab.db');
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA foreign_keys = ON');

// node:sqlite's DatabaseSync has no built-in db.transaction() helper like
// better-sqlite3 — this wraps a block of statements in BEGIN/COMMIT with a
// ROLLBACK on error, used anywhere multiple related writes must succeed or
// fail together (e.g. seeding, placing an order with its line items).
function withTransaction(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

module.exports = db;
module.exports.withTransaction = withTransaction;
