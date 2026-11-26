/**
 * Importador de Wix Store.
 *
 * La API de Stores de Wix expone el catálogo en
 * https://api.wix.com/stores/v1 (con el token de la app y el site
 * identificado) o en el formato antiguo
 * https://manage.wix.com/dashboard/<siteId>/stores/v1.
 *
 * Trae productos con sus variantes, imágenes, colecciones y stock.
 */

import { upstream, forbidden, invalidInput } from '../errors.js';

const LIMIT = 100;

export const source = 'wix';

export const label = 'Wix Store';

export const fields = [
  { name: 'siteId', label: 'Site ID', placeholder: 'a1b2c3d4-...', required: true },
  { name: 'token', label: 'Access token', type: 'password', required: true },
  { name: 'baseUrl', label: 'Base URL', placeholder: 'https://api.wix.com/stores/v1', required: false },
];

function baseUrl(connection) {
  if (connection.baseUrl) {
    return String(connection.baseUrl).trim().replace(/\/+$/, '');
  }
  const siteId = String(connection.siteId || '').trim();
  if (!siteId) throw invalidInput('The Wix site ID is required.');
  return `https://manage.wix.com/dashboard/${siteId}/stores/v1`;
}

async function request(connection, path) {
  const token = String(connection.token || '').trim();
  if (!token) throw invalidInput('The Wix access token is required.');
  let res;
  try {
    res = await fetch(`${baseUrl(connection)}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(connection.siteId ? { 'X-Wix-Site-Id': String(connection.siteId) } : {}),
      },
    });
  } catch (err) {
    throw upstream(`Could not reach the Wix API: ${err.message}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw forbidden('Wix refused the token. Check the access token and its scopes.');
  }
  if (!res.ok) {
    const text = await res.text();
    throw upstream(`Wix answered ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function testConnection(connection) {
  const data = await request(connection, `/products?limit=1`);
  return {
    ok: true,
    message: 'Connected to the Wix store',
    details: {
      siteId: connection.siteId || null,
      firstProduct: data.products?.[0]?.name || null,
      baseUrl: baseUrl(connection),
    },
  };
}

export async function fetchCatalogue(connection, { limit = 500 } = {}) {
  const collections = await request(connection, '/collections').catch(() => ({ collections: [] }));
  const products = [];

  for (let offset = 0; offset < limit; offset += LIMIT) {
    const data = await request(connection, `/products?limit=${LIMIT}&offset=${offset}`);
    const batch = data.products || [];
    if (!batch.length) break;
    for (const product of batch) products.push(await normalise(connection, product, collections));
    if (batch.length < LIMIT) break;
  }

  return { products: products.slice(0, limit), pages: Math.ceil(products.length / LIMIT) || 1 };
}

async function normalise(connection, product, collections) {
  const variantData = await request(
    connection,
    `/products/variants?productId=${encodeURIComponent(product.id)}`,
  ).catch(() => ({ variants: [] }));

  const variants = (variantData.variants || []).length
    ? variantData.variants.map((variant) => ({
        title: variant.name || variant.sku || 'Default',
        price: String(variant.price ?? product.price ?? 0),
        compareAtPrice: variant.discountedPrice ? String(variant.discountedPrice) : null,
        sku: variant.sku || '',
        barcode: '',
        taxable: true,
        tracked: product.trackInventory !== false,
        inventoryQuantity: variant.inventory ?? product.stock ?? 0,
        optionValues: [],
      }))
    : [
        {
          title: 'Default',
          price: String(product.price ?? 0),
          compareAtPrice: null,
          sku: product.sku || '',
          barcode: '',
          taxable: true,
          tracked: product.trackInventory !== false,
          inventoryQuantity: product.stock ?? 0,
          optionValues: [],
        },
      ];

  const collectionNames = (product.collections || []).map(
    (id) => collections.collections?.find((c) => c.id === id)?.name || null,
  ).filter(Boolean);

  const images = (product.mediaItems || [])
    .map((media) => {
      const image = media.image || media;
      return { url: image.url || image.src || '', alt: image.altText || '' };
    })
    .filter((image) => image.url);

  return {
    sourceId: `wix_${product.id}`,
    title: product.name,
    handle: (product.slug || product.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    descriptionHtml: product.description || product.descriptionI18n || '',
    vendor: product.brand || product.vendor || '',
    productType: collectionNames[0] || product.productType || '',
    status: product.status === 'ACTIVE' ? 'ACTIVE' : 'DRAFT',
    tags: (product.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.name)),
    categories: collectionNames.map((name) => ({ name, slug: slugify(name) })),
    images,
    variants,
  };
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
