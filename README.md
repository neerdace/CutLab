# CutLab — full-stack build

A real backend behind the CutLab storefront: user accounts with password
authentication, a SQLite database, and an admin panel for managing products
and categories.

This is a genuine Node.js app — it needs to actually run (locally or on a
host) to work. It will **not** run inside a chat preview; there's no live
server exposed there. Follow the steps below on your own machine.

## Stack

- **Server**: Node.js + Express
- **Database**: SQLite via Node's built-in `node:sqlite` module (a single
  file at `data/cutlab.db`) — no native compilation, no extra install step
- **Auth**: `bcryptjs` password hashing + JWT stored in an httpOnly cookie
- **Frontend**: plain HTML/CSS/JS (no build step), served as static files by
  the same Express app, talking to the backend over `fetch()`

## Requirements

**Node.js 22.5 or newer** (needed for the built-in SQLite module). Check
with `node -v`; upgrade at nodejs.org if you're on an older version.

## Setup

```bash
npm install
cp .env.example .env      # then edit .env — at minimum change JWT_SECRET
npm start
```

`npm start` runs `node --experimental-sqlite server.js`. The flag is only
needed on some Node 22.x point releases (harmless if your version doesn't
require it) — you'll see a one-line `ExperimentalWarning` about SQLite on
boot, which is expected and safe to ignore.

Open **http://localhost:3000**. The database is created and seeded
automatically the first time the server starts (12 products across 6
categories, 9 tutorials, and one admin account).

**Default admin login** (from `.env.example` — change this):
```
admin@cutlab.test / Admin123!
```

To wipe the database and reseed from scratch:
```bash
rm data/cutlab.db*
npm start
```

## What's real vs. what's still a demo

**Real:**
- Registration and login (bcrypt-hashed passwords, JWT session cookie)
- All product, category, tutorial, order, and enrollment data lives in SQLite
- Admin routes are enforced **server-side** (`requireAdmin` middleware) — the
  admin panel UI is just a convenience, not the security boundary
- Order totals are always recalculated from the database on the server; the
  client's cart only ever sends product ids and quantities, never prices
- Cart is stored in the browser's `localStorage` (this is a normal
  standalone site now, so that's the right tool — no server round-trip
  needed until checkout)

**Still a demo / not production-hardened:**
- Checkout doesn't call a real payment processor — card fields are collected
  and discarded, no charge happens
- No email sending (order confirmations are shown on-screen only)
- No rate limiting, CSRF protection, or email verification
- SQLite is great for this scale; for real traffic you'd want to move to
  Postgres/MySQL eventually
- The JWT secret and admin password ship with obvious defaults — **change
  both** before putting this anywhere public

## Project structure

```
server.js              Express app entry point
db/
  connection.js         node:sqlite connection + withTransaction() helper
  schema.sql             table definitions
  seedData.js             categories/products/tutorials seed content
  init.js                  creates + seeds the DB on first run
middleware/
  auth.js                JWT cookie verification, requireAuth/requireAdmin
routes/
  auth.js         POST /api/auth/register, /login, /logout · GET /me
  categories.js   GET /api/categories · admin: POST, DELETE
  products.js     GET /api/products (filters: category, software, sort, ids)
                  GET /api/products/:id · admin: POST, PUT, DELETE
  orders.js       POST /api/orders (auth) · GET /mine · GET /:id · admin: GET /
  tutorials.js    GET /api/tutorials (filters) · GET /:id
  enrollments.js  GET /mine · POST (enroll) · PATCH /:id/toggle (auth)
  users.js        admin: GET /, PATCH /:id/role
public/
  *.html           one file per page (no client-side router — real pages)
  css/style.css
  js/app.js         shared frontend logic, calls the API above
  js/admin.js        admin panel (loaded only on admin.html)
```

## Admin panel

Sign in with an admin account, then either open **Account → Admin Panel**
or go directly to `/admin.html`. It's gated on the client for UX (redirects
non-admins) and on the server for security (every admin route checks the
session's role independently of what the UI shows).

Tabs:
- **Products** — add/edit/delete, with category, price, compatible software,
  formats, license, thumbnail colors/icon, and description
- **Categories** — add new ones, delete unused ones (blocked while products
  still reference a category)
- **Orders** — read-only list of every order placed, across all customers
- **Users** — list accounts and promote/demote between customer and admin
  (you can't demote your own account, to avoid locking yourself out)

## Deploying somewhere real

Any Node host works (Render, Railway, Fly.io, a VPS, etc.) — set the
environment variables from `.env.example`, run `npm install && npm start`.
Since the database is a single SQLite file, make sure the host's filesystem
is persistent (not wiped on every deploy/restart), or switch to a hosted
Postgres and swap out `db/connection.js` when you're ready to scale.
