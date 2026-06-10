// ── Auth state ────────────────────────────────────────────────────────────────
let currentUser = null;

async function loadUser() {
  try {
    const res = await fetch('/api/auth/me', { credentials: 'include' });
    if (res.ok) currentUser = (await res.json()).user;
  } catch {}

  const greeting         = document.getElementById('navGreeting');
  const loginLink        = document.getElementById('navLoginLink');
  const logoutBtn        = document.getElementById('navLogoutBtn');
  const adminLink        = document.getElementById('navAdminLink');
  const ordersLink       = document.getElementById('navOrdersLink');
  const footerOrdersLink = document.getElementById('footerOrdersLink');
  const footerLoginLink  = document.getElementById('footerLoginLink');

  if (currentUser) {
    if (greeting)         { greeting.textContent = `Hi, ${currentUser.name.split(' ')[0]} 👋`; greeting.classList.remove('hidden'); }
    if (loginLink)        loginLink.classList.add('hidden');
    if (logoutBtn)        logoutBtn.classList.remove('hidden');
    if (ordersLink)       ordersLink.classList.remove('hidden');
    if (footerOrdersLink) footerOrdersLink.classList.remove('hidden');
    if (footerLoginLink)  footerLoginLink.classList.add('hidden');
    if (adminLink && currentUser.role === 'admin') adminLink.classList.remove('hidden');
  }

  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      location.reload();
    });
  }
}

// ── Category nav ──────────────────────────────────────────────────────────────
const heroData = {
  '':          { title: 'New Season,<br/><em style="font-style:italic;color:#f9a8d4;">New Style.</em>', sub: 'Discover our latest collection of premium fashion pieces curated just for you.', bg: 'https://images.unsplash.com/photo-1441984904996-e0b6ba687e04?w=1400&q=60' },
  'Women':     { title: 'Women\'s<br/><em style="font-style:italic;color:#f9a8d4;">Collection</em>',   sub: 'Elegant dresses, tops, accessories and more — curated for the modern woman.',       bg: 'https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=1400&q=60' },
  'Men':       { title: 'Men\'s<br/><em style="font-style:italic;color:#93c5fd;">Collection</em>',     sub: 'Sharp shirts, jeans, shoes and accessories for the well-dressed man.',               bg: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=1400&q=60' },
  'Kids':      { title: 'Kids\'<br/><em style="font-style:italic;color:#86efac;">Collection</em>',     sub: 'Fun, comfortable and durable clothing for your little ones.',                        bg: 'https://images.unsplash.com/photo-1519238263530-99bdd11df2ea?w=1400&q=60' },
  'Cosmetics': { title: 'Beauty &<br/><em style="font-style:italic;color:#f9a8d4;">Cosmetics</em>',   sub: 'Premium makeup, skincare and fragrances for your beauty routine.',                   bg: 'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1400&q=60' },
};

let activeCategory = '';

function setCategory(cat) {
  activeCategory = cat;

  // Update category nav buttons
  document.querySelectorAll('.cat-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.cat === cat);
  });

  // Update hero
  const h = heroData[cat] || heroData[''];
  const heroEl = document.getElementById('heroSection');
  if (heroEl) {
    heroEl.style.backgroundImage = `linear-gradient(180deg,rgba(15,15,26,.3) 0%,rgba(15,15,26,.7) 100%), url('${h.bg}')`;
    heroEl.style.backgroundSize = 'cover';
    heroEl.style.backgroundPosition = 'center';
  }
  const titleEl = document.getElementById('heroTitle');
  const subEl   = document.getElementById('heroSub');
  if (titleEl) titleEl.innerHTML = h.title;
  if (subEl)   subEl.textContent = h.sub;

  // Update section title
  const sectionTitle = document.getElementById('sectionTitle');
  if (sectionTitle) sectionTitle.textContent = cat ? `${cat}'s Collection` : 'All Products';

  loadProducts();
}

document.querySelectorAll('.cat-nav-btn').forEach(btn => {
  btn.addEventListener('click', () => setCategory(btn.dataset.cat));
});

// ── Products ──────────────────────────────────────────────────────────────────
let allProducts = [];

