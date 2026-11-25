/**
 * AURORA — panel de administración.
 *
 * Es otro cliente de la misma API de tools que usan los agentes: lo que se
 * puede hacer desde aquí se puede hacer desde MCP o desde REST. No hay chat
 * y no hay modelo: el panel ejecuta órdenes.
 */

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const LOCALES = ['en', 'es', 'ro', 'hu'];
const LOCALE_NAMES = { en: 'English', es: 'Español', ro: 'Română', hu: 'Magyar' };

const I18N = {
  en: {
    'nav.design': 'Design', 'design.title': 'Design templates', 'design.hint': 'Thirty templates, one per industry. The active one is applied to the shop.', 'design.apply': 'Use this template', 'design.active': 'In use', 'design.industry': 'Industry',
    'nav.dashboard': 'Dashboard', 'nav.products': 'Products', 'nav.categories': 'Categories',
    'nav.orders': 'Orders', 'nav.settings': 'Settings', 'nav.shop': 'View the shop',
    'nav.tools': 'Tools API',
    'dash.revenue': 'Revenue', 'dash.orders': 'Orders', 'dash.products': 'Products',
    'dash.lowStock': 'Low stock', 'dash.recent': 'Recent orders', 'dash.noOrders': 'No orders yet.',
    'dash.tax': 'VAT in force', 'dash.taxValue': 'Country {country} · {rate}%',
    'dash.paid': 'paid', 'dash.units': 'variants',
    'prod.title': 'Products', 'prod.new': 'New product', 'prod.search': 'Search products',
    'prod.empty': 'No products.', 'prod.edit': 'Edit', 'prod.delete': 'Delete',
    'prod.confirm': 'Delete "{name}"? This cannot be undone.',
    'prod.saved': 'Saved.', 'prod.deleted': 'Deleted.', 'prod.created': 'Created.',
    'prod.fieldTitle': 'Title', 'prod.fieldDescription': 'Description', 'prod.fieldVendor': 'Vendor',
    'prod.fieldCategory': 'Category', 'prod.fieldPrice': 'Price (net of VAT)',
    'prod.fieldTax': 'VAT %', 'prod.fieldStatus': 'Status', 'prod.fieldImages': 'Images',
    'prod.imageUrl': 'Image URL', 'prod.addImage': 'Add image', 'prod.upload': 'Upload a file',
    'prod.variants': 'Variants', 'prod.stock': 'Stock', 'prod.noCategory': 'Without category',
    'cat.title': 'Categories', 'cat.new': 'New category', 'cat.name': 'Name', 'cat.slug': 'Slug',
    'cat.tax': 'VAT %', 'cat.products': 'Products', 'cat.empty': 'No categories yet.',
    'cat.confirm': 'Delete the category "{name}"? The products stay, they lose the category.',
    'cat.created': 'Category created.', 'cat.deleted': 'Category deleted.', 'cat.saved': 'Category saved.',
    'ord.title': 'Orders', 'ord.empty': 'No orders yet.', 'ord.customer': 'Customer', 'ord.date': 'Date',
    'ord.payment': 'Payment', 'ord.fulfilment': 'Fulfilment', 'ord.total': 'Total',
    'ord.markPaid': 'Mark as paid', 'ord.fulfil': 'Mark as shipped', 'ord.tracking': 'Tracking',
    'ord.trackingCompany': 'Carrier', 'ord.trackingNumber': 'Tracking number',
    'ord.marked': 'Order updated.', 'ord.lines': 'Items', 'ord.address': 'Shipping address',
    'set.title': 'Settings', 'set.shopName': 'Shop name', 'set.currency': 'Currency',
    'set.taxCountry': 'Tax country', 'set.pricesIncludeTax': 'Prices include VAT',
    'set.freeShipping': 'Free shipping from', 'set.shippingFlat': 'Flat shipping rate',
    'set.defaultLocale': 'Default language', 'set.stripe': 'Stripe', 'set.connected': 'Connected',
    'set.notConnected': 'Not configured', 'set.stripeHint': 'Set STRIPE_SECRET_KEY to enable card payments.',
    'set.api': 'Tools API', 'set.apiHint': 'Every action in this panel is also a tool for AI agents.',
    'set.saved': 'Settings saved.', 'set.language': 'Panel language',
    'common.save': 'Save', 'common.cancel': 'Cancel', 'common.close': 'Close', 'common.loading': 'Loading…',
    'common.error': 'Something went wrong', 'common.actions': 'Actions', 'common.name': 'Name',
    'common.total': 'Total', 'common.free': 'Free', 'common.units': 'units',
  },
  es: {
    'nav.design': 'Diseño', 'design.title': 'Plantillas de diseño', 'design.hint': 'Treinta plantillas, una por industria. La activa se aplica a la tienda.', 'design.apply': 'Usar esta plantilla', 'design.active': 'En uso', 'design.industry': 'Industria',
    'nav.dashboard': 'Panel', 'nav.products': 'Productos', 'nav.categories': 'Categorías',
    'nav.orders': 'Pedidos', 'nav.settings': 'Ajustes', 'nav.shop': 'Ver la tienda',
    'nav.tools': 'API de tools',
    'dash.revenue': 'Ingresos', 'dash.orders': 'Pedidos', 'dash.products': 'Productos',
    'dash.lowStock': 'Stock bajo', 'dash.recent': 'Últimos pedidos', 'dash.noOrders': 'Todavía no hay pedidos.',
    'dash.tax': 'IVA vigente', 'dash.taxValue': 'País {country} · {rate}%',
    'dash.paid': 'pagados', 'dash.units': 'variantes',
    'prod.title': 'Productos', 'prod.new': 'Nuevo producto', 'prod.search': 'Buscar productos',
    'prod.empty': 'No hay productos.', 'prod.edit': 'Editar', 'prod.delete': 'Eliminar',
    'prod.confirm': '¿Eliminar "{name}"? No se puede deshacer.',
    'prod.saved': 'Guardado.', 'prod.deleted': 'Eliminado.', 'prod.created': 'Creado.',
    'prod.fieldTitle': 'Título', 'prod.fieldDescription': 'Descripción', 'prod.fieldVendor': 'Marca',
    'prod.fieldCategory': 'Categoría', 'prod.fieldPrice': 'Precio (sin IVA)',
    'prod.fieldTax': 'IVA %', 'prod.fieldStatus': 'Estado', 'prod.fieldImages': 'Imágenes',
    'prod.imageUrl': 'URL de la imagen', 'prod.addImage': 'Añadir imagen', 'prod.upload': 'Subir un fichero',
    'prod.variants': 'Variantes', 'prod.stock': 'Stock', 'prod.noCategory': 'Sin categoría',
    'cat.title': 'Categorías', 'cat.new': 'Nueva categoría', 'cat.name': 'Nombre', 'cat.slug': 'Slug',
    'cat.tax': 'IVA %', 'cat.products': 'Productos', 'cat.empty': 'Todavía no hay categorías.',
    'cat.confirm': '¿Eliminar la categoría "{name}"? Los productos se quedan, pierden la categoría.',
    'cat.created': 'Categoría creada.', 'cat.deleted': 'Categoría eliminada.', 'cat.saved': 'Categoría guardada.',
    'ord.title': 'Pedidos', 'ord.empty': 'Todavía no hay pedidos.', 'ord.customer': 'Cliente', 'ord.date': 'Fecha',
    'ord.payment': 'Pago', 'ord.fulfilment': 'Envío', 'ord.total': 'Total',
    'ord.markPaid': 'Marcar como pagado', 'ord.fulfil': 'Marcar como enviado', 'ord.tracking': 'Seguimiento',
    'ord.trackingCompany': 'Transportista', 'ord.trackingNumber': 'Número de seguimiento',
    'ord.marked': 'Pedido actualizado.', 'ord.lines': 'Artículos', 'ord.address': 'Dirección de envío',
    'set.title': 'Ajustes', 'set.shopName': 'Nombre de la tienda', 'set.currency': 'Moneda',
    'set.taxCountry': 'País de impuestos', 'set.pricesIncludeTax': 'Precios con IVA incluido',
    'set.freeShipping': 'Envío gratis desde', 'set.shippingFlat': 'Coste de envío fijo',
    'set.defaultLocale': 'Idioma por defecto', 'set.stripe': 'Stripe', 'set.connected': 'Conectado',
    'set.notConnected': 'Sin configurar', 'set.stripeHint': 'Define STRIPE_SECRET_KEY para activar el pago con tarjeta.',
    'set.api': 'API de tools', 'set.apiHint': 'Todo lo que haces aquí también es una tool para agentes de IA.',
    'set.saved': 'Ajustes guardados.', 'set.language': 'Idioma del panel',
    'common.save': 'Guardar', 'common.cancel': 'Cancelar', 'common.close': 'Cerrar', 'common.loading': 'Cargando…',
    'common.error': 'Algo ha fallado', 'common.actions': 'Acciones', 'common.name': 'Nombre',
    'common.total': 'Total', 'common.free': 'Gratis', 'common.units': 'unidades',
  },
  ro: {
    'nav.design': 'Design', 'design.title': 'Șabloane de design', 'design.hint': 'Treize șabloane, unul pentru fiecare industrie. Cel activ se aplică magazinului.', 'design.apply': 'Folosește acest șablon', 'design.active': 'În uz', 'design.industry': 'Industrie',
    'nav.dashboard': 'Panou', 'nav.products': 'Produse', 'nav.categories': 'Categorii',
    'nav.orders': 'Comenzi', 'nav.settings': 'Setări', 'nav.shop': 'Vezi magazinul',
    'nav.tools': 'API tools',
    'dash.revenue': 'Venit', 'dash.orders': 'Comenzi', 'dash.products': 'Produse',
    'dash.lowStock': 'Stoc redus', 'dash.recent': 'Ultimele comenzi', 'dash.noOrders': 'Încă nu există comenzi.',
    'dash.tax': 'TVA în vigoare', 'dash.taxValue': 'Țara {country} · {rate}%',
    'dash.paid': 'plătite', 'dash.units': 'variante',
    'prod.title': 'Produse', 'prod.new': 'Produs nou', 'prod.search': 'Caută produse',
    'prod.empty': 'Nu există produse.', 'prod.edit': 'Editează', 'prod.delete': 'Șterge',
    'prod.confirm': 'Ștergi "{name}"? Operațiunea nu poate fi anulată.',
    'prod.saved': 'Salvat.', 'prod.deleted': 'Șters.', 'prod.created': 'Creat.',
    'prod.fieldTitle': 'Titlu', 'prod.fieldDescription': 'Descriere', 'prod.fieldVendor': 'Brand',
    'prod.fieldCategory': 'Categorie', 'prod.fieldPrice': 'Preț (fără TVA)',
    'prod.fieldTax': 'TVA %', 'prod.fieldStatus': 'Stare', 'prod.fieldImages': 'Imagini',
    'prod.imageUrl': 'URL imaginii', 'prod.addImage': 'Adaugă imagine', 'prod.upload': 'Încarcă un fișier',
    'prod.variants': 'Variante', 'prod.stock': 'Stoc', 'prod.noCategory': 'Fără categorie',
    'cat.title': 'Categorii', 'cat.new': 'Categorie nouă', 'cat.name': 'Nume', 'cat.slug': 'Slug',
    'cat.tax': 'TVA %', 'cat.products': 'Produse', 'cat.empty': 'Încă nu există categorii.',
    'cat.confirm': 'Ștergi categoria "{name}"? Produsele rămân, dar pierd categoria.',
    'cat.created': 'Categorie creată.', 'cat.deleted': 'Categorie ștearsă.', 'cat.saved': 'Categorie salvată.',
    'ord.title': 'Comenzi', 'ord.empty': 'Încă nu există comenzi.', 'ord.customer': 'Client', 'ord.date': 'Data',
    'ord.payment': 'Plată', 'ord.fulfilment': 'Livrare', 'ord.total': 'Total',
    'ord.markPaid': 'Marchează ca plătită', 'ord.fulfil': 'Marchează ca expediată', 'ord.tracking': 'Urmărire',
    'ord.trackingCompany': 'Curier', 'ord.trackingNumber': 'Număr de urmărire',
    'ord.marked': 'Comandă actualizată.', 'ord.lines': 'Articole', 'ord.address': 'Adresă de livrare',
    'set.title': 'Setări', 'set.shopName': 'Numele magazinului', 'set.currency': 'Monedă',
    'set.taxCountry': 'Țara de impozitare', 'set.pricesIncludeTax': 'Prețuri cu TVA inclus',
    'set.freeShipping': 'Livrare gratuită de la', 'set.shippingFlat': 'Tarif fix de livrare',
    'set.defaultLocale': 'Limbă implicită', 'set.stripe': 'Stripe', 'set.connected': 'Conectat',
    'set.notConnected': 'Neconfigurat', 'set.stripeHint': 'Setează STRIPE_SECRET_KEY pentru plăți cu cardul.',
    'set.api': 'API tools', 'set.apiHint': 'Tot ce faci aici este și un tool pentru agenți AI.',
    'set.saved': 'Setări salvate.', 'set.language': 'Limba panoului',
    'common.save': 'Salvează', 'common.cancel': 'Anulează', 'common.close': 'Închide', 'common.loading': 'Se încarcă…',
    'common.error': 'Ceva nu a mers bine', 'common.actions': 'Acțiuni', 'common.name': 'Nume',
    'common.total': 'Total', 'common.free': 'Gratis', 'common.units': 'bucăți',
  },
  hu: {
    'nav.design': 'Design', 'design.title': 'Design sablonok', 'design.hint': 'Harminc sablon, mindegyik iparágra egy. Az aktív az üzletre kerül.', 'design.apply': 'Sablon használata', 'design.active': 'Aktív', 'design.industry': 'Iparág',
    'nav.dashboard': 'Áttekintés', 'nav.products': 'Termékek', 'nav.categories': 'Kategóriák',
    'nav.orders': 'Rendelések', 'nav.settings': 'Beállítások', 'nav.shop': 'Üzlet megtekintése',
    'nav.tools': 'Tools API',
    'dash.revenue': 'Bevétel', 'dash.orders': 'Rendelések', 'dash.products': 'Termékek',
    'dash.lowStock': 'Kevés készlet', 'dash.recent': 'Legutóbbi rendelések', 'dash.noOrders': 'Még nincsenek rendelések.',
    'dash.tax': 'Érvényes ÁFA', 'dash.taxValue': '{country} · {rate}%',
    'dash.paid': 'fizetve', 'dash.units': 'változat',
    'prod.title': 'Termékek', 'prod.new': 'Új termék', 'prod.search': 'Termékek keresése',
    'prod.empty': 'Nincsenek termékek.', 'prod.edit': 'Szerkesztés', 'prod.delete': 'Törlés',
    'prod.confirm': 'Töröl a(z) "{name}" terméket? Ezt nem lehet visszavonni.',
    'prod.saved': 'Mentve.', 'prod.deleted': 'Törölve.', 'prod.created': 'Létrehozva.',
    'prod.fieldTitle': 'Cím', 'prod.fieldDescription': 'Leírás', 'prod.fieldVendor': 'Márka',
    'prod.fieldCategory': 'Kategória', 'prod.fieldPrice': 'Ár (áfa nélkül)',
    'prod.fieldTax': 'ÁFA %', 'prod.fieldStatus': 'Státusz', 'prod.fieldImages': 'Képek',
    'prod.imageUrl': 'Kép URL', 'prod.addImage': 'Kép hozzáadása', 'prod.upload': 'Fájl feltöltése',
    'prod.variants': 'Változatok', 'prod.stock': 'Készlet', 'prod.noCategory': 'Kategória nélkül',
    'cat.title': 'Kategóriák', 'cat.new': 'Új kategória', 'cat.name': 'Név', 'cat.slug': 'Slug',
    'cat.tax': 'ÁFA %', 'cat.products': 'Termékek', 'cat.empty': 'Még nincsenek kategóriák.',
    'cat.confirm': 'Töröl a(z) "{name}" kategóriát? A termékek megmaradnak, kategóriát veszítenek.',
    'cat.created': 'Kategória létrehozva.', 'cat.deleted': 'Kategória törölve.', 'cat.saved': 'Kategória mentve.',
    'ord.title': 'Rendelések', 'ord.empty': 'Még nincsenek rendelések.', 'ord.customer': 'Vevő', 'ord.date': 'Dátum',
    'ord.payment': 'Fizetés', 'ord.fulfilment': 'Teljesítés', 'ord.total': 'Összesen',
    'ord.markPaid': 'Fizetettnek jelölés', 'ord.fulfil': 'Elküldöttnek jelölés', 'ord.tracking': 'Nyomkövetés',
    'ord.trackingCompany': 'Futár', 'ord.trackingNumber': 'Nyomkövetési szám',
    'ord.marked': 'Rendelés frissítve.', 'ord.lines': 'Tételek', 'ord.address': 'Szállítási cím',
    'set.title': 'Beállítások', 'set.shopName': 'Üzlet neve', 'set.currency': 'Pénznem',
    'set.taxCountry': 'Adózó ország', 'set.pricesIncludeTax': 'Az árak tartalmazzák az ÁFÁ-t',
    'set.freeShipping': 'Ingyenes szállítás ettől', 'set.shippingFlat': 'Fix szállítási díj',
    'set.defaultLocale': 'Alapértelmezett nyelv', 'set.stripe': 'Stripe', 'set.connected': 'Csatlakoztatva',
    'set.notConnected': 'Nincs beállítva', 'set.stripeHint': 'Állítsd be a STRIPE_SECRET_KEY értéket a kártyás fizetéshez.',
    'set.api': 'Tools API', 'set.apiHint': 'Minden, amit itt teszel, AI ügynökök számára is elérhető tool.',
    'set.saved': 'Beállítások mentve.', 'set.language': 'A panel nyelve',
    'common.save': 'Mentés', 'common.cancel': 'Mégse', 'common.close': 'Bezárás', 'common.loading': 'Betöltés…',
    'common.error': 'Valami hiba történt', 'common.actions': 'Műveletek', 'common.name': 'Név',
    'common.total': 'Összesen', 'common.free': 'Ingyenes', 'common.units': 'db',
  },
};

