/**
 * AURORA — tienda online.
 *
 * Una sola página (SPA con rutas por hash) que funciona en dos modos:
 *
 *   - con API disponible  -> el catálogo y los pedidos salen del servidor
 *                            (tienda real o mock), y el checkout crea un
 *                            pedido de verdad contra la tienda.
 *   - sin API             -> modo demo: usa el catálogo estático exportado
 *                            y guarda el carrito en el navegador. Es lo que
 *                            sirve el despliegue público.
 *
 * Cuatro idiomas (en/es/ro/hu), precios con IVA incluido según el país de
 * impuestos de la tienda, imágenes reales cuando las hay y pago con Stripe
 * cuando está configurado.
 *
 * No hay LLM aquí. Esto es la tienda; el lado agente vive en /tools.
 */

const API = { base: null, mode: 'demo' };

const state = {
  catalogue: null,
  products: [],
  categories: [],
  settings: {
    currency: 'EUR',
    taxCountry: 'ES',
    vatRate: 21,
    pricesIncludeTax: true,
    freeShippingThreshold: 50,
    shippingFlatRate: 4.9,
  },
  locale: 'en',
  cart: [],
  category: 'all',
  theme: null,
  themes: [],
  view: 'home',
  productId: null,
  variantId: null,
  qty: 1,
  checkout: null,
};

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ------------------------------------------------------------------ i18n */

const LOCALE_NAMES = { en: 'English', es: 'Español', ro: 'Română', hu: 'Magyar' };

function table() {
  const all = window.__I18N__ || {};
  return all[state.locale] || all.en || {};
}

function t(key, vars = {}) {
  const strings = table();
  let text = strings[key] ?? (window.__I18N__?.en?.[key] ?? key);
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  }
  return text;
}

function applyTranslations() {
  document.documentElement.lang = state.locale;
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of $$('[data-i18n-html]')) el.innerHTML = t(el.dataset.i18nHtml);
  const select = $('#langSelect');
  if (select && !select.options.length) {
    for (const [code, name] of Object.entries(LOCALE_NAMES)) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = name;
      select.appendChild(option);
    }
    select.onchange = () => {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', select.value);
      window.location.href = url.toString();
    };
  }
  if (select) select.value = state.locale;
}

/* --------------------------------------------------------------- dinero */

function vatRate() {
  return Number(state.settings.vatRate ?? 21);
}

/** Net price -> the price the customer sees. */
function displayPrice(net) {
  const value = Number(net) || 0;
  return state.settings.pricesIncludeTax ? value * (1 + vatRate() / 100) : value;
}

