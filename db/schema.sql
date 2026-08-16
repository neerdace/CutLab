CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer',   -- 'customer' | 'admin'
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id    INTEGER PRIMARY KEY AUTOINCREMENT,
  name  TEXT NOT NULL UNIQUE,
  slug  TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS products (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories(id),
  price        REAL NOT NULL,
  software     TEXT NOT NULL DEFAULT '[]',   -- JSON array
  formats      TEXT,
  file_count   TEXT,
  resolution   TEXT,
  license      TEXT,
  ref          TEXT,
  color_from   TEXT DEFAULT '#FF7A3D',
  color_to     TEXT DEFAULT '#7A3115',
  icon         TEXT DEFAULT 'layers',
  description  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id),
  total          REAL NOT NULL,
  billing_name   TEXT,
  billing_email  TEXT,
  billing_company TEXT,
  billing_country TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS order_items (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL,
  name       TEXT NOT NULL,
  price      REAL NOT NULL,
  qty        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tutorials (
  id         TEXT PRIMARY KEY,
  title      TEXT NOT NULL,
  software   TEXT NOT NULL,
  level      TEXT NOT NULL,
  topic      TEXT NOT NULL,
  instructor TEXT,
  role       TEXT,
  summary    TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tutorial_id TEXT NOT NULL REFERENCES tutorials(id),
  idx         INTEGER NOT NULL,
  title       TEXT NOT NULL,
  duration    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS enrollments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  tutorial_id TEXT NOT NULL REFERENCES tutorials(id),
  completed   TEXT NOT NULL DEFAULT '[]',   -- JSON array of lesson indexes
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, tutorial_id)
);
