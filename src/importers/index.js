/**
 * Importadores de catálogo.
 *
 * Tres plataformas, un mismo contrato:
 *
 *   testConnection(connection) -> { ok, message, details }
 *   fetchCatalogue(connection, { limit }) -> { products, pages }
 *
 * Los productos se normalizan al mismo formato para que el resto del
 * sistema no tenga que saber de dónde vinieron.
 */

import * as shopify from './shopify.js';
import * as woocommerce from './woocommerce.js';
import * as wix from './wix.js';
import { invalidInput, upstream } from '../errors.js';
import { slugify } from '../store.js';

export const IMPORTERS = { shopify, woocommerce, wix };

export const IMPORT_SOURCES = Object.keys(IMPORTERS);

export function importer(source) {
  const found = IMPORTERS[source];
  if (!found) {
    throw invalidInput(`Unknown import source: ${source}. Use one of ${IMPORT_SOURCES.join(', ')}.`);
  }
  return found;
}

/** The connection fields the admin has to ask for, per platform. */
export function connectionFields(source) {
  return importer(source).fields;
}

/**
 * Normalise an imported product into the shape our catalogue uses.
 *
 * @param {string} source
 * @param {object} product as returned by the importer
 * @param {object} context { locationId, currency }
 */
export function normaliseProduct(source, product, context) {
  const now = new Date().toISOString();
  const id = `imp_${slugify(`${source}_${product.sourceId}`).replace(/-/g, '_')}`;

  const variants = (product.variants || []).map((variant, index) => {
    const inventory = {};
    if (context.locationId) inventory[context.locationId] = variant.inventoryQuantity ?? 0;
    return {
      id: `gid://shopify/ProductVariant/imp${index + 1}`,
      title: variant.title || 'Default',
      price: String(variant.price ?? '0.00'),
      compareAtPrice: variant.compareAtPrice || null,
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      taxable: variant.taxable !== false,
      tracked: variant.tracked !== false,
      inventoryItemId: `gid://shopify/InventoryItem/imp${index + 1}`,
      selectedOptions: variant.optionValues || [{ name: 'Title', value: variant.title || 'Default' }],
      inventory,
    };
  });

  return {
    id,
    source,
    sourceId: product.sourceId,
    title: product.title,
    descriptionHtml: product.descriptionHtml || '',
    handle: product.handle || slugify(product.title),
    status: product.status || 'ACTIVE',
    vendor: product.vendor || '',
    productType: product.productType || '',
    tags: product.tags || [],
    createdAt: now,
    updatedAt: now,
    imageUrl: product.images?.[0]?.url || null,
    images: product.images || [],
    variants: variants.length ? variants : [],
    collections: [],
    metafields: [],
    categoryNames: (product.categories || []).map((c) => c.name).filter(Boolean),
  };
}

/**
 * Fetch a catalogue and write it into our catalogue layer.
 *
 * @param {object} options
 * @param {string} options.source
 * @param {object} options.connection
 * @param {object} options.store the ShopStore
 * @param {object} [options.locations] [{ id }]
 * @param {number} [options.limit]
 * @param {boolean} [options.dryRun]
 * @returns {Promise<object>} the report
 */
export async function runImport({ source, connection, store, locations = [], limit = 500, dryRun = false }) {
  const module = importer(source);
  const locationId = locations[0]?.id || null;
  const { products, pages } = await module.fetchCatalogue(connection, { limit });

  const report = {
    source,
    label: module.label,
    pages,
    read: products.length,
    imported: 0,
    updated: 0,
    skipped: 0,
    problems: [],
    products: [],
    dryRun: Boolean(dryRun),
  };

  for (const product of products) {
    try {
      const normalised = normaliseProduct(source, product, { locationId });
      if (!normalised.variants.length) {
        report.skipped += 1;
        report.problems.push(`${normalised.title}: no variants, skipped.`);
        continue;
      }
      if (dryRun) {
        report.imported += 1;
        report.products.push({
          id: normalised.id,
          title: normalised.title,
          variants: normalised.variants.length,
          price: normalised.variants[0].price,
        });
        continue;
      }
      const result = store.upsertImported(normalised);
      if (result.action === 'imported') report.imported += 1;
      else report.updated += 1;
      report.products.push({
        id: normalised.id,
        title: normalised.title,
        variants: normalised.variants.length,
        price: normalised.variants[0].price,
      });
    } catch (err) {
      report.skipped += 1;
      report.problems.push(`${product.title || product.sourceId}: ${err.message}`);
    }
  }

  return report;
}