function money(amount, alreadyGross = false) {
  const value = alreadyGross ? Number(amount) || 0 : displayPrice(amount);
  try {
    return new Intl.NumberFormat(state.locale, {
      style: 'currency',
      currency: state.settings.currency || 'EUR',
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${state.settings.currency || 'EUR'}`;
  }
}

/* ------------------------------------------------------------- utilidades */

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < String(str).length; i += 1) {
    h ^= String(str).charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed) {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PALETTES = {
  Apparel: ['#ece5d6', '#cdd9c4', '#1f6b3a'],
  Home: ['#f6ece0', '#e6d2c0', '#b0533a'],
  Bags: ['#e2eaee', '#bccbd1', '#22333a'],
  Paper: ['#f8f1e3', '#e9ddc4', '#7a6a4a'],
};

/** Illustration generated deterministically from the product id. */
function art(product, size = 400) {
  const theme = state.theme;
  const fallback = PALETTES[product.category] || PALETTES[product.productType] || PALETTES.Home;
  const r = rng(hash(product.id));
  const w = size;
  const h = size;
  const c1 = theme?.palette?.artA || fallback[0];
  const c2 = theme?.palette?.artB || fallback[1];
  const ink = theme?.palette?.accent || fallback[2];
  const pick = (a, b) => a + r() * (b - a);
  const cx = pick(w * 0.22, w * 0.78);
  const cy = pick(h * 0.22, h * 0.78);
  const rad = pick(w * 0.18, w * 0.34);
  const ring = pick(w * 0.26, w * 0.42);
  const rx = pick(w * 0.12, w * 0.4);
  const ry = pick(h * 0.08, h * 0.3);
  const angle = Math.floor(r() * 90);

  let dots = '';
  for (let i = 0; i < 5; i += 1) {
    dots += `<circle cx="${pick(0, w).toFixed(0)}" cy="${pick(0, h).toFixed(0)}" r="${pick(3, 9).toFixed(0)}" fill="${ink}" opacity="0.28"/>`;
  }

  return `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(product.title)}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g-${hash(product.id)}" gradientTransform="rotate(${angle})">
      <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g-${hash(product.id)})"/>
  <rect x="0" y="${(h * 0.78).toFixed(0)}" width="${w}" height="${(h * 0.22).toFixed(0)}" fill="${ink}" opacity="0.08"/>
  <circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${rad.toFixed(0)}" fill="${ink}" opacity="0.9"/>
  <circle cx="${(w - cx).toFixed(0)}" cy="${(h - cy * 0.55).toFixed(0)}" r="${ring.toFixed(0)}" fill="none" stroke="${ink}" stroke-width="${(w * 0.035).toFixed(0)}" opacity="0.32"/>
  <rect x="${rx.toFixed(0)}" y="${ry.toFixed(0)}" width="${(w * 0.34).toFixed(0)}" height="${(h * 0.2).toFixed(0)}" rx="${(w * 0.03).toFixed(0)}" fill="#fff" opacity="0.45"/>
  ${dots}
</svg>`;
}

/** Real image when the product has one, generated art otherwise. */
function shot(product, size = 400) {
  const images = product.images || [];
  if (images.length && images[0].url) {
    const src = esc(images[0].url);
    const alt = esc(images[0].alt || product.title);
    return `<img src="${src}" alt="${alt}" loading="lazy" data-pid="${esc(product.id)}" data-size="${size}" style="width:100%;height:auto;display:block">`;
  }
  return art(product, size);
}

/** If a real image fails to load, fall back to the generated illustration. */
function bindImageFallbacks(root = document) {
  for (const img of $$('img[data-pid]', root)) {
    img.onerror = () => {
      const product = state.products.find((p) => p.id === img.dataset.pid);
      if (!product) return;
      img.outerHTML = art(product, Number(img.dataset.size) || 400);
    };
  }
}

/* ------------------------------------------------------------------- api */

async function api(path, options = {}) {
  const res = await fetch(`${API.base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) throw new Error(body.error?.message || `HTTP ${res.status}`);
  return body.data;
}

async function detectApi() {
  try {
    const res = await fetch('/health');
    if (!res.ok) return;
    const health = await res.json();
    API.base = '';
    API.mode = health.mode === 'mock' ? 'tienda de prueba' : `tienda real · ${health.mode}`;
    state.api = health;
  } catch {
    API.mode = 'demostración';
  }
}

async function loadCatalogue() {
  if (API.base !== null) {
    try {
      const [products, categories, settings] = await Promise.all([
        api('/tools/search_products', { method: 'POST', body: JSON.stringify({ limit: 100 }) }),
        api('/tools/list_categories').catch(() => ({ categories: [] })),
        api('/tools/store_info').catch(() => null),
      ]);
      state.products = (products.products || []).map(normaliseProduct);
      state.categories = categories.categories || [];
      if (settings) {
        state.settings = {
          ...state.settings,
          currency: settings.currency || state.settings.currency,
          taxCountry: settings.taxCountry || state.settings.taxCountry,
          vatRate: settings.vatRate ?? state.settings.vatRate,
          pricesIncludeTax: settings.pricesIncludeTax !== false,
        };
      }
      return;
    } catch {
      /* cae al catálogo estático */
    }
  }
  const res = await fetch('assets/catalog.json');
  const data = await res.json();
  state.catalogue = data;
  state.products = (data.products || []).map(normaliseProduct);
  state.categories = data.categories || [];
  if (data.settings) state.settings = { ...state.settings, ...data.settings };
}

function normaliseProduct(p) {
  return {
    id: p.id,
    title: p.title,
    handle: p.handle,
    description: p.description || String(p.descriptionHtml || '').replace(/<[^>]*>/g, ''),
    descriptionHtml: p.descriptionHtml || '',
    category: p.category || null,
    productType: p.productType || 'Home',
    vendor: p.vendor || '',
    tags: p.tags || [],
    status: p.status || 'ACTIVE',
    price: p.price ?? p.priceRange?.minPrice?.amount ?? '0.00',
    compareAtPrice: p.compareAtPrice ?? null,
    totalInventory: p.totalInventory ?? 0,
    taxRate: p.taxRate,
    images: p.images || (p.imageUrl ? [{ url: p.imageUrl, alt: p.title }] : []),
    variants: (p.variants || []).map((v) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      compareAtPrice: v.compareAtPrice ?? null,
      sku: v.sku || '',
      available: v.available ?? v.inventoryQuantity ?? 0,
      option: v.option ?? 'Title',
      optionValue: v.optionValue ?? v.title,
    })),
  };
}

