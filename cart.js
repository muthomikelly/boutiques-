/**
 * Cart — stored in localStorage
 * cart = [{ id, name, price, image_url, quantity, size, color, sizes, colors }]
 * Items with the same product id but different sizes/colors are separate entries.
 */
const Cart = (() => {
  const KEY = 'boutique_cart';

  function get() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch { return []; }
  }

  function save(cart) {
    localStorage.setItem(KEY, JSON.stringify(cart.map(normalizeItem)));
    window.dispatchEvent(new Event('cartUpdated'));
  }

  function normalizeOption(value) {
    return value === undefined || value === '' ? null : value;
  }

  function normalizeId(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : String(value);
  }

  function normalizeItem(item) {
    return {
      ...item,
      size: normalizeOption(item.size),
      color: normalizeOption(item.color),
    };
  }

  function sameSelection(item, productId, size = null, color = null) {
    return normalizeId(item.id) === normalizeId(productId) &&
      normalizeOption(item.size) === normalizeOption(size) &&
      normalizeOption(item.color) === normalizeOption(color);
  }

  // Add product to cart. size/color are required when product defines those options.
  function add(product, qty = 1, size = null, color = null) {
    const cart = get();
    const existing = cart.find(i => sameSelection(i, product.id, size, color));
    if (existing) {
      existing.quantity += qty;
    } else {
      cart.push({
        id:        product.id,
        name:      product.name,
        price:     product.price,
        image_url: product.image_url,
        sizes:     product.sizes || null,
        colors:    product.colors || null,
        size:      normalizeOption(size),
        color:     normalizeOption(color),
        quantity:  qty,
      });
    }
    save(cart);
  }

  function remove(productId, size = null, color = null) {
    save(get().filter(i => !sameSelection(i, productId, size, color)));
  }

  function updateQty(productId, qty, size = null, color = null) {
    const cart = get();
    const item = cart.find(i => sameSelection(i, productId, size, color));
    if (item) {
      item.quantity = qty;
      if (item.quantity <= 0) return remove(productId, size, color);
    }
    save(cart);
  }

  function clear() { save([]); }

  function total() {
    return get().reduce((sum, i) => sum + i.price * i.quantity, 0);
  }

  function count() {
    return get().reduce((sum, i) => sum + i.quantity, 0);
  }

  return { get, add, remove, updateQty, clear, total, count };
})();

window.Cart = Cart;
