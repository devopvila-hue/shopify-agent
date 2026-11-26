/**
 * Importador de Shopify.
 *
 * Admin GraphQL, con paginación por cursor. Trae el catálogo con variantes,
 * imágenes, categorías y stock.
 */

import { upstream, forbidden, invalidInput } from '../errors.js';

const DEFAULT_API_VERSION = '2026-10';

const CATALOGUE_QUERY = `
query ImportProducts($first: Int!, $after: String) {
  products(first: $first, after: $after, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id
      title
      handle
      descriptionHtml
      vendor
      productType
      status
      tags
      totalInventory
      options { name values }
      images(first: 10) { nodes { url altText } }
      variants(first: 100) {
        nodes {
          id
          title
          price
          compareAtPrice
          sku
          barcode
          taxable
          inventoryQuantity
          inventoryPolicy
          selectedOptions { name value }
          inventoryItem { id tracked }
        }
      }
      collections(first: 10) { nodes { id title } }
    }
  }
}`;

/**
 * @param {object} connection { domain, token, apiVersion? }
 */
function endpoint(connection) {
  // An explicit base URL wins: it lets the store sit behind a proxy, and it
  // is what the tests point at.
  if (connection.baseUrl) {
    return String(connection.baseUrl).trim().replace(/\/$/, '');
  }
  const domain = String(connection.domain || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!domain) throw invalidInput('The Shopify store domain is required.');
  const version = connection.apiVersion || DEFAULT_API_VERSION;
  return `https://${domain}/admin/api/${version}/graphql.json`;
}

async function graphql(connection, query, variables = {}) {
  const token = String(connection.token || '').trim();
  if (!token) throw invalidInput('The Shopify access token is required.');
  let res;
  try {
    res = await fetch(endpoint(connection), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (err) {
    throw upstream(`Could not reach ${endpoint(connection)}: ${err.message}`);
  }

  const text = await res.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw upstream('Shopify returned a non JSON response. Is the domain right?');
  }

  if (res.status === 401 || res.status === 403) {
    throw forbidden('Shopify refused the token. Check the access token and its scopes.');
  }
  if (!res.ok) {
    throw upstream(`Shopify answered ${res.status}: ${payload.errors?.[0]?.message || text.slice(0, 200)}`);
  }
  if (payload.errors?.length) {
    throw upstream(`Shopify rejected the request: ${payload.errors[0].message}`);
  }
  return payload.data;
}

export const source = 'shopify';

export const label = 'Shopify';

export const fields = [
  { name: 'domain', label: 'Store domain', placeholder: 'your-store.myshopify.com', required: true },
  { name: 'token', label: 'Admin API token', type: 'password', required: true },
  { name: 'apiVersion', label: 'API version', placeholder: DEFAULT_API_VERSION, required: false },
  { name: 'baseUrl', label: 'GraphQL endpoint', placeholder: 'https://store.myshopify.com/admin/api/2026-10/graphql.json', required: false },
];

/**
 * @param {object} connection
 * @returns {Promise<{ok: boolean, message: string, details: object}>}
 */
export async function testConnection(connection) {
  const data = await graphql(connection, '{ shop { name myshopifyDomain currencyCode } }');
  const shop = data.shop || {};
  return {
    ok: true,
    message: `Connected to ${shop.name || shop.myshopifyDomain || 'the store'}`,
    details: {
      shop: shop.name,
      domain: shop.myshopifyDomain,
      currency: shop.currencyCode,
      apiVersion: connection.apiVersion || DEFAULT_API_VERSION,
    },
  };
}

/**
 * @param {object} connection
 * @param {object} options { limit }
 */
export async function fetchCatalogue(connection, { limit = 250 } = {}) {
  const products = [];
  let cursor = null;
  let pages = 0;

  do {
    const data = await graphql(connection, CATALOGUE_QUERY, { first: 50, after: cursor });
    const connection_ = data.products || {};
    for (const node of connection_.nodes || []) products.push(normalise(node));
    cursor = connection_.pageInfo?.endCursor || null;
    pages += 1;
  } while (cursor && products.length < limit && pages < 20);

  return { products: products.slice(0, limit), pages };
}

function normalise(product) {
  return {
    sourceId: product.id,
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    status: product.status === 'ACTIVE' ? 'ACTIVE' : product.status === 'ARCHIVED' ? 'ARCHIVED' : 'DRAFT',
    tags: product.tags || [],
    categories: (product.collections?.nodes || []).map((c) => ({ name: c.title, slug: c.title })),
    images: (product.images?.nodes || []).map((image) => ({ url: image.url, alt: image.altText || '' })),
    variants: (product.variants?.nodes || []).map((variant) => ({
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice || null,
      sku: variant.sku || '',
      barcode: variant.barcode || '',
      taxable: variant.taxable !== false,
      tracked: variant.inventoryItem?.tracked !== false,
      inventoryQuantity: variant.inventoryQuantity ?? 0,
      optionValues: (variant.selectedOptions || []).map((o) => ({ name: o.name, value: o.value })),
    })),
  };
}
