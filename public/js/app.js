/* ==========================================================================
   CUTLAB — shared frontend script (API-backed)
   Talks to the Express/SQLite backend under /api/*. Cart is kept in
   localStorage (guest-friendly); everything else — accounts, products,
   categories, orders, tutorials, enrollments — lives in the real database.
   ========================================================================== */

/* ============================= API HELPER ============================= */
async function api(path, opts = {}) {
  const hasBody = opts.body !== undefined;
  const res = await fetch(path, {
    credentials: 'include',
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
    method: opts.method || (hasBody ? 'POST' : 'GET'),
    body: hasBody ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

/* ============================= STATIC LOOKUPS ============================= */
const SOFTWARE_LIST = ['Premiere Pro', 'After Effects', 'DaVinci Resolve', 'Final Cut Pro', 'CapCut'];
const SOFTWARE_COLOR = {
  'Premiere Pro': { from: '#FF7A3D', to: '#7A3115' },
  'After Effects': { from: '#8B7FD8', to: '#332966' },
  'DaVinci Resolve': { from: '#2FB6A9', to: '#0F433D' },
  'Final Cut Pro': { from: '#E4574C', to: '#5C1712' },
  'CapCut': { from: '#B7D66B', to: '#44531E' },
};
const SOFTWARE_ABBR = { 'Premiere Pro': 'PR', 'After Effects': 'AE', 'DaVinci Resolve': 'DR', 'Final Cut Pro': 'FCP', 'CapCut': 'CC' };
const ICON_TYPES = ['color', 'transition', 'wave', 'layers', 'plug', 'grain'];

/* ============================= LOCAL CART (localStorage) ============================= */
const CART_KEY = 'cutlab_cart';
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
  catch (e) { return []; }
}
function setCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}
function cartCount() { return getCart().reduce((n, c) => n + c.qty, 0); }

/* ============================= APP STATE ============================= */
let state = { user: null, loaded: false };

async function initData() {
  try { const r = await api('/api/auth/me'); state.user = r.user; }
  catch (e) { state.user = null; }
  state.loaded = true;
}

function money(n) { return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 0 }); }

/* ============================= FETCH HELPERS ============================= */
async function fetchProducts(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const r = await api('/api/products' + (qs ? '?' + qs : ''));
  return r.products;
}
async function fetchProduct(id) { const r = await api('/api/products/' + encodeURIComponent(id)); return r.product; }
async function fetchCategories() { const r = await api('/api/categories'); return r.categories; }
async function fetchTutorials(params = {}) {
  const qs = new URLSearchParams(params).toString();
  const r = await api('/api/tutorials' + (qs ? '?' + qs : ''));
  return r.tutorials;
}
async function fetchTutorial(id) { const r = await api('/api/tutorials/' + encodeURIComponent(id)); return r.tutorial; }
async function cartLines() {
  const cart = getCart();
  if (!cart.length) return [];
  const products = await fetchProducts({ ids: cart.map(c => c.id).join(',') });
  return cart.map(c => ({ ...c, product: products.find(p => p.id === c.id) })).filter(l => l.product);
}
function linesTotal(lines) { return lines.reduce((s, l) => s + l.product.price * l.qty, 0); }