/* ------------------------------------------------------------------ cart */

const CART_KEY = 'aurora.cart.v1';

function loadCart() {
  try {
    state.cart = JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    state.cart = [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  renderCartCount();
}

function addToCart(variant, qty = 1) {
  const found = state.cart.find((l) => l.variantId === variant.id);
  if (found) found.qty = Math.min(found.qty + qty, 99);
  else {
    state.cart.push({
      variantId: variant.id,
      productId: variant.productId,
      title: variant.title,
      option: variant.optionValue,
      price: variant.price,
      sku: variant.sku,
      qty,
    });
  }
  saveCart();
  openDrawer();
  toast(`${variant.title} · ${variant.optionValue}`);
}

function cartCount() {
  return state.cart.reduce((n, l) => n + l.qty, 0);
}

function cartNet() {
  return state.cart.reduce((n, l) => n + Number(l.price) * l.qty, 0);
}

function renderCartCount() {
  const el = $('#cartCount');
  if (el) el.textContent = cartCount();
}

function toast(text) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    Object.assign(el.style, {
      position: 'fixed', left: '50%', bottom: '28px', transform: 'translateX(-50%)',
      background: '#14120e', color: '#fff', padding: '11px 18px', borderRadius: '999px',
      font: '500 13px/1 "IBM Plex Sans", sans-serif', zIndex: 90, opacity: '0',
      transition: 'opacity .25s', pointerEvents: 'none', boxShadow: '0 12px 32px -12px rgba(0,0,0,.4)',
    });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.opacity = '1';
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
}

/* ------------------------------------------------------------------ tema */

/** The CSS custom properties a theme sets on <html>. */
function themeVars(theme) {
  const p = theme.palette;
  const density = { airy: 1.35, normal: 1, tight: 0.72 }[theme.layout?.density] || 1;
  return {
    '--paper': p.paper,
    '--surface': p.surface,
    '--ink': p.ink,
    '--ink-2': p.ink2,
    '--muted': p.muted,
    '--line': p.line,
    '--accent': p.accent,
    '--highlight': p.highlight,
    '--art-a': p.artA,
    '--art-b': p.artB,
    '--display': theme.fonts?.display || '',
    '--body': theme.fonts?.body || '',
    '--mono': theme.fonts?.mono || '',
    '--radius': `${theme.layout?.radius ?? 14}px`,
    '--gap': `${Math.round(24 * density)}px`,
  };
}

function applyTheme(theme) {
  if (!theme) return;
  state.theme = theme;
  const root = document.documentElement;
  for (const [name, value] of Object.entries(themeVars(theme))) {
    if (value) root.style.setProperty(name, value);
  }
  root.dataset.hero = theme.layout?.hero || 'split';
  root.dataset.card = theme.layout?.card || 'border';
  root.dataset.button = theme.layout?.button || 'pill';
  root.dataset.caps = theme.layout?.caps === false ? 'off' : 'on';
  root.dataset.theme = theme.id;
}

function themeSelect() {
  const select = $('#themeSelect');
  if (!select || !state.themes.length) return;
  if (!select.options.length) {
    for (const theme of state.themes) {
      const option = document.createElement('option');
      option.value = theme.id;
      option.textContent = `${theme.name} · ${theme.industry}`;
      select.appendChild(option);
    }
    select.onchange = () => {
      const theme = state.themes.find((t) => t.id === select.value);
      applyTheme(theme);
      localStorage.setItem('aurora.theme', theme.id);
      const url = new URL(window.location.href);
      url.searchParams.set('theme', theme.id);
      window.history.replaceState({}, '', url);
      renderHeader();
      renderHome();
    };
  }
  select.value = state.theme?.id || 'aurora';
}

/* --------------------------------------------------------------- render */

function renderHeader() {
  const mode = $('#mode');
  if (mode) {
    const vat = vatRate();
    mode.textContent = `${API.mode} · IVA ${vat}%`;
    mode.className = 'mode';
  }
  themeSelect();
  renderCartCount();
}

/** Category chips: the owner's taxonomy when there is one, the product type otherwise. */
function categoryChips() {
  if (state.categories.length) {
    const counts = new Map();
    for (const product of state.products) {
      const key = product.category?.id;
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return state.categories
      .filter((c) => counts.has(c.id))
      .map((c) => ({ key: c.id, label: c.name, count: counts.get(c.id) }));
  }
  const counts = new Map();
  for (const product of state.products) {
    counts.set(product.productType, (counts.get(product.productType) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, label: key, count }));
}

function productCategoryKey(product) {
  return state.categories.length ? product.category?.id || null : product.productType;
}

function renderHome() {
  const chips = categoryChips();
  const filtered = state.category === 'all'
    ? state.products
    : state.products.filter((p) => productCategoryKey(p) === state.category);

  $('#crumbs').innerHTML = '';
  $('#view').innerHTML = `
    <div class="filters">
      <div class="wrap">
        <button class="chip ${state.category === 'all' ? 'on' : ''}" data-cat="all">${esc(t('filter.all'))}</button>
        ${chips.map((c) => `<button class="chip ${state.category === c.key ? 'on' : ''}" data-cat="${esc(c.key)}">${esc(c.label)} <span style="opacity:.55">${c.count}</span></button>`).join('')}
        <span class="count">${esc(t('filter.count', { shown: filtered.length, total: state.products.length }))}</span>
      </div>
    </div>
    <div class="wrap">
      <div class="grid">
        ${filtered.map(card).join('')}
      </div>
    </div>`;

  $$('#view .chip').forEach((chip) => {
    chip.onclick = () => {
      state.category = chip.dataset.cat;
      renderHome();
    };
  });
  bindImageFallbacks($('#view'));
  $$('#view .quick').forEach((button) => {
    button.onclick = (e) => {
      e.preventDefault();
      const product = state.products.find((p) => p.id === button.dataset.id);
      const variant = product.variants.find((v) => v.available > 0) || product.variants[0];
      if (!variant) return;
      addToCart({ ...variant, productId: product.id, title: product.title });
    };
  });
}

function card(product) {
  const soldOut = product.totalInventory <= 0;
  const compare = product.compareAtPrice ? ` <s>${money(product.compareAtPrice)}</s>` : '';
  return `<div class="cell">
    <a class="card" href="#/p/${esc(product.id)}">
      <div class="shot">${shot(product, 400)}</div>
      <div class="meta">
        <div class="cat">${esc(product.category?.name || product.productType)}</div>
        <h3>${esc(product.title)}</h3>
        <div class="price">${money(product.price)}${compare}${soldOut ? ` <span class="flag">${esc(t('product.outOfStock'))}</span>` : ''}</div>
      </div>
    </a>
    <button class="quick" data-id="${esc(product.id)}" ${soldOut ? 'disabled' : ''}>${esc(t('product.add'))}</button>
  </div>`;
}

function renderProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) {
    $('#view').innerHTML = '<div class="wrap" style="padding:80px 0"><p>Producto no encontrado.</p></div>';
    return;
  }
  const variant = state.variantId
    ? product.variants.find((v) => v.id === state.variantId)
    : product.variants.find((v) => v.available > 0) || product.variants[0];
  state.variantId = variant?.id ?? null;
  const stock = variant ? variant.available : 0;

  $('#crumbs').innerHTML = `<a href="#/">${esc(t('nav.shop'))}</a> / ${esc(product.category?.name || product.productType)} / ${esc(product.title)}`;

  const opts = product.variants
    .map((v) => {
      const on = v.id === state.variantId;
      const dis = v.available <= 0 && !on;
      return `<button class="opt ${on ? 'on' : ''}" data-variant="${esc(v.id)}" ${dis ? 'disabled' : ''}>${esc(v.optionValue)}</button>`;
    })
    .join('');

  const stockLine = stock > 0
    ? `<div class="stock">${stock < 6 ? esc(t('product.stockLow', { n: stock })) : esc(t('product.stock'))}</div>`
    : `<div class="stock low">${esc(t('product.soldOut'))}</div>`;

  const vatNote = state.settings.pricesIncludeTax
    ? `<span style="font:11px var(--mono);color:var(--muted)">${esc(t('product.vatIncluded'))} · ${vatRate()}%</span>`
    : '';

  $('#view').innerHTML = `
    <div class="wrap">
      <div class="pdp">
        <div class="shot">${shot(product, 800)}</div>
        <div>
          <div class="cat" style="font:10px/1 var(--mono);letter-spacing:.14em;text-transform:uppercase;color:var(--muted)">${esc(product.category?.name || product.productType)}</div>
          <h1>${esc(product.title)}</h1>
          <div class="vendor">${esc(product.vendor)}</div>
          <div class="price-row">
            <span class="price-now">${money(variant?.price ?? product.price)}</span>
            ${variant?.compareAtPrice ? `<span class="price-was">${money(variant.compareAtPrice)}</span>` : ''}
            ${vatNote}
          </div>
          ${stockLine}
          <div class="opt-label">${esc(variant?.option ?? 'Title')}</div>
          <div class="opts">${opts}</div>
          <div class="buy">
            <div class="qty">
              <button data-q="-1" aria-label="Restar">−</button>
              <span id="qty">${state.qty}</span>
              <button data-q="1" aria-label="Sumar">+</button>
            </div>
            <button class="btn primary" id="add" ${stock <= 0 ? 'disabled' : ''}>${esc(t('product.add'))}</button>
          </div>
          <p class="desc">${esc(product.description)}</p>
          <div class="spec">
            <dl>
              <dt>${esc(t('product.ref'))}</dt><dd>${esc(variant?.sku || product.handle)}</dd>
              <dt>${esc(t('product.category'))}</dt><dd>${esc(product.category?.name || product.productType)}</dd>
              <dt>${esc(t('product.shipping'))}</dt><dd>${esc(t('product.shippingValue'))}</dd>
              <dt>${esc(t('product.returns'))}</dt><dd>${esc(t('product.returnsValue'))}</dd>
            </dl>
          </div>
        </div>
      </div>
    </div>`;

  bindImageFallbacks($('#view'));
  $$('#view .opt').forEach((button) => {
    button.onclick = () => {
      state.variantId = button.dataset.variant;
      state.qty = 1;
      renderProduct(id);
    };
  });
  $$('#view .qty button').forEach((button) => {
    button.onclick = () => {
      state.qty = Math.max(1, state.qty + Number(button.dataset.q));
      $('#qty').textContent = state.qty;
    };
  });
  const add = $('#add');
  if (add) {
    add.onclick = () => {
      const v = product.variants.find((x) => x.id === state.variantId);
      if (!v || v.available <= 0) return;
      addToCart({ ...v, productId: product.id, title: product.title }, state.qty);
      state.qty = 1;
    };
  }
}

