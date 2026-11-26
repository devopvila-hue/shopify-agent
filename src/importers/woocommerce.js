/**
 * Importador de WooCommerce.
 *
 * WooCommerce expone su catálogo por REST en /wp-json/wc/v3 con
 * autenticación por consumer key y secret (HTTP Basic, o los mismos
 * parámetros en la query, que es lo que acepta la mayoría de plugins).
 *
 * Trae productos con sus variaciones, imágenes, categorías y stock.
 */

import { upstream, forbidden, invalidInput } from '../errors.js';

const PER_PAGE = 100;

export const source = 'woocommerce';

export const label = 'WooCommerce';

export const fields = [
  { name: 'url', label: 'Store URL', placeholder: 'https://tienda.example.com', required: true },
  { name: 'key', label: 'Consumer key', required: true },
  { name: 'secret', label: 'Consumer secret', type: 'password', required: true },
];

function baseUrl(connection) {
  const url = String(connection.url || '').trim().replace(/\/+$/, '');
  if (!url) throw invalidInput('The WooCommerce store URL is required.');
  if (!/^https?:\/\//i.test(url)) throw invalidInput('The WooCommerce URL must start with http:// or https://');
  return `${url}/wp-json/wc/v3`;
}

function headers(connection) {
  const key = String(connection.key || '').trim();
  const secret = String(connection.secret || '').trim();
  if (!key || !secret) throw invalidInput('The WooCommerce consumer key and secret are required.');
  return {
    Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
    Accept: 'application/json',
  };
}

async function request(connection, path) {
  let res;
  try {
    res = await fetch(`${baseUrl(connection)}${path}`, { headers: headers(connection) });
  } catch (err) {
    throw upstream(`Could not reach ${baseUrl(connection)}: ${err.message}`);
  }
  if (res.status === 401 || res.status === 403) {
    throw forbidden('WooCommerce refused the credentials. Check the consumer key and secret.');
  }
  if (res.status === 404) {
    throw upstream(
      'WooCommerce REST not found. Is the store URL right and is the WooCommerce REST API enabled?',
    );
  }
  if (!res.ok) {
    const text = await res.text();
    throw upstream(`WooCommerce answered ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

export async function testConnection(connection) {
  const products = await request(connection, '/products?per_page=1');
  const headersInfo = await fetch(`${baseUrl(connection)}/system_status`, {
    headers: headers(connection),
  }).catch(() => null);
  const info = headersInfo?.ok ? await headersInfo.json() : {};
  return {
    ok: true,
    message: 'Connected to the WooCommerce store',
    details: {
      store: info?.environment?.name || info?.environment?.home_url || connection.url,
      version: info?.environment?.version || null,
      firstProduct: products?.[0]?.name || null,
    },
  };
}

export async function fetchCatalogue(connection, { limit = 500 } = {}) {
  const categories = await request(connection, '/products/categories?per_page=100').catch(() => []);
  const products = [];

  for (let page = 1; products.length < limit; page += 1) {
    const batch = await request(connection, `/products?per_page=${PER_PAGE}&page=${page}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const product of batch) products.push(await normalise(connection, product, categories));
    if (batch.length < PER_PAGE) break;
  }

  return { products: products.slice(0, limit), pages: Math.ceil(products.length / PER_PAGE) || 1 };
}

async function normalise(connection, product, categories) {
  const variations =
    product.type === 'variable' && product.variations?.length
      ? await request(
          connection,
          `/products/${product.id}/variations?per_page=${PER_PAGE}`,
        ).catch(() => [])
      : [];

  const categoryNames = (product.categories || []).map(
    (id) => categories.find((c) => c.id === id)?.name || `Categoría ${id}`,
  );

  const images = [
    ...(product.images || []).map((image) => ({ url: image.src, alt: image.alt || '' })),
    ...(product.image ? [{ url: product.image.src, alt: product.image.alt || '' }] : []),
  ];

  const variantList = variations.length
    ? variations.map((variation) => ({
        title: (variation.attributes || [])
          .map((attribute) => attribute.option)
          .filter(Boolean)
          .join(' / ') || variation.sku || 'Default',
        price: variation.price || '0',
        compareAtPrice: variation.regular_price && variation.regular_price !== variation.price
          ? variation.regular_price
          : null,
        sku: variation.sku || '',
        barcode: '',
        taxable: product.tax_status !== 'none',
        tracked: product.manage_stock === true,
        inventoryQuantity: variation.stock_quantity ?? 0,
        optionValues: (variation.attributes || [])
          .filter((attribute) => attribute.option)
          .map((attribute) => ({ name: attribute.name, value: attribute.option })),
      }))
    : [
        {
          title: 'Default',
          price: product.price || product.regular_price || '0',
          compareAtPrice:
            product.sale_price && product.sale_price !== product.regular_price
              ? product.regular_price
              : null,
          sku: product.sku || '',
          barcode: '',
          taxable: product.tax_status !== 'none',
          tracked: product.manage_stock === true,
          inventoryQuantity: product.stock_quantity ?? 0,
          optionValues: [],
        },
      ];

  return {
    sourceId: `woo_${product.id}`,
    title: product.name,
    handle: product.slug,
    descriptionHtml: product.description || product.short_description || '',
    vendor: product.brand ? (typeof product.brand === 'string' ? product.brand : '') : '',
    productType: categoryNames[0] || product.type || '',
    status: product.status === 'publish' ? 'ACTIVE' : 'DRAFT',
    tags: (product.tags || []).map((tag) => (typeof tag === 'string' ? tag : tag.name)),
    categories: categoryNames.map((name) => ({ name, slug: slugify(name) })),
    images,
    variants: variantList,
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