function tutorialSeconds(t) { return t.lessons.reduce((s, l) => s + l.duration, 0); }
function fmtDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600), m = Math.round((totalSeconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function fmtMMSS(seconds) { const m = Math.floor(seconds / 60), s = seconds % 60; return `${m}:${String(s).padStart(2, '0')}`; }

/* ============================= ICON / SVG GENERATORS ============================= */
function iconMarkup(type, cx, cy, color) {
  switch (type) {
    case 'color':
      return `<circle cx="${cx-14}" cy="${cy}" r="24" fill="none" stroke="${color}" stroke-width="2.5" opacity=".9"/>
              <circle cx="${cx+14}" cy="${cy}" r="24" fill="none" stroke="${color}" stroke-width="2.5" opacity=".55"/>`;
    case 'transition':
      return `<polygon points="${cx-32},${cy-24} ${cx},${cy} ${cx-32},${cy+24}" fill="${color}" opacity=".85"/>
              <polygon points="${cx+32},${cy-24} ${cx},${cy} ${cx+32},${cy+24}" fill="${color}" opacity=".5"/>`;
    case 'wave': {
      const heights = [14, 26, 40, 18, 34, 22, 30];
      let out = '';
      heights.forEach((h, i) => { out += `<rect x="${cx-49+i*16}" y="${cy-h/2}" width="8" height="${h}" rx="2" fill="${color}" opacity="${0.5+(i%3)*0.18}"/>`; });
      return out;
    }
    case 'layers':
      return `<rect x="${cx-30}" y="${cy-6}" width="52" height="34" rx="2" fill="none" stroke="${color}" stroke-width="2" opacity=".5"/>
              <rect x="${cx-18}" y="${cy-16}" width="52" height="34" rx="2" fill="none" stroke="${color}" stroke-width="2" opacity=".75"/>
              <rect x="${cx-6}" y="${cy-26}" width="52" height="34" rx="2" fill="${color}" opacity=".18" stroke="${color}" stroke-width="2"/>`;
    case 'plug':
      return `<rect x="${cx-22}" y="${cy-16}" width="44" height="32" rx="6" fill="none" stroke="${color}" stroke-width="2.5"/>
              <line x1="${cx-10}" y1="${cy-16}" x2="${cx-10}" y2="${cy-28}" stroke="${color}" stroke-width="2.5"/>
              <line x1="${cx+10}" y1="${cy-16}" x2="${cx+10}" y2="${cy-28}" stroke="${color}" stroke-width="2.5"/>
              <path d="M${cx} ${cy+16} q0 26 22 26" fill="none" stroke="${color}" stroke-width="2.5"/>`;
    case 'grain': {
      let out = '';
      const seedPts = [[10,-20],[-24,8],[30,14],[-8,-30],[18,26],[-34,-6],[4,4],[36,-14],[-18,30],[-2,-8],[24,-32],[-30,22]];
      seedPts.forEach((pt, i) => { out += `<circle cx="${cx+pt[0]}" cy="${cy+pt[1]}" r="${2+(i%3)}" fill="${color}" opacity="${0.3+(i%4)*0.15}"/>`; });
      return out;
    }
    default: return '';
  }
}
function assetSVG(p, w = 400, h = 225) {
  const id = 'g' + p.id.replace(/[^a-z0-9]/gi, '');
  const cx = w / 2, cy = h / 2 - 6;
  return `
  <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${p.name} preview">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${p.colorFrom}"/>
        <stop offset="100%" stop-color="${p.colorTo}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    <g opacity=".08">${Array.from({length:14}).map((_,i)=>`<line x1="${i*32}" y1="0" x2="${i*32-60}" y2="${h}" stroke="#000" stroke-width="1"/>`).join('')}</g>
    ${iconMarkup(p.icon, cx, cy, '#F4F2EC')}
    <text x="18" y="${h-16}" font-family="JetBrains Mono, monospace" font-size="10" letter-spacing="1" fill="#F4F2EC" opacity=".85">${p.formats||''}</text>
  </svg>`;
}
function tutorialSVG(t, w = 400, h = 225) {
  const sc = SOFTWARE_COLOR[t.software] || { from: '#FF7A3D', to: '#7A3115' };
  const id = 'tg' + t.id.replace(/[^a-z0-9]/gi, '');
  const cx = w / 2, cy = h / 2;
  return `
  <svg viewBox="0 0 ${w} ${h}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${t.title} thumbnail">
    <defs>
      <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="${sc.from}"/>
        <stop offset="100%" stop-color="${sc.to}"/>
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#${id})"/>
    <g opacity=".10">${Array.from({length:10}).map((_,i)=>`<line x1="0" y1="${i*(h/10)}" x2="${w}" y2="${i*(h/10)}" stroke="#000" stroke-width="1"/>`).join('')}</g>
    <circle cx="${cx}" cy="${cy}" r="30" fill="rgba(20,22,26,.45)" stroke="#F4F2EC" stroke-width="1.5"/>
    <polygon points="${cx-8},${cy-14} ${cx-8},${cy+14} ${cx+16},${cy}" fill="#F4F2EC"/>
    <text x="16" y="${h-16}" font-family="JetBrains Mono, monospace" font-size="11" font-weight="700" letter-spacing="1" fill="#F4F2EC">${SOFTWARE_ABBR[t.software]||''}</text>
    <text x="${w-16}" y="${h-16}" font-family="JetBrains Mono, monospace" font-size="10" letter-spacing="1" fill="#F4F2EC" opacity=".85" text-anchor="end">${fmtDuration(tutorialSeconds(t))}</text>
  </svg>`;
}
function scopeDecorSVG(size = 520, opacity = 1) {
  const cx = size / 2, cy = size / 2, r = size * 0.4;
  let dots = '';
  for (let i = 0; i < 70; i++) {
    const ang = (i * 137.5) % 360;
    const rad = r * (0.15 + 0.8 * ((i * 53) % 97) / 97);
    const x = cx + rad * Math.cos(ang * Math.PI / 180);
    const y = cy + rad * Math.sin(ang * Math.PI / 180);
    dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${1.4+(i%3)*0.5}" fill="var(--orange)" opacity="${0.25+(i%5)*0.12}"/>`;
  }
  return `<svg class="scope-ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="opacity:${opacity}">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--orange)" stroke-width="1" opacity=".5"/>
    <circle cx="${cx}" cy="${cy}" r="${r*0.62}" fill="none" stroke="var(--teal)" stroke-width="1" opacity=".4"/>
    <line x1="${cx-r}" y1="${cy}" x2="${cx+r}" y2="${cy}" stroke="var(--orange)" stroke-width=".6" opacity=".3"/>
    <line x1="${cx}" y1="${cy-r}" x2="${cx}" y2="${cy+r}" stroke="var(--orange)" stroke-width=".6" opacity=".3"/>
    ${dots}
  </svg>`;
}
function loaderSVG() {
  return `<svg class="loader" width="54" height="54" viewBox="0 0 54 54">
    <circle cx="27" cy="27" r="23" fill="none" stroke="var(--line-accent)" stroke-width="1.5"/>
    <line x1="27" y1="27" x2="27" y2="8" stroke="var(--orange)" stroke-width="2" stroke-linecap="round"/>
  </svg>`;
}
const ICON_ARROW = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;
const ICON_CHECK = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 13l4 4L19 7"/></svg>`;
const ICON_LOCK = `<svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M6 10V8a6 6 0 1112 0v2h1a1 1 0 011 1v9a2 2 0 01-2 2H6a2 2 0 01-2-2v-9a1 1 0 011-1h1zm2 0h8V8a4 4 0 00-8 0v2z"/></svg>`;

/* ============================= NAV / HEADER ============================= */
const NAV_LINKS = [
  { href: 'index.html', label: 'Home' },
  { href: 'shop.html', label: 'Shop' },
  { href: 'tutorials.html', label: 'Tutorials' },
  { href: 'about.html', label: 'About' },
  { href: 'contact.html', label: 'Contact' },
];
function currentFile() { return (location.pathname.split('/').pop() || 'index.html'); }
function renderNav() {
  const file = currentFile();
  const main = document.getElementById('main-nav');
  if (main) main.innerHTML = NAV_LINKS.map(l => `<a href="${l.href}" class="${file===l.href?'active':''}">${l.label}</a>`).join('');
  const mobile = document.getElementById('mobile-nav');
  if (mobile) {
    mobile.innerHTML = `<button class="mobile-nav-close" data-action="close-menu" aria-label="Close menu">&times;</button>` +
      NAV_LINKS.map(l => `<a href="${l.href}" data-action="close-menu">${l.label}</a>`).join('') +
      `<a href="cart.html" data-action="close-menu">Cart (${cartCount()})</a>
       <a href="${state.user ? 'account.html' : 'login.html'}" data-action="close-menu">${state.user ? 'Account' : 'Sign In'}</a>` +
      (state.user && state.user.role === 'admin' ? `<a href="admin.html" data-action="close-menu">Admin Panel</a>` : '');
  }
  const loginBtn = document.getElementById('account-btn');
  if (loginBtn) loginBtn.setAttribute('href', state.user ? 'account.html' : 'login.html');
  const adminLink = document.getElementById('admin-link');
  if (adminLink) adminLink.style.display = (state.user && state.user.role === 'admin') ? 'flex' : 'none';
}
function updateCartBadge() {
  const el = document.getElementById('cart-count');
  if (!el) return;
  const n = cartCount();
  el.textContent = n; el.style.display = n > 0 ? 'flex' : 'none';
}
let toastTimer;
function toast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

/* ============================= SHARED CARD MARKUP ============================= */
function cardMarkup(p) {
  return `
  <a class="card" href="product.html?id=${p.id}">
    <div class="card-media">${assetSVG(p, 400, 225)}</div>
    <div class="card-body">
      <div class="card-collection">${p.category}</div>
      <div class="card-name">${p.name}</div>
      <div class="card-spec">${p.fileCount||''} · ${p.formats||''}</div>
      <div class="card-foot">
        <div class="card-price">${money(p.price)}</div>
        <span class="badge">${p.software.length>1?'Multi-app':(p.software[0]||'Universal')}</span>
      </div>
    </div>
  </a>`;
}
function tutorialCardMarkup(t, pct = 0) {
  return `
  <a class="card" href="tutorial.html?id=${t.id}">
    <div class="card-media">${tutorialSVG(t, 400, 225)}</div>
    <div class="card-body">
      <div class="card-collection">${t.topic}</div>
      <div class="card-name">${t.title}</div>
      <div class="card-spec">${t.lessons.length} lessons · ${fmtDuration(tutorialSeconds(t))}</div>
      <div class="card-foot">
        <span class="badge badge-level">${t.level}</span>
        <span class="badge badge-teal">${t.software}</span>
      </div>
      ${pct>0 ? `<div class="progress-bar" style="margin-top:12px;margin-bottom:0;"><div class="progress-fill" style="width:${pct}%;"></div></div>` : ''}
    </div>
  </a>`;
}

/* ============================= PAGE RENDERERS ============================= */
async function renderHome() {
  const [products, tutorials] = await Promise.all([fetchProducts({ limit: 3 }), fetchTutorials()]);
  const featuredTutorials = tutorials.slice(0, 3);
  return `
  <section class="hero">
    <div class="hero-scope">${scopeDecorSVG(640,1)}</div>
    <div class="hero-inner">
      <div class="eyebrow" style="margin-bottom:20px;">Assets &amp; Training for the Edit Bay</div>
      <h1>Cut faster. <em>Grade better.</em> Learn the software properly.</h1>
      <p>LUTs, transitions, sound and templates for Premiere Pro, After Effects, DaVinci Resolve and more — plus a free tutorial system organized by the software you actually use.</p>
      <div class="hero-cta">
        <a class="btn btn-primary" href="shop.html">Shop Assets ${ICON_ARROW}</a>
        <a class="btn btn-ghost" href="tutorials.html">Browse Tutorials</a>
      </div>
      <div class="stat-row">
        <div class="stat"><b id="stat-products">—</b><span>Asset Packs</span></div>
        <div class="stat"><b>${tutorials.length}</b><span>Free Tutorials</span></div>
        <div class="stat"><b>5</b><span>NLEs Covered</span></div>
      </div>
    </div>
  </section>
  <section class="section-tight container">
    <div class="eyebrow" style="margin-bottom:18px;">Learn By Software</div>
    <div class="software-strip">
      ${SOFTWARE_LIST.map(s=>{
        const count = tutorials.filter(t=>t.software===s).length;
        return `<a class="software-tile" href="tutorials.html?software=${encodeURIComponent(s)}">
          <div class="badge" style="border-color:${SOFTWARE_COLOR[s].from};color:${SOFTWARE_COLOR[s].from};">${SOFTWARE_ABBR[s]}</div>
          <div class="sw-name">${s}</div>
          <div class="sw-count">${count} tutorial${count===1?'':'s'}</div>
        </a>`;
      }).join('')}
    </div>
  </section>
  <section class="section container">
    <div class="section-head"><div><div class="eyebrow" style="margin-bottom:10px;">In The Shop</div><h2>Featured Assets</h2></div><a href="shop.html" class="link-accent">View full shop</a></div>
    <div class="grid">${products.map(cardMarkup).join('')}</div>
  </section>
  <section class="banner">
    <div class="container banner-inner">
      <div class="eyebrow">Every tutorial is free — sign in once to track progress across every lesson.</div>
      <a href="tutorials.html" class="link-accent">Start learning</a>
    </div>
  </section>
  <section class="section container">
    <div class="section-head"><div><div class="eyebrow" style="margin-bottom:10px;">Free Training</div><h2>Popular Tutorials</h2></div><a href="tutorials.html" class="link-accent">Browse all tutorials</a></div>
    <div class="grid">${featuredTutorials.map(t=>tutorialCardMarkup(t)).join('')}</div>
  </section>
  <section class="section-tight container">
    <div class="split">
      <div>
        <div class="eyebrow" style="margin-bottom:14px;">Why CutLab</div>
        <h2 style="font-size:36px;margin-bottom:18px;">Built by editors who ship every week.</h2>
        <p style="color:var(--paper-soft);max-width:50ch;">Every pack is tested on real deadline work before it's released, and every tutorial is taught by someone who uses that software professionally — not a script reader.</p>
        <a class="btn btn-ghost" href="about.html" style="margin-top:24px;">Read our story</a>
      </div>
      <div style="display:flex;justify-content:center;">${scopeDecorSVG(320,.9)}</div>
    </div>
  </section>`;
}

async function renderShop() {
  const params = new URLSearchParams(location.search);
  const activeCat = params.get('cat') || 'All';
  const activeSw = params.get('sw') || 'All';
  const sort = params.get('sort') || 'featured';
  const [items, categories] = await Promise.all([
    fetchProducts({ category: activeCat, software: activeSw, sort }),
    fetchCategories(),
  ]);
  const cats = ['All', ...categories.map(c => c.name)];
  const softwares = ['All', 'Universal', ...SOFTWARE_LIST];
  const mk = (cat, sw) => `shop.html?cat=${encodeURIComponent(cat)}&sw=${encodeURIComponent(sw)}&sort=${sort}`;
  return `
  <section class="container section-tight">
    <div class="eyebrow" style="margin-bottom:10px;">${items.length} Asset Pack${items.length===1?'':'s'}</div>
    <div class="section-head">
      <h2>Shop Editing Assets</h2>
      <select class="field" id="sort-select" style="background:var(--ink-2);border:1px solid var(--line-accent);color:var(--paper);padding:11px 14px;">
        <option value="featured" ${sort==='featured'?'selected':''}>Sort: Featured</option>
        <option value="price-asc" ${sort==='price-asc'?'selected':''}>Price: Low to High</option>
        <option value="price-desc" ${sort==='price-desc'?'selected':''}>Price: High to Low</option>
        <option value="name" ${sort==='name'?'selected':''}>Name: A–Z</option>
      </select>
    </div>
    <div class="filter-group-label">Category</div>
    <div class="filter-bar">${cats.map(c=>`<a class="chip ${c===activeCat?'active':''}" href="${mk(c,activeSw)}">${c}</a>`).join('')}</div>
    <div class="filter-group-label">Software</div>
    <div class="filter-bar" style="margin-bottom:40px;">${softwares.map(s=>`<a class="chip ${s===activeSw?'active':''}" href="${mk(activeCat,s)}">${s}</a>`).join('')}</div>
    ${items.length ? `<div class="grid">${items.map(cardMarkup).join('')}</div>` :
      `<div class="empty-state"><div style="display:flex;justify-content:center;">${scopeDecorSVG(160,.5)}</div><p>No packs match those filters yet.</p><a class="btn btn-ghost" href="shop.html">Clear filters</a></div>`}
  </section>`;
}

let activeTab = 'description';
let productQty = 1;
async function renderProduct() {
  const params = new URLSearchParams(location.search);
  let p;
  try { p = await fetchProduct(params.get('id')); } catch (e) { return render404(); }
  const related = (await fetchProducts({ category: p.category })).filter(x => x.id !== p.id).slice(0, 3);
  return `
  <section class="container section-tight page-enter">
    <div class="breadcrumb"><a href="shop.html">Shop</a> / <a href="shop.html?cat=${encodeURIComponent(p.category)}">${p.category}</a> / ${p.name}</div>
    <div class="product-layout">
      <div class="product-media">${assetSVG(p,700,394)}</div>
      <div>
        <div class="eyebrow" style="margin-bottom:10px;">${p.category}</div>
        <h1 class="product-title">${p.name}</h1>
        <div class="product-ref">Ref. ${p.ref||''}</div>
        <div class="product-price">${money(p.price)}</div>
        <div class="badge-row">
          ${p.software.map(s=>`<span class="badge badge-teal">${s}</span>`).join('')}
          <span class="badge">${p.license||''}</span>
        </div>
        <p class="product-desc">${p.description||''}</p>
        <div class="qty-row">
          <div class="qty-control">
            <button data-action="qty-dec" aria-label="Decrease quantity">−</button>
            <span id="product-qty">${productQty}</span>
            <button data-action="qty-inc" aria-label="Increase quantity">+</button>
          </div>
          <span class="stock-note">Instant digital download</span>
        </div>
        <button class="btn btn-primary btn-block" data-action="add-to-cart" data-id="${p.id}">Add to Cart — ${money(p.price*productQty)}</button>
        <div class="tabs">
          <div class="tab-btns">
            <button class="tab-btn ${activeTab==='description'?'active':''}" data-action="tab" data-tab="description">Description</button>
            <button class="tab-btn ${activeTab==='specs'?'active':''}" data-action="tab" data-tab="specs">Specifications</button>
            <button class="tab-btn ${activeTab==='license'?'active':''}" data-action="tab" data-tab="license">License</button>
          </div>
          <div class="tab-panel">
            ${activeTab==='description' ? `<p>${p.description||''}</p>` : ''}
            ${activeTab==='specs' ? `
              <table class="spec-table">
                <tr><td>Compatible Software</td><td>${p.software.join(', ')}</td></tr>
                <tr><td>File Formats</td><td>${p.formats||''}</td></tr>
                <tr><td>Contents</td><td>${p.fileCount||''}</td></tr>
                <tr><td>Resolution</td><td>${p.resolution||''}</td></tr>
                <tr><td>Reference</td><td>${p.ref||''}</td></tr>
              </table>` : ''}
            ${activeTab==='license' ? `<p>Licensed for ${(p.license||'personal & commercial').toLowerCase()} use. Redistribution or resale of the raw files, even after modification, isn't permitted.</p>` : ''}
          </div>
        </div>
      </div>
    </div>
  </section>
  <section class="section container">
    <div class="section-head"><h2 style="font-size:26px;">You May Also Like</h2></div>
    <div class="grid">${related.map(cardMarkup).join('')}</div>
  </section>`;
}

async function renderTutorials() {
  const params = new URLSearchParams(location.search);
  const activeSw = params.get('software') || 'All';
  const activeLevel = params.get('level') || 'All';
  const activeTopic = params.get('topic') || 'All';
  const items = await fetchTutorials({ software: activeSw, level: activeLevel, topic: activeTopic });
  const allTutorials = (activeTopic === 'All') ? items : await fetchTutorials({ software: activeSw, level: activeLevel });
  const topics = ['All', ...Array.from(new Set(allTutorials.map(t => t.topic)))];
  const mk = (sw, lvl, tp) => `tutorials.html?software=${encodeURIComponent(sw)}&level=${encodeURIComponent(lvl)}&topic=${encodeURIComponent(tp)}`;
  return `
  <section class="container section-tight">
    <div class="eyebrow" style="margin-bottom:10px;">${items.length} Tutorial${items.length===1?'':'s'} · Free</div>
    <div class="section-head"><h2>Tutorial Library</h2></div>
    <div class="filter-group-label">Software</div>
    <div class="filter-bar">
      <a class="chip ${activeSw==='All'?'active':''}" href="${mk('All',activeLevel,activeTopic)}">All</a>
      ${SOFTWARE_LIST.map(s=>`<a class="chip ${s===activeSw?'active':''}" href="${mk(s,activeLevel,activeTopic)}">${s}</a>`).join('')}
    </div>
    <div class="filter-group-label">Level</div>
    <div class="filter-bar">
      <a class="chip ${activeLevel==='All'?'active':''}" href="${mk(activeSw,'All',activeTopic)}">All</a>
      ${['Beginner','Intermediate','Advanced'].map(l=>`<a class="chip ${l===activeLevel?'active':''}" href="${mk(activeSw,l,activeTopic)}">${l}</a>`).join('')}
    </div>
    <div class="filter-group-label">Topic</div>
    <div class="filter-bar" style="margin-bottom:40px;">
      ${topics.map(tp=>`<a class="chip ${tp===activeTopic?'active':''}" href="${mk(activeSw,activeLevel,tp)}">${tp}</a>`).join('')}
    </div>
    ${items.length ? `<div class="grid">${items.map(t=>tutorialCardMarkup(t)).join('')}</div>` :
      `<div class="empty-state"><div style="display:flex;justify-content:center;">${scopeDecorSVG(160,.5)}</div><p>No tutorials match those filters yet.</p><a class="btn btn-ghost" href="tutorials.html">Clear filters</a></div>`}
  </section>`;
}

async function renderTutorial() {
  const params = new URLSearchParams(location.search);
  let t;
  try { t = await fetchTutorial(params.get('id')); } catch (e) { return render404(); }

  let enrolled = null;
  if (state.user) {
    try {
      const r = await api('/api/enrollments/mine');
      enrolled = r.enrollments.find(e => e.tutorialId === t.id) || null;
    } catch (e) { /* ignore */ }
  }
  const pct = enrolled ? Math.round((enrolled.completed.length / t.lessons.length) * 100) : 0;
  const related = (await fetchTutorials({ software: t.software })).filter(x => x.id !== t.id).slice(0, 3);

  return `
  <section class="container section-tight page-enter">
    <div class="breadcrumb"><a href="tutorials.html">Tutorials</a> / <a href="tutorials.html?software=${encodeURIComponent(t.software)}">${t.software}</a> / ${t.title}</div>
    <div class="tutorial-hero">
      <div>
        <div class="player-mock">
          ${tutorialSVG(t,700,394)}
          <div class="player-controls">
            <span class="player-time">00:00</span>
            <div class="player-scrub"><div class="player-scrub-fill"></div></div>
            <span class="player-time">${fmtMMSS(t.lessons[0].duration)}</span>
          </div>
        </div>
        <div class="instructor-row">
          <div class="instructor-avatar">${(t.instructor||'').split(' ').map(w=>w[0]).join('')}</div>
          <div><div class="instructor-name">${t.instructor}</div><div class="instructor-role">${t.role}</div></div>
        </div>
        <p class="product-desc">${t.summary}</p>
      </div>
      <div>
        <div class="badge-row">
          <span class="badge badge-teal">${t.software}</span>
          <span class="badge badge-level">${t.level}</span>
          <span class="badge">${t.topic}</span>
        </div>
        <h1 class="product-title" style="font-size:30px;">${t.title}</h1>
        <div class="product-ref">${t.lessons.length} lessons · ${fmtDuration(tutorialSeconds(t))} total</div>
        ${enrolled ? `
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
          <div class="stock-note" style="margin-bottom:20px;">${pct}% complete · ${enrolled.completed.length}/${t.lessons.length} lessons</div>
        ` : `<p class="form-note" style="margin:16px 0 20px;">${state.user ? 'Start the course to check off lessons and track progress.' : 'Sign in and start the course to check off lessons and track progress.'}</p>`}
        <button class="btn btn-primary btn-block" data-action="${enrolled?'go-noop':'enroll'}" data-id="${t.id}">${enrolled? 'Continue Learning' : (state.user ? 'Start Course — Free' : 'Sign In to Start')}</button>
        <h3 style="font-size:16px;margin:36px 0 14px;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-faint);">Curriculum</h3>
        <div class="curriculum">
          ${t.lessons.map((l,i)=>{
            const done = enrolled && enrolled.completed.includes(i);
            const clickable = !!enrolled;
            return `<div class="lesson-row" ${clickable?`data-action="toggle-lesson" data-id="${t.id}" data-idx="${i}" style="cursor:pointer;"`:''}>
              <span class="lesson-check ${done?'done':''}">${done?ICON_CHECK:(clickable?'':ICON_LOCK)}</span>
              <span class="lesson-num">${String(i+1).padStart(2,'0')}</span>
              <span class="lesson-title">${l.title}</span>
              <span class="lesson-duration">${fmtMMSS(l.duration)}</span>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  </section>
  <section class="section container">
    <div class="section-head"><h2 style="font-size:26px;">More in ${t.software}</h2></div>
    <div class="grid">${related.map(x=>tutorialCardMarkup(x)).join('')}</div>
  </section>`;
}

async function renderCart() {
  const lines = await cartLines();
  if (!lines.length) {
    return `<section class="container section-tight"><div class="empty-state">
      <div style="display:flex;justify-content:center;">${scopeDecorSVG(160,.5)}</div>
      <h2 style="margin-top:20px;">Your cart is empty</h2>
      <p>No assets set aside yet. Browse the shop to find LUTs, transitions and templates.</p>
      <a class="btn btn-primary" href="shop.html">Shop Assets</a>
    </div></section>`;
  }
  const total = linesTotal(lines);
  return `
  <section class="container section-tight page-enter">
    <h1 style="font-size:36px;margin-bottom:38px;">Your Cart</h1>
    <div class="cart-grid">
      <table class="ledger">
        <thead><tr><th>Item</th><th>Qty</th><th>Price</th></tr></thead>
        <tbody>
          ${lines.map(l=>`
          <tr>
            <td>
              <div class="ledger-item">
                <div class="ledger-item-media">${assetSVG(l.product,200,113)}</div>
                <div>
                  <div class="ledger-item-name"><a href="product.html?id=${l.product.id}">${l.product.name}</a></div>
                  <div class="ledger-item-sub">${l.product.ref||''}</div>
                  <button class="remove-link" data-action="remove-cart" data-id="${l.id}">Remove</button>
                </div>
              </div>
            </td>
            <td>
              <div class="qty-control">
                <button data-action="cart-dec" data-id="${l.id}" aria-label="Decrease">−</button>
                <span>${l.qty}</span>
                <button data-action="cart-inc" data-id="${l.id}" aria-label="Increase">+</button>
              </div>
            </td>
            <td class="mono">${money(l.product.price*l.qty)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <div class="cart-summary">
        <div class="summary-row"><span>Subtotal</span><span class="mono">${money(total)}</span></div>
        <div class="summary-row"><span>Delivery</span><span class="mono">Instant download</span></div>
        <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
        <a class="btn btn-primary btn-block" style="margin-top:18px;" href="checkout.html">Proceed to Checkout ${ICON_ARROW}</a>
        <a class="btn btn-ghost btn-block" style="margin-top:12px;" href="shop.html">Continue Browsing</a>
      </div>
    </div>
  </section>`;
}

let checkoutStep = 1;
let checkoutData = { name: '', email: '', company: '', country: '', card: '', exp: '', cvc: '' };
async function renderCheckout() {
  if (!state.user) {
    return `<section class="container section-tight"><div class="empty-state">
      <div style="display:flex;justify-content:center;">${scopeDecorSVG(160,.5)}</div>
      <h2 style="margin-top:20px;">Sign in to check out</h2>
      <p>Orders are tied to your account so you can always find your downloads again.</p>
      <div style="display:flex;gap:14px;justify-content:center;">
        <a class="btn btn-primary" href="login.html?next=checkout.html">Sign In</a>
        <a class="btn btn-ghost" href="register.html?next=checkout.html">Create Account</a>
      </div>
    </div></section>`;
  }
  const lines = await cartLines();
  if (!lines.length) {
    return `<section class="container section-tight"><div class="empty-state"><p>Your cart is empty — add an asset pack before checking out.</p><a class="btn btn-primary" href="shop.html">Shop Assets</a></div></section>`;
  }
  if (!checkoutData.name) checkoutData.name = state.user.name;
  if (!checkoutData.email) checkoutData.email = state.user.email;
  const total = linesTotal(lines);
  return `
  <section class="container section-tight page-enter">
    <h1 style="font-size:34px;margin-bottom:36px;">Checkout</h1>
    <div class="stepper">
      <div class="step ${checkoutStep===1?'active':checkoutStep>1?'done':''}"><span class="step-index">01</span><span class="step-label">Billing</span></div>
      <div class="step ${checkoutStep===2?'active':checkoutStep>2?'done':''}"><span class="step-index">02</span><span class="step-label">Payment</span></div>
      <div class="step ${checkoutStep===3?'active':''}"><span class="step-index">03</span><span class="step-label">Review</span></div>
    </div>
    <div class="product-layout">
      <div>
        ${checkoutStep===1 ? `
        <form data-form="billing" class="form-card">
          <div class="field"><label>Full Name</label><input required name="name" value="${checkoutData.name}"></div>
          <div class="field"><label>Email — downloads are sent here</label><input required type="email" name="email" value="${checkoutData.email}"></div>
          <div class="field-row">
            <div class="field"><label>Company (optional)</label><input name="company" value="${checkoutData.company}"></div>
            <div class="field"><label>Country</label><input required name="country" value="${checkoutData.country}"></div>
          </div>
          <button class="btn btn-primary btn-block" type="submit">Continue to Payment ${ICON_ARROW}</button>
        </form>` : ''}
        ${checkoutStep===2 ? `
        <form data-form="payment" class="form-card">
          <div class="field"><label>Card Number</label><input required name="card" placeholder="4242 4242 4242 4242" value="${checkoutData.card}"></div>
          <div class="field-row">
            <div class="field"><label>Expiry</label><input required name="exp" placeholder="MM/YY" value="${checkoutData.exp}"></div>
            <div class="field"><label>CVC</label><input required name="cvc" placeholder="123" value="${checkoutData.cvc}"></div>
          </div>
          <p class="form-note">This is a demo storefront — no real payment is processed and card details are never stored.</p>
          <div style="display:flex;gap:12px;margin-top:10px;">
            <button type="button" class="btn btn-ghost" data-action="checkout-back">Back</button>
            <button class="btn btn-primary" type="submit" style="flex:1;">Review Order ${ICON_ARROW}</button>
          </div>
        </form>` : ''}
        ${checkoutStep===3 ? `
        <div class="form-card">
          <h3 style="font-size:18px;margin-bottom:16px;">Billing</h3>
          <p style="color:var(--paper-soft);font-size:14px;line-height:1.9;">${checkoutData.name}<br>${checkoutData.email}<br>${checkoutData.company?checkoutData.company+'<br>':''}${checkoutData.country}</p>
          <hr class="divider" style="margin:22px 0;">
          <h3 style="font-size:18px;margin-bottom:16px;">Payment</h3>
          <p style="color:var(--paper-soft);font-size:14px;">Card ending in ${(checkoutData.card||'').slice(-4).padStart(4,'•')}</p>
          <div style="display:flex;gap:12px;margin-top:26px;">
            <button type="button" class="btn btn-ghost" data-action="checkout-back">Back</button>
            <button class="btn btn-primary" data-action="place-order" style="flex:1;">Place Order — ${money(total)}</button>
          </div>
        </div>` : ''}
      </div>
      <div class="cart-summary">
        <div class="eyebrow" style="margin-bottom:16px;">Order Summary</div>
        ${lines.map(l=>`<div class="summary-row"><span>${l.product.name} × ${l.qty}</span><span class="mono">${money(l.product.price*l.qty)}</span></div>`).join('')}
        <div class="summary-row"><span>Delivery</span><span class="mono">Instant download</span></div>
        <div class="summary-row total"><span>Total</span><span>${money(total)}</span></div>
      </div>
    </div>
  </section>`;
}

async function renderConfirmation() {
  const params = new URLSearchParams(location.search);
  if (!state.user) return render404();
  let order;
  try { const r = await api('/api/orders/' + encodeURIComponent(params.get('order'))); order = r.order; }
  catch (e) { return render404(); }
  return `
  <section class="container">
    <div class="confirmation-box page-enter">
      ${scopeDecorSVG(150,.8)}
      <div class="eyebrow" style="margin:24px 0 10px;">Order Confirmed</div>
      <h1 style="font-size:34px;margin-bottom:16px;">Thanks, ${(order.billing.name||'').split(' ')[0]}.</h1>
      <p style="color:var(--paper-soft);margin-bottom:34px;">Order <span class="mono link-accent">#${order.id}</span> is ready. Download links have also been noted to ${order.billing.email}.</p>
      <div style="text-align:left;max-width:480px;margin:0 auto;">
        ${order.lines.map(l=>`
        <div class="download-row">
          <div><div class="fname">${l.name}</div><div class="fsize">Qty ${l.qty} · ${money(l.price)} each</div></div>
          <button class="btn btn-teal btn-sm" type="button">Download</button>
        </div>`).join('')}
      </div>
      <div style="display:flex;gap:14px;justify-content:center;margin-top:34px;">
        <a class="btn btn-primary" href="shop.html">Continue Shopping</a>
        <a class="btn btn-ghost" href="account.html">View Orders</a>
      </div>
    </div>
  </section>`;
}

function renderLogin() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || 'account.html';
  return `
  <section class="container section-tight page-enter" style="max-width:460px;">
    <div class="eyebrow" style="margin-bottom:10px;">Client Access</div>
    <h1 style="font-size:30px;margin-bottom:8px;">Sign In</h1>
    <p style="color:var(--paper-soft);font-size:14px;margin-bottom:30px;">Sign in to save your cart, unlock tutorial progress tracking, and view order history.</p>
    <form data-form="login" class="form-card" data-next="${next}">
      <div class="field"><label>Email</label><input required type="email" name="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input required type="password" name="password" placeholder="••••••••"></div>
      <button class="btn btn-primary btn-block" type="submit">Sign In</button>
      <p class="form-note">Don't have an account? <a class="link-accent" href="register.html?next=${encodeURIComponent(next)}">Register</a></p>
    </form>
  </section>`;
}

function renderRegister() {
  const params = new URLSearchParams(location.search);
  const next = params.get('next') || 'account.html';
  return `
  <section class="container section-tight page-enter" style="max-width:460px;">
    <div class="eyebrow" style="margin-bottom:10px;">Create an Account</div>
    <h1 style="font-size:30px;margin-bottom:8px;">Register</h1>
    <p style="color:var(--paper-soft);font-size:14px;margin-bottom:30px;">Free to join — track tutorial progress, view order history, and check out faster next time.</p>
    <form data-form="register" class="form-card" data-next="${next}">
      <div class="field"><label>Full Name</label><input required name="name" placeholder="Jordan Blake"></div>
      <div class="field"><label>Email</label><input required type="email" name="email" placeholder="you@example.com"></div>
      <div class="field"><label>Password</label><input required type="password" name="password" placeholder="At least 8 characters" minlength="8"></div>
      <button class="btn btn-primary btn-block" type="submit">Create Account</button>
      <p class="form-note">Already have an account? <a class="link-accent" href="login.html?next=${encodeURIComponent(next)}">Sign in</a></p>
    </form>
  </section>`;
}

let accountTab = 'orders';
async function renderAccount() {
  if (!state.user) {
    return `<section class="container section-tight"><div class="empty-state"><p>Sign in to view your orders, downloads and tutorial progress.</p><a class="btn btn-primary" href="login.html?next=account.html">Sign In</a></div></section>`;
  }
  const [ordersRes, enrollRes] = await Promise.all([
    api('/api/orders/mine').catch(() => ({ orders: [] })),
    api('/api/enrollments/mine').catch(() => ({ enrollments: [] })),
  ]);
  const orders = ordersRes.orders;
  const enrollments = enrollRes.enrollments;
  return `
  <section class="container section-tight page-enter">
    <div class="section-head">
      <div>
        <div class="eyebrow" style="margin-bottom:10px;">Account</div>
        <h1 style="font-size:32px;">${state.user.name}</h1>
        <p style="color:var(--paper-faint);font-size:13px;margin-top:6px;">${state.user.email}${state.user.role==='admin'?' · <span class="badge badge-teal" style="margin-left:4px;">Admin</span>':''}</p>
      </div>
      <div style="display:flex;gap:10px;">
        ${state.user.role==='admin' ? `<a class="btn btn-teal" href="admin.html">Admin Panel</a>` : ''}
        <button class="btn btn-ghost" data-action="logout">Sign Out</button>
      </div>
    </div>
    <div class="account-tabs">
      <button class="account-tab ${accountTab==='orders'?'active':''}" data-action="account-tab" data-tab="orders">Orders &amp; Downloads</button>
      <button class="account-tab ${accountTab==='learning'?'active':''}" data-action="account-tab" data-tab="learning">My Learning</button>
    </div>
    ${accountTab==='orders' ? (orders.length ? `
    <table class="ledger">
      <thead><tr><th>Order</th><th>Items</th><th>Total</th></tr></thead>
      <tbody>
        ${orders.map(o=>`
        <tr>
          <td><a class="link-accent" href="confirmation.html?order=${o.id}">#${o.id}</a><div class="ledger-item-sub">${new Date(o.createdAt).toLocaleDateString()}</div></td>
          <td>${o.lines.map(l=>l.name).join(', ')}</td>
          <td class="mono">${money(o.total)}</td>
        </tr>`).join('')}
      </tbody>
    </table>` : `<p style="color:var(--paper-soft);">No orders yet.</p><a class="btn btn-ghost" href="shop.html" style="margin-top:16px;">Start Shopping</a>`)
    : (enrollments.length ? enrollments.map(e=>{
        const pct = Math.round((e.completed.length/e.lessonCount)*100);
        const fakeTutorial = { id: e.tutorialId, software: e.software, title: e.title };
        return `<div class="learning-card">
          <div class="learning-media">${tutorialSVG({id:e.tutorialId, software:e.software, lessons:[{duration:0}]},300,169)}</div>
          <div style="flex:1;">
            <div class="card-collection">${e.software}</div>
            <a href="tutorial.html?id=${e.tutorialId}" class="ledger-item-name" style="font-size:17px;">${e.title}</a>
            <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;"></div></div>
            <div class="ledger-item-sub">${pct}% complete · ${e.completed.length}/${e.lessonCount} lessons</div>
          </div>
          <a class="btn btn-ghost btn-sm" href="tutorial.html?id=${e.tutorialId}">Continue</a>
        </div>`;
      }).join('') : `<p style="color:var(--paper-soft);">No courses started yet.</p><a class="btn btn-ghost" href="tutorials.html" style="margin-top:16px;">Browse Tutorials</a>`)}
  </section>`;
}

function renderAbout() {
  return `
  <section class="container section-tight page-enter">
    <div class="eyebrow" style="margin-bottom:14px;">Our Story</div>
    <h1 style="font-size:clamp(32px,4.4vw,50px);max-width:18ch;margin-bottom:26px;">Built by a Discord full of editors comparing notes at 1am.</h1>
    <div class="split">
      <p style="color:var(--paper-soft);font-size:17px;">CutLab started as a shared folder of LUTs a few of us kept trading back and forth between projects. It became a proper shop once we realized the tutorials people kept asking for were more valuable than any single preset — so those stayed free, organized by the software people actually open every day.</p>
      <div style="display:flex;justify-content:center;">${scopeDecorSVG(300,.9)}</div>
    </div>
    <hr class="divider" style="margin:56px 0;">
    <div class="stat-row" style="justify-content:space-between;">
      <div class="stat"><b>2019</b><span>Founded</span></div>
      <div class="stat"><b>5</b><span>NLEs Supported</span></div>
    </div>
  </section>`;
}

function renderContact() {
  return `
  <section class="container section-tight page-enter" style="max-width:600px;">
    <div class="eyebrow" style="margin-bottom:10px;">Get in Touch</div>
    <h1 style="font-size:30px;margin-bottom:10px;">Contact Support</h1>
    <p style="color:var(--paper-soft);font-size:14px;margin-bottom:30px;">Licensing questions, a download that won't open, or a tutorial request — write in and we'll reply within two business days.</p>
    <form data-form="contact" class="form-card">
      <div class="field"><label>Name</label><input required name="name"></div>
      <div class="field"><label>Email</label><input required type="email" name="email"></div>
      <div class="field"><label>Message</label><textarea required name="message" rows="5"></textarea></div>
      <button class="btn btn-primary btn-block" type="submit">Send Message</button>
    </form>
  </section>`;
}

function render404() {
  return `<section class="container section-tight"><div class="empty-state">
    <div style="display:flex;justify-content:center;">${scopeDecorSVG(160,.5)}</div>
    <h2 style="margin-top:20px;">Page not found</h2>
    <p>That page doesn't exist in the current catalog.</p>
    <a class="btn btn-primary" href="index.html">Return Home</a>
  </div></section>`;
}

const PAGE_RENDERERS = {
  home: renderHome, shop: renderShop, product: renderProduct, tutorials: renderTutorials, tutorial: renderTutorial,
  cart: renderCart, checkout: renderCheckout, confirmation: renderConfirmation, login: renderLogin, register: renderRegister,
  account: renderAccount, about: renderAbout, contact: renderContact,
  // 'admin' is registered by js/admin.js when that page loads it
};

async function renderPage() {
  const app = document.getElementById('app');
  if (!app) return;
  if (!state.loaded) {
    app.innerHTML = `<div class="loader-wrap">${loaderSVG()}<div class="eyebrow">Loading…</div></div>`;
    await initData();
  }
  const page = document.body.dataset.page || 'home';
  const fn = PAGE_RENDERERS[page] || render404;
  try {
    app.innerHTML = await fn();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<section class="container section-tight"><div class="empty-state"><h2>Something went wrong</h2><p>${e.message||'Please try again.'}</p><a class="btn btn-ghost" href="index.html">Return Home</a></div></section>`;
  }
  renderNav();
  updateCartBadge();
  const sortSel = document.getElementById('sort-select');
  if (sortSel) sortSel.addEventListener('change', () => {
    const params = new URLSearchParams(location.search);
    params.set('sort', sortSel.value);
    location.search = params.toString();
  });
}

/* ============================= EVENTS ============================= */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;

  if (action === 'open-menu') { document.getElementById('mobile-nav').classList.add('open'); return; }
  if (action === 'close-menu') { document.getElementById('mobile-nav').classList.remove('open'); return; }
  if (action === 'logout') {
    await api('/api/auth/logout').catch(() => {});
    state.user = null;
    toast('Signed out');
    location.href = 'index.html';
    return;
  }

  if (action === 'qty-inc') { productQty++; renderPage(); return; }
  if (action === 'qty-dec') { productQty = Math.max(1, productQty - 1); renderPage(); return; }
  if (action === 'add-to-cart') {
    const id = t.dataset.id;
    const cart = getCart();
    const existing = cart.find(c => c.id === id);
    if (existing) existing.qty += productQty; else cart.push({ id, qty: productQty });
    setCart(cart);
    toast(`Added ${productQty} × item to cart`);
    return;
  }
  if (action === 'cart-inc') { const cart = getCart(); const c = cart.find(c => c.id === t.dataset.id); c.qty++; setCart(cart); renderPage(); return; }
  if (action === 'cart-dec') {
    let cart = getCart();
    const c = cart.find(c => c.id === t.dataset.id);
    if (c.qty <= 1) cart = cart.filter(x => x.id !== t.dataset.id); else c.qty--;
    setCart(cart); renderPage(); return;
  }
  if (action === 'remove-cart') { setCart(getCart().filter(c => c.id !== t.dataset.id)); toast('Removed from cart'); renderPage(); return; }
  if (action === 'tab') { activeTab = t.dataset.tab; renderPage(); return; }
  if (action === 'account-tab') { accountTab = t.dataset.tab; renderPage(); return; }
  if (action === 'checkout-back') { checkoutStep = Math.max(1, checkoutStep - 1); renderPage(); return; }

  if (action === 'enroll') {
    if (!state.user) { location.href = 'login.html?next=' + encodeURIComponent(location.pathname.split('/').pop() + location.search); return; }
    try { await api('/api/enrollments', { body: { tutorialId: t.dataset.id } }); toast('Course started — good luck!'); renderPage(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (action === 'toggle-lesson') {
    try { await api(`/api/enrollments/${encodeURIComponent(t.dataset.id)}/toggle`, { method: 'PATCH', body: { lessonIndex: Number(t.dataset.idx) } }); renderPage(); }
    catch (err) { toast(err.message); }
    return;
  }

  if (action === 'place-order') {
    const lines = await cartLines();
    try {
      const r = await api('/api/orders', {
        body: { items: lines.map(l => ({ id: l.id, qty: l.qty })), billing: checkoutData },
      });
      setCart([]);
      checkoutStep = 1;
      location.href = 'confirmation.html?order=' + r.order.id;
    } catch (err) { toast(err.message); }
    return;
  }
  if (action === 'subscribe') {
    const emailInput = document.getElementById('newsletter-email');
    if (emailInput && emailInput.value) { toast('Subscribed with ' + emailInput.value); emailInput.value = ''; }
    return;
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  const type = form.dataset.form;
  const data = Object.fromEntries(new FormData(form).entries());

  if (type === 'billing') { checkoutData = { ...checkoutData, ...data }; checkoutStep = 2; renderPage(); return; }
  if (type === 'payment') { checkoutData = { ...checkoutData, ...data }; checkoutStep = 3; renderPage(); return; }

  if (type === 'login') {
    try {
      const r = await api('/api/auth/login', { body: { email: data.email, password: data.password } });
      state.user = r.user;
      toast('Welcome back, ' + r.user.name.split(' ')[0]);
      location.href = form.dataset.next || 'account.html';
    } catch (err) { toast(err.message); }
    return;
  }
  if (type === 'register') {
    try {
      const r = await api('/api/auth/register', { body: { name: data.name, email: data.email, password: data.password } });
      state.user = r.user;
      toast('Welcome, ' + r.user.name.split(' ')[0]);
      location.href = form.dataset.next || 'account.html';
    } catch (err) { toast(err.message); }
    return;
  }
  if (type === 'contact') { toast("Message sent — we'll be in touch shortly"); form.reset(); return; }
});

document.addEventListener('DOMContentLoaded', renderPage);