function renderOrders() {
  $('#crumbs').innerHTML = `<a href="#/">${esc(t('nav.shop'))}</a> / ${esc(t('nav.orders'))}`;
  if (API.base === null) {
    $('#view').innerHTML = `<div class="wrap" style="padding:80px 0">
      <h1 style="font-family:var(--display);font-weight:600;font-size:32px;margin:0 0 12px">${esc(t('orders.title'))}</h1>
      <p style="color:var(--muted);max-width:52ch">${esc(t('orders.demo'))}</p>
    </div>`;
    return;
  }
  api('/tools/search_orders', { method: 'POST', body: JSON.stringify({ limit: 20 }) })
    .then((data) => {
      const rows = (data.orders || [])
        .map(
          (o) => `<tr>
            <td>${esc(o.name)}</td>
            <td>${esc(new Date(o.createdAt).toLocaleDateString(state.locale))}</td>
            <td>${esc(o.displayFinancialStatus)}</td>
            <td>${esc(o.displayFulfillmentStatus)}</td>
            <td style="text-align:right">${money(o.totalPrice?.amount ?? 0, true)}</td>
          </tr>`,
        )
        .join('');
      $('#view').innerHTML = `<div class="wrap" style="padding:56px 0">
        <h1 style="font-family:var(--display);font-weight:600;font-size:32px;margin:0 0 20px">${esc(t('orders.title'))}</h1>
        <table style="width:100%;border-collapse:collapse;font:13px var(--mono)">
          <thead><tr style="text-align:left;color:var(--muted);border-bottom:1px solid var(--line)">
            <th style="padding:8px 0">#</th><th>${esc(t('orders.date'))}</th><th>${esc(t('orders.payment'))}</th><th>${esc(t('orders.fulfilment'))}</th><th style="text-align:right">${esc(t('orders.total'))}</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="5" style="padding:20px 0;color:var(--muted)">${esc(t('orders.empty'))}</td></tr>`}</tbody>
        </table>
      </div>`;
    })
    .catch((err) => {
      $('#view').innerHTML = `<div class="wrap" style="padding:80px 0"><p>${esc(err.message)}</p></div>`;
    });
}

/* ----------------------------------------------------------------- cart */

function renderCart() {
  const body = $('#cartBody');
  const foot = $('#cartFoot');
  if (!body) return;

  if (state.checkout) {
    body.innerHTML = '';
    foot.innerHTML = '';
    return;
  }

  if (!state.cart.length) {
    body.innerHTML = `<div class="empty-cart"><p>${esc(t('cart.empty'))}</p><a class="btn ghost" href="#/">${esc(t('hero.cta'))}</a></div>`;
    foot.innerHTML = '';
    return;
  }

  body.innerHTML = state.cart
    .map((line, i) => {
      const product = state.products.find((p) => p.id === line.productId);
      const image = product ? shot(product, 200) : '';
      return `<div class="line">
        <div class="shot">${image}</div>
        <div>
          <h4>${esc(line.title)}</h4>
          <div class="var">${esc(line.option)} · ${esc(line.sku || '')}</div>
          <div class="row">
            <div class="qty">
              <button data-l="${i}" data-d="-1">−</button>
              <span>${line.qty}</span>
              <button data-l="${i}" data-d="1">+</button>
            </div>
            <div class="price">${money(Number(line.price) * line.qty)}</div>
            <button class="rm" data-rm="${i}">${esc(t('cart.remove'))}</button>
          </div>
        </div>
      </div>`;
    })
    .join('');

  const net = cartNet();
  const shipping = net >= (state.settings.freeShippingThreshold ?? 50) ? 0 : (state.settings.shippingFlatRate ?? 4.9);
  const tax = net * (vatRate() / 100);
  foot.innerHTML = `
    <div class="totals">
      <div><span>${esc(t('cart.subtotal'))}</span><span>${money(net)}</span></div>
      <div><span>${esc(t('cart.shipping'))}</span><span>${shipping === 0 ? esc(t('cart.free')) : money(shipping)}</span></div>
      <div><span>${esc(t('cart.vat', { rate: `${vatRate()}%` }))}</span><span>${money(tax)}</span></div>
      <div class="grand"><span>${esc(t('cart.total'))}</span><span>${money(net + shipping + tax)}</span></div>
    </div>
    <button class="btn primary" id="toCheckout" style="width:100%;justify-content:center;margin-top:14px">${esc(t('cart.checkout'))}</button>`;

  bindImageFallbacks($('#cartBody'));
  $$('#cartBody [data-d]').forEach((button) => {
    button.onclick = () => {
      const line = state.cart[Number(button.dataset.l)];
      line.qty += Number(button.dataset.d);
      if (line.qty <= 0) state.cart.splice(Number(button.dataset.l), 1);
      saveCart();
      renderCart();
    };
  });
  $$('#cartBody [data-rm]').forEach((button) => {
    button.onclick = () => {
      state.cart.splice(Number(button.dataset.rm), 1);
      saveCart();
      renderCart();
    };
  });
  const go = $('#toCheckout');
  if (go) go.onclick = openCheckout;
}

function openCheckout() {
  state.checkout = true;
  const net = cartNet();
  const shipping = net >= (state.settings.freeShippingThreshold ?? 50) ? 0 : (state.settings.shippingFlatRate ?? 4.9);
  const total = net + shipping + net * (vatRate() / 100);
  const stripe = window.__SHOP__?.stripeEnabled;

  $('#cartBody').innerHTML = `
    <form class="co" id="coForm">
      <div><label>${esc(t('checkout.email'))}</label><input name="email" type="email" required placeholder="tu@email.com"></div>
      <div class="two">
        <div><label>${esc(t('checkout.firstName'))}</label><input name="firstName" required></div>
        <div><label>${esc(t('checkout.lastName'))}</label><input name="lastName" required></div>
      </div>
      <div><label>${esc(t('checkout.address1'))}</label><input name="address1" required></div>
      <div class="two">
        <div><label>${esc(t('checkout.zip'))}</label><input name="zip" required></div>
        <div><label>${esc(t('checkout.city'))}</label><input name="city" required></div>
      </div>
      <div><label>${esc(t('checkout.country'))}</label><input name="country" required value="España"></div>
      <p class="co-note">${stripe ? esc(t('checkout.simulated')) : esc(t('checkout.simulated'))}${
        API.base === null ? ` ${esc(t('checkout.demoNote'))}` : ''
      }</p>
      ${stripe ? `<button class="btn primary" type="button" id="payStripe" style="width:100%;justify-content:center">${esc(t('checkout.payStripe'))}</button>` : ''}
      <button class="btn ${stripe ? 'ghost' : 'primary'}" type="submit" style="width:100%;justify-content:center;margin-top:8px">${esc(t('checkout.confirm'))} · ${money(total)}</button>
      <button class="btn ghost" type="button" id="backCart" style="width:100%;justify-content:center">${esc(t('cart.continue'))}</button>
    </form>`;
  $('#cartFoot').innerHTML = '';

  $('#backCart').onclick = () => {
    state.checkout = null;
    renderCart();
  };

  const stripeButton = $('#payStripe');
  if (stripeButton) {
    stripeButton.onclick = async () => {
      stripeButton.disabled = true;
      stripeButton.textContent = '…';
      try {
        const order = await placeOrder(readForm(), { createOrder: false });
        const session = await api('/tools/create_checkout_session', {
          method: 'POST',
          body: JSON.stringify({
            lines: state.cart.map((l) => ({
              name: l.title,
              amount: displayPrice(Number(l.price) * l.qty),
              currency: state.settings.currency || 'EUR',
              quantity: l.qty,
            })),
            customerEmail: readForm().email,
            orderId: order?.id,
            successUrl: `${window.location.origin}/#/orders`,
            cancelUrl: `${window.location.origin}/#/cart`,
          }),
        });
        window.location.href = session.url;
      } catch (err) {
        stripeButton.disabled = false;
        stripeButton.textContent = t('checkout.payStripe');
        toast(`Error: ${err.message}`);
      }
    };
  }

  $('#coForm').onsubmit = async (e) => {
    e.preventDefault();
    const button = $('#coForm button[type=submit]');
    button.disabled = true;
    button.textContent = '…';
    try {
      const order = await placeOrder(readForm());
      showDone(order);
    } catch (err) {
      button.disabled = false;
      button.textContent = t('checkout.confirm');
      toast(`Error: ${err.message}`);
    }
  };
}