async function loadProducts() {
  try {
    const params = new URLSearchParams();
    const search = document.getElementById('searchInput')?.value.trim();
    if (search)          params.set('search', search);
    if (activeCategory)  params.set('category', activeCategory);

    const data   = await fetch(`/api/products?${params}`, { credentials: 'include' }).then(r => r.json());
    allProducts  = data.products || [];
    renderProducts(getSorted(allProducts));
  } catch (err) {
    // Failed to load products — silently ignore in UI
  }
}

function getSorted(products) {
  const sort = document.getElementById('sortFilter')?.value;
  const list = [...products];
  if (sort === 'price-asc')  list.sort((a, b) => a.price - b.price);
  if (sort === 'price-desc') list.sort((a, b) => b.price - a.price);
  if (sort === 'name-asc')   list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

function parseSizes(sizes) {
  return (sizes || '').split(',').map(s => s.trim()).filter(Boolean);
}

function parseColors(colors) {
  return (colors || '').split(',').map(c => c.trim()).filter(Boolean);
}

function renderProducts(products) {
  const grid  = document.getElementById('productGrid');
  const empty = document.getElementById('emptyMsg');
  if (!grid) return;
  grid.innerHTML = '';

  if (!products.length) {
    empty?.classList.remove('hidden');
    return;
  }
  empty?.classList.add('hidden');

  products.forEach(p => {
    const priceKES = Math.ceil(p.price * 130);
    const sizeList = parseSizes(p.sizes);
    const colorList = parseColors(p.colors);
    const hasSizes = sizeList.length > 0;
    const hasColors = colorList.length > 0;

    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="product-img-wrap">
        ${p.image_url
          ? `<img src="${p.image_url}" alt="${p.name}" loading="lazy" />`
          : `<div class="no-img">🖼️<span>No image</span></div>`}
        ${p.stock === 0 ? '<span class="out-badge">Out of Stock</span>' : ''}
      </div>
      <div class="product-info">
        <div class="product-tags">
          ${p.category ? `<span class="category-tag">${p.category}</span>` : ''}
          ${p.item_type ? `<span class="type-tag">${p.item_type}</span>` : ''}
        </div>
        <h3>${p.name}</h3>
        <p class="product-desc">${p.description || ''}</p>
        ${hasSizes ? `
          <div class="size-selector">
            <div class="size-selector-head">
              <span class="size-label">Select size</span>
              <span class="size-required">Required</span>
            </div>
            <div class="size-options">
              ${sizeList.map(s => `<button type="button" class="size-btn" data-size="${s}">${s}</button>`).join('')}
            </div>
          </div>` : ''}
        ${hasColors ? `
          <div class="size-selector color-selector">
            <div class="size-selector-head">
              <span class="size-label">Select color</span>
              <span class="size-required">Required</span>
            </div>
            <div class="color-options">
              ${colorList.map(c => `<button type="button" class="color-btn" data-color="${c}">${c}</button>`).join('')}
            </div>
          </div>` : ''}
        <div class="product-footer">
          <span class="price">KES ${priceKES.toLocaleString()}</span>
          <span class="stock-label ${p.stock === 0 ? 'out' : p.stock < 5 ? 'low' : ''}">
            ${p.stock === 0 ? 'Out of stock' : p.stock < 5 ? `Only ${p.stock} left` : `${p.stock} in stock`}
          </span>
        </div>
        <button class="btn-primary add-to-cart" data-id="${p.id}" ${p.stock === 0 ? 'disabled' : ''}>
          Add to Cart
        </button>
      </div>
    `;

    // Size button selection
    let selectedSize = null;
    let selectedColor = null;
    card.querySelectorAll('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedSize = btn.dataset.size;
      });
    });
    card.querySelectorAll('.color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        card.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedColor = btn.dataset.color;
      });
    });

    card.querySelector('.add-to-cart').addEventListener('click', () => {
      if (!currentUser) return (location.href = '/login.html');
      if (hasSizes && !selectedSize) {
        // Shake the size selector to prompt selection
        const sel = card.querySelector('.size-selector');
        sel.classList.add('shake');
        setTimeout(() => sel.classList.remove('shake'), 600);
        return;
      }
      if (hasColors && !selectedColor) {
        const sel = card.querySelector('.color-selector');
        sel.classList.add('shake');
        setTimeout(() => sel.classList.remove('shake'), 600);
        return;
      }
      Cart.add(p, 1, selectedSize, selectedColor);
      showFeedback(card);
    });

    grid.appendChild(card);
  });
}

function showFeedback(card) {
  const btn = card.querySelector('.add-to-cart');
  const orig = btn.textContent;
  btn.textContent = '✓ Added!';
  btn.style.background = '#16a34a';
  setTimeout(() => { btn.textContent = orig; btn.style.background = ''; }, 1400);
}

// ── Cart sidebar ──────────────────────────────────────────────────────────────
function renderCart() {
  const items     = Cart.get();
  const container = document.getElementById('cartItems');
  const countEl   = document.getElementById('cartCount');
  const totalEl   = document.getElementById('cartTotal');
  if (!container) return;

  const totalKES = Math.ceil(Cart.total() * 130);
  if (countEl) { countEl.textContent = Cart.count(); countEl.style.display = Cart.count() > 0 ? 'flex' : 'none'; }
  if (totalEl) totalEl.textContent = `KES ${totalKES.toLocaleString()}`;
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = `<div class="empty-cart"><div class="empty-cart-icon">🛒</div><p>Your cart is empty</p><small>Add some items to get started!</small></div>`;
    return;
  }

  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'cart-item';
    const sizeTag = item.size ? `<span class="cart-size-tag">Size: ${item.size}</span>` : '';
    const colorTag = item.color ? `<span class="cart-color-tag">Color: ${item.color}</span>` : '';
    row.innerHTML = `
      <img src="${item.image_url || ''}" alt="${item.name}" onerror="this.style.display='none'" />
      <div class="cart-item-info">
        <p class="cart-item-name">${item.name}</p>
        ${sizeTag}
        ${colorTag}
        <p class="cart-item-price">KES ${Math.ceil(item.price * 130).toLocaleString()} each</p>
      </div>
      <div class="cart-item-actions">
        <button class="qty-btn" onclick="Cart.updateQty(${item.id}, ${item.quantity - 1}, ${JSON.stringify(item.size)}, ${JSON.stringify(item.color)})">−</button>
        <span class="qty-num">${item.quantity}</span>
        <button class="qty-btn" onclick="Cart.updateQty(${item.id}, ${item.quantity + 1}, ${JSON.stringify(item.size)}, ${JSON.stringify(item.color)})">+</button>
        <button class="remove-btn" onclick="Cart.remove(${item.id}, ${JSON.stringify(item.size)}, ${JSON.stringify(item.color)})" title="Remove item">Remove</button>
      </div>
    `;
    container.appendChild(row);
  });
}

function openCart()  { document.getElementById('cartSidebar').classList.add('open'); document.getElementById('cartOverlay').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeCart() { document.getElementById('cartSidebar').classList.remove('open'); document.getElementById('cartOverlay').classList.remove('open'); document.body.style.overflow = ''; }

document.getElementById('cartBtn')?.addEventListener('click', openCart);
document.getElementById('closeCart')?.addEventListener('click', closeCart);
document.getElementById('closeCartBottom')?.addEventListener('click', closeCart);
document.getElementById('cartOverlay')?.addEventListener('click', closeCart);
document.getElementById('checkoutBtn')?.addEventListener('click', () => {
  if (!currentUser) return (location.href = '/login.html');
  if (Cart.count() === 0) return;
  closeCart();
  location.href = '/checkout.html';
});

window.addEventListener('cartUpdated', renderCart);

// ── Search & sort ─────────────────────────────────────────────────────────────
let searchTimer;
document.getElementById('searchInput')?.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadProducts, 300);
});
document.getElementById('sortFilter')?.addEventListener('change', () => {
  renderProducts(getSorted(allProducts));
});

// ── Init ──────────────────────────────────────────────────────────────────────
// Check URL for category param (from About Us page links)
const urlCat = new URLSearchParams(location.search).get('category') || '';
loadUser();
setCategory(urlCat);
renderCart();
