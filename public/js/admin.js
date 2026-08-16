/* ==========================================================================
   CUTLAB — admin panel script (loaded only on admin.html, after app.js)
   Registers itself as the renderer for data-page="admin" and adds its own
   event delegation for admin-only actions. Everything here calls the real
   /api/* endpoints — there is no mock data in the admin panel.
   ========================================================================== */

let adminState = {
  tab: 'products', categories: [], products: [], orders: [], users: [],
  editingProductId: null, editingCategoryId: null,
};

// Multipart requests (product image/file uploads) can't go through api()'s
// JSON body — this sends a FormData body as-is and lets the browser set the
// multipart Content-Type header (with boundary) itself.
async function apiForm(path, formData, method = 'POST') {
  const res = await fetch(path, { method, credentials: 'include', body: formData });
  let data = {};
  try { data = await res.json(); } catch (e) { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function accessDeniedMarkup(message, href, label) {
  return `<section class="container section-tight"><div class="empty-state">
    <h2>Access Denied</h2>
    <p>${message}</p>
    <a class="btn btn-primary" href="${href}">${label || 'Go Back'}</a>
  </div></section>`;
}

async function renderAdmin() {
  if (!state.user) return accessDeniedMarkup('Sign in with an admin account to continue.', 'login.html?next=admin.html', 'Sign In');
  if (state.user.role !== 'admin') return accessDeniedMarkup("This account doesn't have admin access.", 'account.html', 'Back to Account');

  const [categories, products, ordersRes, usersRes] = await Promise.all([
    fetchCategories(),
    fetchProducts({}),
    api('/api/orders'),
    api('/api/users'),
  ]);
  adminState.categories = categories;
  adminState.products = products;
  adminState.orders = ordersRes.orders;
  adminState.users = usersRes.users;

  return `
  <section class="container section-tight page-enter">
    <div class="section-head">
      <div><div class="eyebrow" style="margin-bottom:10px;">Admin</div><h1 style="font-size:32px;">Control Panel</h1></div>
    </div>
    <div class="stat-row" style="margin:0 0 36px;">
      <div class="stat"><b>${products.length}</b><span>Products</span></div>
      <div class="stat"><b>${categories.length}</b><span>Categories</span></div>
      <div class="stat"><b>${adminState.orders.length}</b><span>Orders</span></div>
      <div class="stat"><b>${adminState.users.length}</b><span>Users</span></div>
    </div>
    <div class="account-tabs">
      ${['products','categories','orders','users'].map(tabName =>
        `<button class="account-tab ${adminState.tab===tabName?'active':''}" data-action="admin-tab" data-tab="${tabName}">${tabName[0].toUpperCase()+tabName.slice(1)}</button>`
      ).join('')}
    </div>
    ${adminState.tab==='products' ? renderAdminProducts() : ''}
    ${adminState.tab==='categories' ? renderAdminCategories() : ''}
    ${adminState.tab==='orders' ? renderAdminOrders() : ''}
    ${adminState.tab==='users' ? renderAdminUsers() : ''}
  </section>`;
}
PAGE_RENDERERS.admin = renderAdmin;

function renderAdminProducts() {
  const editing = adminState.editingProductId ? adminState.products.find(p => p.id === adminState.editingProductId) : null;
  return `
  <h3 style="font-size:16px;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-faint);margin-bottom:16px;">${editing ? 'Edit Product' : 'Add Product'}</h3>
  <form data-form="admin-product" class="form-card" data-editing="${adminState.editingProductId||''}" style="margin-bottom:44px;max-width:720px;">
    <div class="field-row">
      <div class="field"><label>Product Name</label><input required name="name" value="${editing?.name||''}"></div>
      <div class="field"><label>Category</label>
        <select required name="categoryId">
          ${adminState.categories.map(c=>`<option value="${c.id}" ${editing?.categoryId===c.id?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Price (USD)</label><input required type="number" step="0.01" min="0" name="price" value="${editing?.price??''}"></div>
      <div class="field"><label>Reference Code</label><input name="ref" value="${editing?.ref||''}" placeholder="Auto-generated if blank"></div>
    </div>
    <div class="field"><label>Compatible Software (comma-separated)</label><input name="software" value="${(editing?.software||[]).join(', ')}" placeholder="Premiere Pro, After Effects"></div>
    <div class="field-row">
      <div class="field"><label>File Formats</label><input name="formats" value="${editing?.formats||''}" placeholder=".mogrt, .aep"></div>
      <div class="field"><label>Contents</label><input name="fileCount" value="${editing?.fileCount||''}" placeholder="24 LUTs"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Resolution</label><input name="resolution" value="${editing?.resolution||''}" placeholder="4K"></div>
      <div class="field"><label>License</label><input name="license" value="${editing?.license||'Personal & Commercial'}"></div>
    </div>

    <div class="field-row">
      <div class="field">
        <label>Product Image${editing?.image ? ' (replace)' : ''}</label>
        <input type="file" name="image" accept="image/*">
        ${editing?.image
          ? `<div style="margin-top:10px;display:flex;align-items:center;gap:10px;">
               <img src="${editing.image}" alt="Current image" style="width:64px;height:36px;object-fit:cover;border:1px solid var(--line-accent);border-radius:2px;">
               <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--paper-faint);text-transform:none;letter-spacing:0;">
                 <input type="checkbox" name="removeImage" value="true" style="width:auto;"> Remove current image
               </label>
             </div>`
          : `<p class="form-note">No image uploaded yet — a generated thumbnail is shown instead.</p>`}
      </div>
      <div class="field">
        <label>Downloadable File${editing?.hasFile ? ' (replace)' : ''}</label>
        <input type="file" name="file">
        ${editing?.hasFile
          ? `<div style="margin-top:10px;">
               <div class="mono" style="font-size:12px;color:var(--paper-soft);">${editing.fileName} · ${formatBytes(editing.fileSize)}</div>
               <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--paper-faint);text-transform:none;letter-spacing:0;margin-top:8px;">
                 <input type="checkbox" name="removeFile" value="true" style="width:auto;"> Remove current file
               </label>
             </div>`
          : `<p class="form-note">No file uploaded yet — customers won't be able to download anything after buying this.</p>`}
      </div>
    </div>

    <div class="field-row">
      <div class="field"><label>Thumbnail Color — From</label><input type="color" name="colorFrom" value="${editing?.colorFrom||'#FF7A3D'}" style="height:46px;padding:4px;"></div>
      <div class="field"><label>Thumbnail Color — To</label><input type="color" name="colorTo" value="${editing?.colorTo||'#7A3115'}" style="height:46px;padding:4px;"></div>
    </div>
    <div class="field"><label>Thumbnail Icon <span style="text-transform:none;color:var(--paper-faint);">(used when no image is uploaded)</span></label>
      <select name="icon">${ICON_TYPES.map(i=>`<option value="${i}" ${editing?.icon===i?'selected':''}>${i}</option>`).join('')}</select>
    </div>
    <div class="field"><label>Description</label><textarea name="description" rows="3">${editing?.description||''}</textarea></div>
    <div style="display:flex;gap:12px;">
      <button class="btn btn-primary" type="submit" style="flex:1;">${editing ? 'Update Product' : 'Add Product'}</button>
      ${editing ? `<button type="button" class="btn btn-ghost" data-action="admin-cancel-edit">Cancel</button>` : ''}
    </div>
  </form>

  <h3 style="font-size:16px;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-faint);margin-bottom:16px;">All Products (${adminState.products.length})</h3>
  <table class="ledger">
    <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Files</th><th></th></tr></thead>
    <tbody>
      ${adminState.products.map(p=>`
      <tr>
        <td><div class="ledger-item"><div class="ledger-item-media" style="width:70px;">${productMediaMarkup(p,140,79)}</div><div class="ledger-item-name" style="font-size:14px;">${p.name}</div></div></td>
        <td style="font-size:13px;">${p.category}</td>
        <td class="mono">${money(p.price)}</td>
        <td style="font-size:12px;">
          <span class="badge ${p.image?'badge-teal':''}" style="margin-right:4px;">${p.image?'Image':'No image'}</span>
          <span class="badge ${p.hasFile?'badge-teal':''}">${p.hasFile?'File':'No file'}</span>
        </td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" data-action="admin-edit-product" data-id="${p.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="admin-delete-product" data-id="${p.id}" style="color:var(--rose);">Delete</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function renderAdminCategories() {
  const editing = adminState.editingCategoryId ? adminState.categories.find(c => c.id === adminState.editingCategoryId) : null;
  return `
  <h3 style="font-size:16px;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-faint);margin-bottom:16px;">${editing ? 'Edit Category' : 'Add Category'}</h3>
  <form data-form="admin-category" class="form-card" data-editing="${adminState.editingCategoryId||''}" style="max-width:520px;margin-bottom:44px;">
    <div class="field"><label>Category Name</label><input required name="name" value="${editing?.name||''}" placeholder="e.g. Stock Footage"></div>
    <div class="field-row">
      <div class="field"><label>Color — From</label><input type="color" name="colorFrom" value="${editing?.colorFrom||'#FF7A3D'}" style="height:46px;padding:4px;"></div>
      <div class="field"><label>Color — To</label><input type="color" name="colorTo" value="${editing?.colorTo||'#7A3115'}" style="height:46px;padding:4px;"></div>
    </div>
    <div class="field"><label>Icon</label>
      <select name="icon">${ICON_TYPES.map(i=>`<option value="${i}" ${editing?.icon===i?'selected':''}>${i}</option>`).join('')}</select>
    </div>
    <div style="display:flex;gap:12px;">
      <button class="btn btn-primary" type="submit" style="flex:1;">${editing ? 'Update Category' : 'Add Category'}</button>
      ${editing ? `<button type="button" class="btn btn-ghost" data-action="admin-cancel-edit-category">Cancel</button>` : ''}
    </div>
  </form>
  <h3 style="font-size:16px;text-transform:uppercase;letter-spacing:.06em;color:var(--paper-faint);margin-bottom:16px;">All Categories (${adminState.categories.length})</h3>
  <table class="ledger">
    <thead><tr><th>Category</th><th>Products</th><th></th></tr></thead>
    <tbody>
      ${adminState.categories.map(c=>`
      <tr>
        <td><div style="display:flex;align-items:center;gap:12px;">
          <span style="width:30px;height:30px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;background:linear-gradient(135deg, ${c.colorFrom}, ${c.colorTo});">${categoryIconSVG(c.icon,'#14161A',17)}</span>
          ${c.name}
        </div></td>
        <td class="mono">${c.product_count}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm" data-action="admin-edit-category" data-id="${c.id}">Edit</button>
          <button class="btn btn-ghost btn-sm" data-action="admin-delete-category" data-id="${c.id}" style="color:var(--rose);">Delete</button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>
  <p class="form-note" style="margin-top:14px;">A category can't be deleted while products still reference it — reassign or delete those products first.</p>`;
}

function renderAdminOrders() {
  if (!adminState.orders.length) return `<p style="color:var(--paper-soft);">No orders yet.</p>`;
  return `
  <table class="ledger">
    <thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Total</th><th>Date</th></tr></thead>
    <tbody>
      ${adminState.orders.map(o=>`
      <tr>
        <td class="mono">#${o.id}</td>
        <td>${o.userName}<div class="ledger-item-sub">${o.userEmail}</div></td>
        <td style="font-size:13px;max-width:260px;">${o.lines.map(l=>l.name+' ×'+l.qty).join(', ')}</td>
        <td class="mono">${money(o.total)}</td>
        <td style="font-size:12px;color:var(--paper-faint);">${new Date(o.createdAt).toLocaleDateString()}</td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

function renderAdminUsers() {
  return `
  <table class="ledger">
    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead>
    <tbody>
      ${adminState.users.map(u=>`
      <tr>
        <td>${u.name}</td>
        <td style="font-size:13px;">${u.email}</td>
        <td><span class="badge ${u.role==='admin'?'badge-teal':''}">${u.role}</span></td>
        <td style="font-size:12px;color:var(--paper-faint);">${new Date(u.created_at).toLocaleDateString()}</td>
        <td>
          <button class="btn btn-ghost btn-sm" data-action="admin-toggle-role" data-id="${u.id}" data-role="${u.role==='admin'?'customer':'admin'}">
            ${u.role==='admin'?'Demote':'Promote to Admin'}
          </button>
        </td>
      </tr>`).join('')}
    </tbody>
  </table>`;
}

/* ============================= ADMIN EVENTS ============================= */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  const action = t.dataset.action;

  if (action === 'admin-tab') { adminState.tab = t.dataset.tab; adminState.editingProductId = null; adminState.editingCategoryId = null; renderPage(); return; }
  if (action === 'admin-edit-product') { adminState.editingProductId = t.dataset.id; renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (action === 'admin-cancel-edit') { adminState.editingProductId = null; renderPage(); return; }
  if (action === 'admin-edit-category') { adminState.editingCategoryId = Number(t.dataset.id); renderPage(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
  if (action === 'admin-cancel-edit-category') { adminState.editingCategoryId = null; renderPage(); return; }

  if (action === 'admin-delete-product') {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try { await api('/api/products/' + encodeURIComponent(t.dataset.id), { method: 'DELETE' }); toast('Product deleted'); renderPage(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (action === 'admin-delete-category') {
    if (!confirm('Delete this category?')) return;
    try { await api('/api/categories/' + t.dataset.id, { method: 'DELETE' }); toast('Category deleted'); renderPage(); }
    catch (err) { toast(err.message); }
    return;
  }
  if (action === 'admin-toggle-role') {
    try { await api('/api/users/' + t.dataset.id + '/role', { method: 'PATCH', body: { role: t.dataset.role } }); toast('Role updated'); renderPage(); }
    catch (err) { toast(err.message); }
    return;
  }
});

document.addEventListener('submit', async (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  const type = form.dataset.form;
  if (type !== 'admin-product' && type !== 'admin-category') return; // app.js owns the rest
  e.preventDefault();

  if (type === 'admin-product') {
    const editingId = form.dataset.editing;
    const formData = new FormData(form); // includes text fields + any chosen image/file + checkboxes
    try {
      if (editingId) { await apiForm('/api/products/' + encodeURIComponent(editingId), formData, 'PUT'); toast('Product updated'); }
      else { await apiForm('/api/products', formData, 'POST'); toast('Product added'); }
      adminState.editingProductId = null;
      renderPage();
    } catch (err) { toast(err.message); }
    return;
  }
  if (type === 'admin-category') {
    const editingId = form.dataset.editing;
    const data = Object.fromEntries(new FormData(form).entries());
    const payload = { name: data.name, icon: data.icon, colorFrom: data.colorFrom, colorTo: data.colorTo };
    try {
      if (editingId) { await api('/api/categories/' + editingId, { method: 'PUT', body: payload }); toast('Category updated'); }
      else { await api('/api/categories', { body: payload }); toast('Category added'); }
      adminState.editingCategoryId = null;
      renderPage();
    } catch (err) { toast(err.message); }
    return;
  }
});
