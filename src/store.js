/**
 * Datos propios de la tienda.
 *
 * Shopify guarda todo en su plataforma y cobra por cada módulo. Aquí lo
 * guardamos nosotros, en un fichero JSON, sin coste por módulo:
 *
 *   - categorías (nuestras, no colecciones de Shopify)
 *   - imágenes de producto (URLs o subidas)
 *   - tipo de IVA por producto
 *   - ajustes de la tienda (país de impuestos, moneda, envío, idioma)
 *
 * Los datos que sí son de Shopify (productos, pedidos, clientes) viven en el
 * backend correspondiente. Este store guarda el "enlace" entre ambos.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DEFAULT_TAX_COUNTRY } from './tax.js';

const DEFAULTS = {
  settings: {
    shopName: 'AURORA',
    currency: 'EUR',
    taxCountry: DEFAULT_TAX_COUNTRY,
    pricesIncludeTax: true,
    defaultLocale: 'en',
    defaultTheme: 'aurora',
    freeShippingThreshold: 50,
    shippingFlatRate: 4.9,
    stripeEnabled: false,
  },
  categories: [],
  products: {},
  quotes: [],
};

export class ShopStore {
  /**
   * @param {string} file path of the JSON file
   */
  constructor(file) {
    this.file = file;
    this.data = structuredClone(DEFAULTS);
    this.load();
  }

  load() {
    try {
      if (!existsSync(this.file)) return;
      const parsed = JSON.parse(readFileSync(this.file, 'utf8'));
      this.data = {
        settings: { ...DEFAULTS.settings, ...(parsed.settings || {}) },
        categories: parsed.categories || [],
        products: parsed.products || {},
        quotes: parsed.quotes || [],
      };
    } catch {
      this.data = structuredClone(DEFAULTS);
    }
  }

  save() {
    try {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file, `${JSON.stringify(this.data, null, 2)}\n`);
    } catch {
      /* the store stays in memory if the disk is not writable */
    }
  }

  get settings() {
    return this.data.settings;
  }

  updateSettings(patch = {}) {
    const allowed = [
      'shopName',
      'currency',
      'taxCountry',
      'pricesIncludeTax',
      'defaultLocale',
      'freeShippingThreshold',
      'shippingFlatRate',
      'defaultTheme',
    ];
    for (const key of allowed) {
      if (patch[key] !== undefined) this.data.settings[key] = patch[key];
    }
    this.save();
    return this.settings;
  }

  // ------------------------------------------------------------ categorías

  listCategories() {
    return [...this.data.categories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  findCategory(idOrSlug) {
    const key = String(idOrSlug || '').toLowerCase();
    return this.data.categories.find(
      (c) => c.id === idOrSlug || c.slug === key || c.name.toLowerCase() === key,
    );
  }

  createCategory({ name, slug, description = '', taxRate, imageUrl = '' }) {
    const category = {
      id: `cat_${randomUUID().slice(0, 8)}`,
      name: String(name),
      slug: slug || slugify(name),
      description,
      taxRate: taxRate === undefined || taxRate === null ? null : Number(taxRate),
      imageUrl,
      position: this.data.categories.length,
      createdAt: new Date().toISOString(),
    };
    this.data.categories.push(category);
    this.save();
    return category;
  }

  updateCategory(id, patch = {}) {
    const category = this.findCategory(id);
    if (!category) return null;
    for (const key of ['name', 'slug', 'description', 'imageUrl', 'position']) {
      if (patch[key] !== undefined) category[key] = patch[key];
    }
    if (patch.taxRate !== undefined) {
      category.taxRate = patch.taxRate === null ? null : Number(patch.taxRate);
    }
    this.save();
    return category;
  }

  deleteCategory(id) {
    const index = this.data.categories.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const [removed] = this.data.categories.splice(index, 1);
    for (const meta of Object.values(this.data.products)) {
      if (meta.category === removed.id) meta.category = null;
    }
    this.save();
    return removed;
  }

  // ------------------------------------------------------------- productos

  productMeta(productId) {
    return this.data.products[productId] || null;
  }

  setProductMeta(productId, patch = {}) {
    const current = this.data.products[productId] || { images: [], category: null, taxRate: null };
    const next = { ...current };
    if (patch.category !== undefined) next.category = patch.category || null;
    if (patch.taxRate !== undefined) next.taxRate = patch.taxRate === null ? null : Number(patch.taxRate);
    if (patch.images !== undefined) {
      next.images = (patch.images || [])
        .filter((image) => image && image.url)
        .slice(0, 5)
        .map((image) => ({
          url: String(image.url),
          alt: image.alt ? String(image.alt) : '',
          isDefault: Boolean(image.isDefault),
        }));
    }
    this.data.products[productId] = next;
    this.save();
    return next;
  }

  /** Category assigned to a product, falling back to the product type. */
  categoryFor(product) {
    const meta = this.data.products[product.id];
    if (meta?.category) {
      const category = this.findCategory(meta.category);
      if (category) return category;
    }
    return null;
  }

  /** VAT rate that applies to a product. */
  taxRateFor(product, fallbackRate) {
    const meta = this.data.products[product.id];
    if (meta?.taxRate !== null && meta?.taxRate !== undefined) return Number(meta.taxRate);
    const category = this.categoryFor(product);
    if (category?.taxRate !== null && category?.taxRate !== undefined) return Number(category.taxRate);
    return fallbackRate;
  }

  imagesFor(product) {
    const meta = this.data.products[product.id];
    if (meta?.images?.length) return meta.images;
    if (product.imageUrl) return [{ url: product.imageUrl, alt: product.title }];
    return [];
  }

  // -------------------------------------------------------------- ofertas

  listQuotes() {
    return [...this.data.quotes].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  findQuote(id) {
    return this.data.quotes.find((q) => q.id === id || q.number === id);
  }

  createQuote(quote) {
    const number = `OF-${new Date().getFullYear()}-${String(this.data.quotes.length + 1).padStart(4, '0')}`;
    const created = { id: `quo_${randomUUID().slice(0, 8)}`, number, ...quote };
    this.data.quotes.push(created);
    this.save();
    return created;
  }

  updateQuote(id, patch) {
    const quote = this.findQuote(id);
    if (!quote) return null;
    for (const [key, value] of Object.entries(patch)) {
      if (value !== undefined) quote[key] = value;
    }
    this.save();
    return quote;
  }

  deleteQuote(id) {
    const index = this.data.quotes.findIndex((q) => q.id === id);
    if (index === -1) return null;
    const [removed] = this.data.quotes.splice(index, 1);
    this.save();
    return removed;
  }
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
