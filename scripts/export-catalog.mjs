#!/usr/bin/env node
/**
 * Exports the mock catalogue to `public/assets/catalog.json`.
 *
 * The public site is static, so it cannot ask the API for the catalogue.
 * Rather than keeping a second hand written copy of the products, the static
 * catalogue is derived from the same seed the mock backend uses.
 *
 *   npm run build
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MockBackend } from '../src/backends/mock.js';
import { ShopStore } from '../src/store.js';
import { STRINGS } from '../src/i18n.js';
import { THEMES } from '../src/themes.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'assets', 'catalog.json');
const I18N_OUT = join(ROOT, 'public', 'assets', 'i18n.js');
const DATA_FILE = join(ROOT, 'data', 'shop.json');

const store = new ShopStore(DATA_FILE);
const backend = new MockBackend(store);

// First run: give the shop a taxonomy so the owner has something to edit.
if (!store.listCategories().length) {
  const { products: seeded } = await backend.searchProducts({ limit: 100 });
  const types = [...new Set(seeded.map((p) => p.productType))].sort();
  for (const [index, name] of types.entries()) {
    const category = store.createCategory({ name, position: index });
    for (const product of seeded.filter((p) => p.productType === name)) {
      store.setProductMeta(product.id, { category: category.id });
    }
  }
  process.stdout.write(`seeded ${types.length} categories: ${types.join(', ')}\n`);
}

const { products } = await backend.searchProducts({ limit: 100 });
const categories = store.listCategories();

const catalogue = {
  generatedAt: new Date().toISOString(),
  currency: backend.currency,
  shop: { name: 'AURORA', tagline: 'Nordic goods for everyday use', domain: 'demo.myshopify.com' },
  settings: {
    currency: store.settings.currency || backend.currency,
    taxCountry: store.settings.taxCountry || 'ES',
    vatRate: 21,
    pricesIncludeTax: store.settings.pricesIncludeTax !== false,
    freeShippingThreshold: store.settings.freeShippingThreshold ?? 50,
    shippingFlatRate: store.settings.shippingFlatRate ?? 4.9,
    defaultLocale: store.settings.defaultLocale || 'en',
  },
  categories: categories.length ? categories.map((c) => ({ id: c.id, name: c.name, slug: c.slug })) : [],
  theme: { id: store.settings.defaultTheme || 'aurora', name: store.settings.shopName || 'AURORA' },
  themes: THEMES.map((t) => ({
    id: t.id,
    name: t.name,
    industry: t.industry,
    palette: t.palette,
    layout: t.layout,
    fonts: t.fonts,
  })),
  products: products.map((product) => ({
    id: product.id,
    title: product.title,
    handle: product.handle,
    description: stripHtml(product.descriptionHtml),
    descriptionHtml: product.descriptionHtml,
    category: product.category || null,
    productType: product.productType,
    vendor: product.vendor,
    tags: product.tags,
    status: product.status,
    images: product.images || [],
    taxRate: product.taxRate,
    price: product.priceRange.minPrice?.amount ?? '0.00',
    compareAtPrice: product.variants.find((v) => v.compareAtPrice)?.compareAtPrice ?? null,
    totalInventory: product.totalInventory,
    variants: product.variants.map((variant) => ({
      id: variant.id,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      sku: variant.sku,
      available: variant.inventoryQuantity,
      option: variant.selectedOptions?.[0]?.name ?? 'Title',
      optionValue: variant.selectedOptions?.[0]?.value ?? variant.title,
    })),
  })),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(catalogue, null, 2)}\n`);

// The browser needs the same translation table the server uses.
writeFileSync(
  I18N_OUT,
  `/* Generated from src/i18n.js. Do not edit by hand. */\nwindow.__I18N__ = ${JSON.stringify(STRINGS, null, 2)};\n`,
);

process.stdout.write(
  `catalogue: ${catalogue.products.length} products, ${catalogue.categories.length} categories -> ${OUT}\n` +
    `i18n: ${Object.keys(STRINGS).length} locales -> ${I18N_OUT}\n`,
);

function stripHtml(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}