function readForm() {
  const form = $('#coForm');
  return Object.fromEntries(new FormData(form).entries());
}

async function placeOrder(customer, options = {}) {
  if (API.base !== null && options.createOrder !== false) {
    const data = await api('/tools/create_order', {
      method: 'POST',
      body: JSON.stringify({
        lineItems: state.cart.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
        customer: {
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
        },
        shippingAddress: {
          address1: customer.address1,
          city: customer.city,
          country: customer.country,
          zip: customer.zip,
          firstName: customer.firstName,
          lastName: customer.lastName,
        },
        note: 'Pedido creado desde la tienda web.',
      }),
    });
    state.cart = [];
    saveCart();
    return { reference: data.order.name, id: data.order.id, live: true };
  }

  if (API.base !== null) {
    const data = await api('/tools/create_order', {
      method: 'POST',
      body: JSON.stringify({
        lineItems: state.cart.map((l) => ({ variantId: l.variantId, quantity: l.qty })),
        customer: { email: customer.email, firstName: customer.firstName, lastName: customer.lastName },
      }),
    });
    state.cart = [];
    saveCart();
    return { reference: data.order.name, id: data.order.id, live: true };
  }

  await new Promise((r) => setTimeout(r, 550));
  const reference = `#A-${1000 + Math.floor(Math.random() * 8999)}`;
  state.cart = [];
  saveCart();
  return { reference, id: reference, live: false };
}