const state = {
  locale: 'en',
  section: 'dashboard',
  shop: {},
  categories: [],
  products: [],
  orders: [],
  stats: null,
};

/* ------------------------------------------------------------------ i18n */

function t(key, vars = {}) {
  const table = I18N[state.locale] || I18N.en;
  let text = table[key] ?? I18N.en[key] ?? key;
  for (const [name, value] of Object.entries(vars)) {
    text = text.replace(new RegExp(`\\{${name}\\}`, 'g'), String(value));
  }
  return text;
}

function applyTranslations() {
  document.documentElement.lang = state.locale;
  for (const el of $$('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  const select = $('#langSelect');
  if (select && !select.options.length) {
    for (const code of LOCALES) {
      const option = document.createElement('option');
      option.value = code;
      option.textContent = LOCALE_NAMES[code];
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

/* ------------------------------------------------------------------- api */

async function api(tool, args = {}) {
  const res = await fetch(`/tools/${encodeURIComponent(tool)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => ({}));
  if (!body.ok) {
    const err = new Error(body.error?.message || `HTTP ${res.status}`);
    err.code = body.error?.code;
    throw err;
  }
  return body.data;
}

function money(amount, currency = 'EUR') {
  try {
    return new Intl.NumberFormat(state.locale, { style: 'currency', currency }).format(Number(amount) || 0);
  } catch {
    return `${(Number(amount) || 0).toFixed(2)} ${currency}`;
  }
}

function toast(text, isError = false) {
  const el = $('#toast');
  el.textContent = text;
  el.className = `toast on${isError ? ' err' : ''}`;
  clearTimeout(el._timer);
  el._timer = setTimeout(() => { el.className = 'toast'; }, 2600);
}

/* ----------------------------------------------------------------- panel */

function openPanel(title, bodyHtml, footHtml = '') {
  $('#panelTitle').textContent = title;
  $('#panelBody').innerHTML = bodyHtml;
  $('#panelFoot').innerHTML = footHtml;
  $('#panel').classList.add('on');
  $('#panel').setAttribute('aria-hidden', 'false');
  $('#scrim').classList.add('on');
}

function closePanel() {
  $('#panel').classList.remove('on');
  $('#panel').setAttribute('aria-hidden', 'true');
  $('#scrim').classList.remove('on');
}

/* -------------------------------------------------------------- sections */

const SECTIONS = [
  { id: 'dashboard', label: 'nav.dashboard' },
  { id: 'products', label: 'nav.products' },
  { id: 'categories', label: 'nav.categories' },
  { id: 'orders', label: 'nav.orders' },
  { id: 'settings', label: 'nav.settings' },
  { id: 'design', label: 'nav.design' },
];

function renderNav() {
  const nav = $('#nav');
  nav.innerHTML = '';
  for (const section of SECTIONS) {
    const a = document.createElement('a');
    a.href = `#${section.id}`;
    a.dataset.section = section.id;
    a.className = state.section === section.id ? 'on' : '';
    a.innerHTML = `<span>${esc(t(section.label))}</span>`;
    a.onclick = (e) => {
      e.preventDefault();
      window.location.hash = `#${section.id}`;
      state.section = section.id;
      renderNav();
      renderSection();
    };
    nav.appendChild(a);
  }
}

async function renderSection() {
  const content = $('#content');
  const section = SECTIONS.find((s) => s.id === state.section);
  if (section) $('#sectionTitle').textContent = t(section.label);
  content.innerHTML = `<p class="muted">${esc(t('common.loading'))}</p>`;
  try {
    if (state.section === 'dashboard') await renderDashboard(content);
    else if (state.section === 'products') await renderProducts(content);
    else if (state.section === 'categories') await renderCategories(content);
    else if (state.section === 'orders') await renderOrders(content);
    else if (state.section === 'settings') await renderSettings(content);
    else if (state.section === 'design') await renderDesign(content);
  } catch (err) {
    content.innerHTML = `<div class="err-box">${esc(err.message)}</div>`;
  }
}

/* -------------------------------------------------------------- dashboard */

async function renderDashboard(content) {
  const stats = await api('shop_stats');
  state.stats = stats;
  const orders = await api('search_orders', { limit: 8 });
  state.orders = orders.orders || [];

  const lowStock = stats.lowStock || [];
  content.innerHTML = `
    <div class="tiles">
      <div class="tile"><div class="k">${esc(t('dash.revenue'))}</div>
        <div class="v">${esc(money(stats.revenue?.amount, stats.revenue?.currencyCode))}</div>
        <div class="s">${esc(t('dash.tax'))}: ${esc(t('dash.taxValue', { country: stats.taxCountry, rate: stats.vatRate }))}</div></div>
      <div class="tile"><div class="k">${esc(t('dash.orders'))}</div>
        <div class="v">${stats.orderCount}</div>
        <div class="s">${stats.paidOrderCount} ${esc(t('dash.paid'))}</div></div>
      <div class="tile"><div class="k">${esc(t('dash.products'))}</div>
        <div class="v">${stats.productCount}</div>
        <div class="s">${stats.categoryCount} ${esc(t('nav.categories').toLowerCase())}</div></div>
      <div class="tile"><div class="k">${esc(t('dash.lowStock'))}</div>
        <div class="v">${lowStock.length}</div>
        <div class="s">${esc(t('dash.units'))}</div></div>
    </div>

    ${lowStock.length ? `<h2 class="block">${esc(t('dash.lowStock'))}</h2>
    <table><thead><tr><th>${esc(t('prod.fieldTitle'))}</th><th>${esc(t('prod.variants'))}</th><th class="num">${esc(t('prod.stock'))}</th></tr></thead>
    <tbody>${lowStock.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.variant)}</td><td class="num">${item.available}</td></tr>`).join('')}</tbody></table>` : ''}

    <h2 class="block">${esc(t('dash.recent'))}</h2>
    ${
      state.orders.length
        ? `<table><thead><tr><th>#</th><th>${esc(t('ord.customer'))}</th><th>${esc(t('ord.payment'))}</th><th>${esc(t('ord.fulfilment'))}</th><th class="num">${esc(t('ord.total'))}</th></tr></thead>
           <tbody>${state.orders.map((o) => `<tr>
             <td>${esc(o.name)}</td>
             <td>${esc(o.customer?.email || '—')}</td>
             <td><span class="pill-tag ${o.displayFinancialStatus === 'PAID' ? 'ok' : 'warn'}">${esc(o.displayFinancialStatus)}</span></td>
             <td>${esc(o.displayFulfillmentStatus)}</td>
             <td class="num">${esc(money(o.totalPrice?.amount))}</td></tr>`).join('')}</tbody></table>`
        : `<div class="empty">${esc(t('dash.noOrders'))}</div>`
    }`;
}

/* --------------------------------------------------------------- products */

async function renderProducts(content) {
  const data = await api('search_products', { limit: 100 });
  state.products = data.products || [];

  content.innerHTML = `
    <div class="toolbar">
      <input type="search" id="prodSearch" placeholder="${esc(t('prod.search'))}">
      <button class="btn primary" id="newProduct">${esc(t('prod.new'))}</button>
    </div>
    <div id="prodList"></div>`;

  const draw = (query = '') => {
    const term = query.toLowerCase();
    const rows = state.products.filter(
      (p) => !term || p.title.toLowerCase().includes(term) || (p.vendor || '').toLowerCase().includes(term),
    );
    $('#prodList').innerHTML = rows.length
      ? `<table><thead><tr>
          <th></th><th>${esc(t('prod.fieldTitle'))}</th><th>${esc(t('prod.fieldCategory'))}</th>
          <th class="num">${esc(t('prod.fieldPrice'))}</th><th class="num">${esc(t('prod.fieldTax'))}</th>
          <th class="num">${esc(t('prod.stock'))}</th><th>${esc(t('common.actions'))}</th></tr></thead>
         <tbody>${rows.map((p) => `<tr>
           <td>${thumb(p)}</td>
           <td><strong>${esc(p.title)}</strong><br><span class="muted">${esc(p.vendor || '')}</span></td>
           <td>${esc(p.category?.name || t('prod.noCategory'))}</td>
           <td class="num">${esc(money(p.priceRange?.minPrice?.amount))}</td>
           <td class="num">${p.taxRate ?? '—'}%</td>
           <td class="num">${p.totalInventory}</td>
           <td><button class="link" data-edit="${esc(p.id)}">${esc(t('prod.edit'))}</button>
               <button class="link" style="color:var(--clay)" data-del="${esc(p.id)}">${esc(t('prod.delete'))}</button></td>
         </tr>`).join('')}</tbody></table>`
      : `<div class="empty">${esc(t('prod.empty'))}</div>`;

    $$('#prodList [data-edit]').forEach((button) => {
      button.onclick = () => editProduct(button.dataset.edit);
    });
    $$('#prodList [data-del]').forEach((button) => {
      button.onclick = () => deleteProduct(button.dataset.del);
    });
  };

  draw();
  $('#prodSearch').oninput = (e) => draw(e.target.value);
  $('#newProduct').onclick = () => editProduct(null);
}

function thumb(product) {
  const image = (product.images || [])[0];
  if (image && image.url) {
    return `<span class="thumb"><img src="${esc(image.url)}" alt=""></span>`;
  }
  return `<span class="thumb"><svg viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="#e6e1d6"/><circle cx="4" cy="4" r="2.6" fill="#b9cbb9"/></svg></span>`;
}

async function editProduct(id) {
  const product = id ? state.products.find((p) => p.id === id) : null;
  const categories = state.categories;
  const images = product?.images || [];

  openPanel(
    product ? product.title : t('prod.new'),
    `
    <div class="form">
      <div class="field"><label>${esc(t('prod.fieldTitle'))}</label>
        <input id="fTitle" value="${esc(product?.title || '')}"></div>
      <div class="field"><label>${esc(t('prod.fieldDescription'))}</label>
        <textarea id="fDesc">${esc((product?.descriptionHtml || '').replace(/<[^>]*>/g, ''))}</textarea></div>
      <div class="row2">
        <div class="field"><label>${esc(t('prod.fieldVendor'))}</label>
          <input id="fVendor" value="${esc(product?.vendor || '')}"></div>
        <div class="field"><label>${esc(t('prod.fieldCategory'))}</label>
          <select id="fCategory">
            <option value="">${esc(t('prod.noCategory'))}</option>
            ${categories.map((c) => `<option value="${esc(c.id)}" ${product?.category?.id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
      </div>
      <div class="row3">
        <div class="field"><label>${esc(t('prod.fieldPrice'))}</label>
          <input id="fPrice" value="${esc(product?.priceRange?.minPrice?.amount || '')}"></div>
        <div class="field"><label>${esc(t('prod.fieldTax'))}</label>
          <input id="fTax" value="${esc(product?.taxRate ?? '')}" placeholder="21"></div>
        <div class="field"><label>${esc(t('prod.fieldStatus'))}</label>
          <select id="fStatus">
            ${['ACTIVE', 'DRAFT', 'ARCHIVED'].map((s) => `<option ${product?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
      </div>

      <div class="field"><label>${esc(t('prod.fieldImages'))}</label>
        <div class="imgs" id="imgs">
          ${images.map((image, i) => imageRow(image, i)).join('')}
        </div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn sm" id="addImg">${esc(t('prod.addImage'))}</button>
          <label class="btn sm" style="cursor:pointer">
            ${esc(t('prod.upload'))}
            <input type="file" id="fileImg" accept="image/*" hidden>
          </label>
        </div>
      </div>

      ${
        product?.variants?.length
          ? `<div class="field"><label>${esc(t('prod.variants'))}</label>
             <table><thead><tr><th>${esc(t('common.name'))}</th><th>SKU</th><th class="num">${esc(t('prod.stock'))}</th></tr></thead>
             <tbody>${product.variants.map((v) => `<tr><td>${esc(v.title)}</td><td>${esc(v.sku || '')}</td><td class="num">${v.inventoryQuantity}</td></tr>`).join('')}</tbody></table></div>`
          : ''
      }
    </div>`,
    `<button class="btn" id="cancelBtn">${esc(t('common.cancel'))}</button>
     <button class="btn primary" id="saveBtn">${esc(t('common.save'))}</button>`,
  );

  const imgs = images.map((image) => ({ ...image }));

  function imageRow(image, index) {
    return `<div class="img-row" data-index="${index}">
      <span class="thumb">${image.url ? `<img src="${esc(image.url)}" alt="">` : ''}</span>
      <input value="${esc(image.url || '')}" data-url="${index}" placeholder="${esc(t('prod.imageUrl'))}">
      <button class="btn sm danger" data-rmimg="${index}">×</button>
    </div>`;
  }

  function redrawImages() {
    $('#imgs').innerHTML = imgs.map((image, i) => imageRow(image, i)).join('');
    bindImageEvents();
  }

  function bindImageEvents() {
    $$('#imgs [data-url]').forEach((input) => {
      input.oninput = () => {
        const index = Number(input.dataset.url);
        imgs[index].url = input.value;
        const thumbEl = input.closest('.img-row').querySelector('.thumb');
        thumbEl.innerHTML = input.value ? `<img src="${esc(input.value)}" alt="">` : '';
      };
    });
    $$('#imgs [data-rmimg]').forEach((button) => {
      button.onclick = () => {
        imgs.splice(Number(button.dataset.rmimg), 1);
        redrawImages();
      };
    });
  }
  bindImageEvents();

  $('#addImg').onclick = () => {
    imgs.push({ url: '', alt: '' });
    redrawImages();
  };

  $('#fileImg').onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const result = await api('upload_image', {
        filename: file.name,
        contentBase64: base64,
        mimeType: file.type,
      });
      imgs.push({ url: result.url, alt: file.name });
      redrawImages();
      toast(t('prod.saved'));
    } catch (err) {
      toast(err.message, true);
    }
  };

  $('#cancelBtn').onclick = closePanel;

  $('#saveBtn').onclick = async () => {
    const button = $('#saveBtn');
    button.disabled = true;
    try {
      const payload = {
        title: $('#fTitle').value.trim(),
        descriptionHtml: `<p>${$('#fDesc').value.trim()}</p>`,
        vendor: $('#fVendor').value.trim(),
        status: $('#fStatus').value,
        categoryId: $('#fCategory').value || null,
        images: imgs.filter((image) => image.url).map((image) => ({ url: image.url, alt: image.alt || '' })),
      };
      const tax = $('#fTax').value.trim();
      if (tax !== '') payload.taxRate = Number(tax);

      if (product) {
        const price = $('#fPrice').value.trim();
        if (price) {
          await api('manage_variants', {
            productId: product.id,
            action: 'update',
            variants: product.variants.map((v) => ({ id: v.id, price })),
          });
        }
        await api('update_product', { id: product.id, ...payload });
      } else {
        const price = $('#fPrice').value.trim() || '0.00';
        const created = await api('create_product', { ...payload, title: payload.title || 'Producto' });
        await api('manage_variants', {
          productId: created.product.id,
          action: 'update',
          variants: created.product.variants.map((v) => ({ id: v.id, price })),
        });
      }
      closePanel();
      toast(t('prod.saved'));
      renderSection();
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
    }
  };
}

async function deleteProduct(id) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  if (!window.confirm(t('prod.confirm', { name: product.title }))) return;
  try {
    await api('delete_product', { id, confirm: true });
    toast(t('prod.deleted'));
    renderSection();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ------------------------------------------------------------- categories */

async function renderCategories(content) {
  const data = await api('list_categories');
  state.categories = data.categories || [];

  content.innerHTML = `
    <div class="toolbar">
      <button class="btn primary" id="newCat">${esc(t('cat.new'))}</button>
    </div>
    ${
      state.categories.length
        ? `<table><thead><tr>
            <th>${esc(t('cat.name'))}</th><th>${esc(t('cat.slug'))}</th>
            <th class="num">${esc(t('cat.tax'))}</th><th class="num">${esc(t('cat.products'))}</th>
            <th>${esc(t('common.actions'))}</th></tr></thead>
           <tbody>${state.categories.map((c) => `<tr>
             <td><strong>${esc(c.name)}</strong></td>
             <td class="muted">${esc(c.slug)}</td>
             <td class="num">${c.taxRate ?? '—'}</td>
             <td class="num">${state.products.filter((p) => p.category?.id === c.id).length}</td>
             <td><button class="link" data-editcat="${esc(c.id)}">${esc(t('prod.edit'))}</button>
                 <button class="link" style="color:var(--clay)" data-delcat="${esc(c.id)}">${esc(t('prod.delete'))}</button></td>
           </tr>`).join('')}</tbody></table>`
        : `<div class="empty">${esc(t('cat.empty'))}</div>`
    }`;

  $('#newCat').onclick = () => editCategory(null);
  $$('#prodList [data-editcat], [data-editcat]').forEach((button) => {
    button.onclick = () => editCategory(button.dataset.editcat);
  });
  $$('[data-delcat]').forEach((button) => {
    button.onclick = () => deleteCategory(button.dataset.delcat);
  });
}

function editCategory(id) {
  const category = id ? state.categories.find((c) => c.id === id) : null;
  openPanel(
    category ? category.name : t('cat.new'),
    `<div class="form">
      <div class="field"><label>${esc(t('cat.name'))}</label>
        <input id="cName" value="${esc(category?.name || '')}"></div>
      <div class="field"><label>${esc(t('cat.slug'))}</label>
        <input id="cSlug" value="${esc(category?.slug || '')}"></div>
      <div class="field"><label>${esc(t('cat.tax'))}</label>
        <input id="cTax" value="${esc(category?.taxRate ?? '')}" placeholder="21">
        <span class="help">${esc(t('prod.fieldTax'))}</span></div>
    </div>`,
    `<button class="btn" id="cancelBtn">${esc(t('common.cancel'))}</button>
     <button class="btn primary" id="saveBtn">${esc(t('common.save'))}</button>`,
  );

  $('#cancelBtn').onclick = closePanel;
  $('#saveBtn').onclick = async () => {
    const button = $('#saveBtn');
    button.disabled = true;
    try {
      const name = $('#cName').value.trim();
      if (!name) throw new Error(t('cat.name'));
      const tax = $('#cTax').value.trim();
      const payload = { name, taxRate: tax === '' ? null : Number(tax) };
      if ($('#cSlug').value.trim()) payload.slug = $('#cSlug').value.trim();
      if (category) await api('update_category', { id: category.id, ...payload });
      else await api('create_category', payload);
      closePanel();
      toast(category ? t('cat.saved') : t('cat.created'));
      renderSection();
    } catch (err) {
      toast(err.message, true);
    } finally {
      button.disabled = false;
    }
  };
}

async function deleteCategory(id) {
  const category = state.categories.find((c) => c.id === id);
  if (!category) return;
  if (!window.confirm(t('cat.confirm', { name: category.name }))) return;
  try {
    await api('delete_category', { id, confirm: true });
    toast(t('cat.deleted'));
    renderSection();
  } catch (err) {
    toast(err.message, true);
  }
}

/* ----------------------------------------------------------------- orders */

async function renderOrders(content) {
  const data = await api('search_orders', { limit: 50 });
  state.orders = data.orders || [];

  content.innerHTML = state.orders.length
    ? `<table><thead><tr>
        <th>#</th><th>${esc(t('ord.customer'))}</th><th>${esc(t('ord.date'))}</th>
        <th>${esc(t('ord.payment'))}</th><th>${esc(t('ord.fulfilment'))}</th>
        <th class="num">${esc(t('ord.total'))}</th></tr></thead>
       <tbody>${state.orders.map((o) => `<tr style="cursor:pointer" data-order="${esc(o.id)}">
         <td>${esc(o.name)}</td>
         <td>${esc(o.customer?.email || '—')}</td>
         <td>${esc(new Date(o.createdAt).toLocaleDateString(state.locale))}</td>
         <td><span class="pill-tag ${o.displayFinancialStatus === 'PAID' ? 'ok' : 'warn'}">${esc(o.displayFinancialStatus)}</span></td>
         <td><span class="pill-tag ${o.displayFulfillmentStatus === 'FULFILLED' ? 'ok' : ''}">${esc(o.displayFulfillmentStatus)}</span></td>
         <td class="num">${esc(money(o.totalPrice?.amount))}</td></tr>`).join('')}</tbody></table>`
    : `<div class="empty">${esc(t('ord.empty'))}</div>`;

  $$('[data-order]').forEach((row) => {
    row.onclick = () => openOrder(row.dataset.order);
  });
}

async function openOrder(id) {
  const data = await api('get_order', { orderId: id });
  const order = data.order;
  openPanel(
    order.name,
    `<div class="form">
      <div class="row2">
        <div class="field"><label>${esc(t('ord.customer'))}</label>
          <div>${esc(order.customer?.email || '—')}</div></div>
        <div class="field"><label>${esc(t('ord.payment'))}</label>
          <div><span class="pill-tag ${order.displayFinancialStatus === 'PAID' ? 'ok' : 'warn'}">${esc(order.displayFinancialStatus)}</span></div></div>
      </div>
      <div class="field"><label>${esc(t('ord.lines'))}</label>
        <table><tbody>${order.lineItems.map((line) => `<tr>
          <td>${esc(line.title)}<br><span class="muted">${esc(line.variant?.title || '')}</span></td>
          <td class="num">${line.quantity}</td>
          <td class="num">${esc(money(line.totalPrice?.amount))}</td></tr>`).join('')}</tbody></table></div>
      <div class="field"><label>${esc(t('ord.total'))}</label>
        <div>${esc(money(order.totalPrice?.amount))}</div></div>
      ${order.shippingAddress ? `<div class="field"><label>${esc(t('ord.address'))}</label>
        <div>${esc([order.shippingAddress.address1, order.shippingAddress.city, order.shippingAddress.zip, order.shippingAddress.country].filter(Boolean).join(', '))}</div></div>` : ''}
      <div class="row2">
        <div class="field"><label>${esc(t('ord.trackingCompany'))}</label><input id="trCompany"></div>
        <div class="field"><label>${esc(t('ord.trackingNumber'))}</label><input id="trNumber"></div>
      </div>
    </div>`,
    `<button class="btn" id="cancelBtn">${esc(t('common.close'))}</button>
     <button class="btn" id="payBtn">${esc(t('ord.markPaid'))}</button>
     <button class="btn primary" id="shipBtn">${esc(t('ord.fulfil'))}</button>`,
  );

  $('#cancelBtn').onclick = closePanel;

  $('#payBtn').onclick = async () => {
    try {
      await api('update_order', { id: order.id, financialStatus: 'PAID' });
      toast(t('ord.marked'));
      closePanel();
      renderSection();
    } catch (err) {
      toast(err.message, true);
    }
  };

  $('#shipBtn').onclick = async () => {
    const company = $('#trCompany').value.trim();
    const number = $('#trNumber').value.trim();
    try {
      await api('fulfill_order', {
        orderId: order.id,
        trackingInfo: company || number ? { company, number } : undefined,
      });
      toast(t('ord.marked'));
      closePanel();
      renderSection();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

/* --------------------------------------------------------------- settings */

async function renderSettings(content) {
  const [settings, rates, info, catalogue] = await Promise.all([
    api('update_settings', {}),
    api('list_tax_rates'),
    api('store_info'),
    fetch('/tools').then((r) => r.json()).then((r) => r.data || []),
  ]);

  content.innerHTML = `
    <h2 class="block">${esc(t('set.title'))}</h2>
    <div class="form">
      <div class="row2">
        <div class="field"><label>${esc(t('set.shopName'))}</label><input id="sName" value="${esc(settings.shopName || '')}"></div>
        <div class="field"><label>${esc(t('set.currency'))}</label><input id="sCurrency" value="${esc(settings.currency || 'EUR')}"></div>
      </div>
      <div class="row2">
        <div class="field"><label>${esc(t('set.taxCountry'))}</label>
          <select id="sCountry">
            ${rates.rates.map((r) => `<option value="${esc(r.country)}" ${settings.taxCountry === r.country ? 'selected' : ''}>${esc(r.name)} · ${r.rate}%</option>`).join('')}
          </select></div>
        <div class="field"><label>${esc(t('set.defaultLocale'))}</label>
          <select id="sLocale">
            ${LOCALES.map((code) => `<option value="${code}" ${settings.defaultLocale === code ? 'selected' : ''}>${esc(LOCALE_NAMES[code])}</option>`).join('')}
          </select></div>
      </div>
      <div class="row2">
        <div class="field"><label>${esc(t('set.freeShipping'))}</label>
          <input id="sFree" type="number" step="0.01" value="${esc(settings.freeShippingThreshold ?? 50)}"></div>
        <div class="field"><label>${esc(t('set.shippingFlat'))}</label>
          <input id="sShip" type="number" step="0.01" value="${esc(settings.shippingFlatRate ?? 4.9)}"></div>
      </div>
      <div class="field">
        <label class="switch">
          <input type="checkbox" id="sInclude" ${settings.pricesIncludeTax !== false ? 'checked' : ''}>
          ${esc(t('set.pricesIncludeTax'))}
        </label>
      </div>
      <div><button class="btn primary" id="saveSettings">${esc(t('common.save'))}</button></div>
    </div>

    <h2 class="block">${esc(t('set.stripe'))}</h2>
    <div class="form">
      <div class="field">
        <div>${state.shop.stripeEnabled ? `<span class="pill-tag ok">${esc(t('set.connected'))}</span>` : `<span class="pill-tag warn">${esc(t('set.notConnected'))}</span>`}</div>
        <span class="help">${esc(t('set.stripeHint'))}</span>
      </div>
    </div>

    <h2 class="block">${esc(t('set.api'))}</h2>
    <div class="form">
      <div class="field">
        <div><span class="pill-tag">${esc(t('common.total'))}: ${catalogue.length} tools</span></div>
        <span class="help">${esc(t('set.apiHint'))}</span>
      </div>
    </div>`;

  $('#saveSettings').onclick = async () => {
    try {
      await api('update_settings', {
        shopName: $('#sName').value.trim(),
        currency: $('#sCurrency').value.trim().toUpperCase(),
        taxCountry: $('#sCountry').value,
        defaultLocale: $('#sLocale').value,
        pricesIncludeTax: $('#sInclude').checked,
        freeShippingThreshold: Number($('#sFree').value),
        shippingFlatRate: Number($('#sShip').value),
      });
      toast(t('set.saved'));
      renderSection();
    } catch (err) {
      toast(err.message, true);
    }
  };
}

/* ----------------------------------------------------------------- design */

async function renderDesign(content) {
  const themes = (window.__SHOP__ && window.__SHOP__.themes) || [];
  if (!themes.length) {
    content.innerHTML = `<div class="empty">${esc(t('common.error'))}</div>`;
    return;
  }
  const settings = await api('update_settings', {});
  const activeId = settings.defaultTheme || 'aurora';

  content.innerHTML = `
    <h2 class="block">${esc(t('design.title'))}</h2>
    <p class="muted" style="margin:-6px 0 18px;max-width:62ch">${esc(t('design.hint'))}</p>
    <div class="themes">
      ${themes.map((theme) => `<button class="theme${theme.id === activeId ? ' on' : ''}" data-theme="${esc(theme.id)}">
        <span class="swatches">
          <i style="background:${esc(theme.palette.paper)}"></i>
          <i style="background:${esc(theme.palette.accent)}"></i>
          <i style="background:${esc(theme.palette.highlight)}"></i>
          <i style="background:${esc(theme.palette.ink)}"></i>
        </span>
        <span class="tname">${esc(theme.name)}</span>
        <span class="tind">${esc(theme.industry)}</span>
        ${theme.id === activeId ? `<span class="pill-tag ok">${esc(t('design.active'))}</span>` : ''}
      </button>`).join('')}
    </div>`;

  $$('[data-theme]').forEach((button) => {
    button.onclick = async () => {
      try {
        await api('update_settings', { defaultTheme: button.dataset.theme });
        toast(t('design.active'));
        renderSection();
      } catch (err) {
        toast(err.message, true);
      }
    };
  });
}

/* ------------------------------------------------------------------ boot */

function detectLocale() {
  const injected = window.__SHOP__?.locale;
  if (injected && LOCALES.includes(injected)) return injected;
  const fromUrl = new URL(window.location.href).searchParams.get('lang');
  if (fromUrl && LOCALES.includes(fromUrl)) return fromUrl;
  const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LOCALES.includes(browser) ? browser : 'en';
}

async function boot() {
  state.locale = detectLocale();
  state.shop = window.__SHOP__ || {};
  applyTranslations();

  $('#panelClose').onclick = closePanel;
  $('#scrim').onclick = closePanel;
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePanel();
  });

  const hash = window.location.hash.replace('#', '');
  if (SECTIONS.some((s) => s.id === hash)) state.section = hash;

  renderNav();
  $('#sectionTitle').textContent = t(SECTIONS.find((s) => s.id === state.section).label);

  try {
    const [info, categories, products] = await Promise.all([
      api('store_info'),
      api('list_categories').catch(() => ({ categories: [] })),
      api('search_products', { limit: 100 }).catch(() => ({ products: [] })),
    ]);
    state.categories = categories.categories || [];
    state.products = products.products || [];
    const pill = $('#storePill');
    pill.textContent = `${info.mode} · ${info.shop} · IVA ${info.vatRate}%`;
  } catch (err) {
    $('#storePill').textContent = t('common.error');
  }

  renderSection();
}

boot().catch((err) => {
  $('#content').innerHTML = `<div class="err-box">${esc(err.message)}</div>`;
});