function showDone(order) {
  state.checkout = null;
  $('#cartBody').innerHTML = `
    <div class="done">
      <div class="mark">✓</div>
      <h3>${esc(t('checkout.done'))}</h3>
      <p class="ref">${esc(order.reference)}</p>
      <p style="color:var(--muted);font-size:14px;max-width:34ch;margin:0 auto 22px">
        ${order.live ? esc(t('checkout.thanks')) : esc(t('checkout.demoThanks'))}
      </p>
      <button class="btn ghost" id="doneClose">${esc(t('cart.continue'))}</button>
    </div>`;
  $('#cartFoot').innerHTML = '';
  $('#doneClose').onclick = () => {
    closeDrawer();
    window.location.hash = '#/';
  };
}

function openDrawer() {
  renderCart();
  $('#drawer').classList.add('on');
  $('#scrim').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  $('#drawer').classList.remove('on');
  $('#scrim').classList.remove('on');
  document.body.style.overflow = '';
}

/* ---------------------------------------------------------------- router */

function route() {
  const hash = window.location.hash || '#/';
  const parts = hash.split('/');
  const section = parts[1] || '';
  // Shopify ids look like gid://shopify/Product/1001, so the rest of the
  // hash has to be rejoined instead of taking a single segment.
  const param = parts.slice(2).join('/');
  state.view = section === 'p' ? 'product' : section === 'orders' ? 'orders' : 'home';
  state.productId = param ? decodeURIComponent(param) : null;
  state.variantId = null;
  state.qty = 1;

  $('#hero').hidden = state.view !== 'home';

  if (state.view === 'product') renderProduct(state.productId);
  else if (state.view === 'orders') renderOrders();
  else renderHome();

  window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
}

function detectLocale() {
  const injected = window.__SHOP__?.locale;
  if (injected && LOCALE_NAMES[injected]) return injected;
  const fromUrl = new URL(window.location.href).searchParams.get('lang');
  if (fromUrl && LOCALE_NAMES[fromUrl]) return fromUrl;
  const saved = localStorage.getItem('aurora.lang');
  if (saved && LOCALE_NAMES[saved]) return saved;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LOCALE_NAMES[browser] ? browser : 'en';
}

async function boot() {
  const shop = window.__SHOP__ || {};
  state.locale = detectLocale();
  state.settings = { ...state.settings, ...(shop.settings || {}) };
  if (shop.currency) state.settings.currency = shop.currency;
  if (shop.taxCountry) state.settings.taxCountry = shop.taxCountry;
  if (shop.vatRate !== undefined && shop.vatRate !== null) state.settings.vatRate = shop.vatRate;
  if (shop.pricesIncludeTax !== undefined) state.settings.pricesIncludeTax = shop.pricesIncludeTax;
  if (shop.freeShippingThreshold !== undefined) state.settings.freeShippingThreshold = shop.freeShippingThreshold;
  if (shop.shippingFlatRate !== undefined) state.settings.shippingFlatRate = shop.shippingFlatRate;

  applyTranslations();

  const injected = window.__SHOP__ || {};
  state.themes = injected.themes || [];
  const wanted =
    new URL(window.location.href).searchParams.get('theme') ||
    localStorage.getItem('aurora.theme') ||
    injected.theme?.id;
  const active = state.themes.find((t) => t.id === wanted) || injected.theme || state.themes[0];
  applyTheme(active);

  await detectApi();
  await loadCatalogue();
  if (!state.themes.length && state.catalogue?.themes) {
    state.themes = state.catalogue.themes;
    applyTheme(state.themes.find((t) => t.id === (state.theme?.id || 'aurora')) || state.themes[0]);
  }
  loadCart();
  renderHeader();
  route();
  window.addEventListener('hashchange', route);

  $('#cartBtn').onclick = openDrawer;
  $('#closeDrawer').onclick = closeDrawer;
  $('#scrim').onclick = closeDrawer;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });
}

boot().catch((err) => {
  document.getElementById('view').innerHTML =
    `<div class="wrap" style="padding:80px 0"><h1 style="font-family:var(--display)">No se pudo cargar la tienda</h1><p>${esc(err.message)}</p></div>`;
});
