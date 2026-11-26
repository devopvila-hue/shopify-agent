/**
 * Los tres importadores, probados contra servidores falsos que hablan cada
 * API de verdad: WooCommerce REST, Wix Stores y Shopify Admin GraphQL.
 *
 * No hace falta una tienda real para comprobar que el importador pide lo
 * correcto, entiende la respuesta y deja el catálogo como debe.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import * as shopifyImporter from '../src/importers/shopify.js';
import * as woocommerceImporter from '../src/importers/woocommerce.js';
import * as wixImporter from '../src/importers/wix.js';
import { runImport } from '../src/importers/index.js';
import { ShopStore } from '../src/store.js';
import { MockBackend } from '../src/backends/mock.js';

/** Boot a fake upstream and return its base url. */
async function fakeServer(handler) {
  const server = createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

/* ------------------------------------------------------------ WooCommerce */

const WOO_PRODUCTS = [
  {
    id: 501,
    name: 'Cuero para bolso',
    slug: 'cuero-para-bolso',
    description: '<p>Cuero vacuno 1,2 mm.</p>',
    short_description: 'Cuero vacuno',
    status: 'publish',
    type: 'variable',
    sku: 'CUERO-120',
    price: '24.00',
    regular_price: '24.00',
    sale_price: '',
    stock_quantity: 40,
    manage_stock: true,
    tax_status: 'taxable',
    categories: [7],
    tags: [{ name: 'cuero' }],
    images: [{ src: 'https://woo.example.com/cuero.jpg', alt: 'Cuero' }],
    image: { src: 'https://woo.example.com/cuero.jpg', alt: 'Cuero' },
    variations: [901, 902],
  },
  {
    id: 502,
    name: 'Patrón de bolso de mano',
    slug: 'patron-bolso-mano',
    description: '<p>PDF con el patrón a escala 1:1.</p>',
    status: 'publish',
    type: 'simple',
    sku: 'PAT-01',
    price: '9.50',
    regular_price: '9.50',
    sale_price: '',
    stock_quantity: 999,
    manage_stock: false,
    tax_status: 'taxable',
    categories: [8],
    tags: ['pdf'],
    images: [],
  },
];

const WOO_VARIATIONS = {
  901: {
    id: 901,
    sku: 'CUERO-120-NAT',
    price: '24.00',
    regular_price: '24.00',
    stock_quantity: 25,
    attributes: [{ name: 'Color', option: 'Natural' }],
  },
  902: {
    id: 902,
    sku: 'CUERO-120-NEGRO',
    price: '26.00',
    regular_price: '26.00',
    stock_quantity: 15,
    attributes: [{ name: 'Color', option: 'Negro' }],
  },
};

async function wooServer() {
  const expected = `Basic ${Buffer.from('ck_test:cs_test').toString('base64')}`;
  return fakeServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if ((req.headers.authorization || '') !== expected) {
      return json(res, 401, { error: 'invalid key or secret' });
    }

    if (url.pathname === '/wp-json/wc/v3/system_status') {
      return json(res, 200, { environment: { name: 'Tienda Woo', version: '8.9.0', home_url: 'https://woo.example.com' } });
    }
    if (url.pathname === '/wp-json/wc/v3/products/categories') {
      return json(res, 200, [
        { id: 7, name: 'Cuero', slug: 'cuero' },
        { id: 8, name: 'Patrones', slug: 'patrones' },
      ]);
    }
    const variations = url.pathname.match(/^\/wp-json\/wc\/v3\/products\/(\d+)\/variations$/);
    if (variations) {
      const productId = Number(variations[1]);
      const ids = (WOO_PRODUCTS.find((p) => p.id === productId)?.variations) || [];
      return json(res, 200, ids.map((id) => WOO_VARIATIONS[id]).filter(Boolean));
    }
    if (url.pathname === '/wp-json/wc/v3/products') {
      return json(res, 200, WOO_PRODUCTS);
    }
    return json(res, 404, { error: 'not found' });
  });
}

/* -------------------------------------------------------------------- Wix */

const WIX_PRODUCTS = [
  {
    id: 'wix-1',
    name: 'Kit de costura',
    slug: 'kit-de-costura',
    description: 'Kit para empezar a coser',
    status: 'ACTIVE',
    price: 45,
    stock: 12,
    trackInventory: true,
    sku: 'KIT-01',
    productType: 'Kits',
    collections: ['col-1'],
    tags: ['costura'],
    mediaItems: [{ image: { url: 'https://wix.example.com/kit.jpg', altText: 'Kit' } }],
  },
];

async function wixServer() {
  return fakeServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (!(req.headers.authorization || '').startsWith('Bearer ')) {
      return json(res, 401, { error: 'no token' });
    }
    if (url.pathname.endsWith('/collections')) {
      return json(res, 200, { collections: [{ id: 'col-1', name: 'Kits' }] });
    }
    if (url.pathname.endsWith('/products/variants')) {
      return json(res, 200, {
        variants: [{ id: 'v1', name: 'Azul', price: 45, sku: 'KIT-01-AZ', inventory: 7 }],
      });
    }
    if (url.pathname.endsWith('/products')) {
      return json(res, 200, { products: WIX_PRODUCTS });
    }
    return json(res, 404, { error: 'not found' });
  });
}

/* ---------------------------------------------------------------- Shopify */

async function shopifyServer() {
  return fakeServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.headers['x-shopify-access-token'] !== 'shpat_test') {
        return json(res, 401, { errors: [{ message: 'Invalid API key or access token' }] });
      }
      const payload = JSON.parse(body || '{}');
      if (payload.query && payload.query.includes('shop {')) {
        return json(res, 200, {
          data: { shop: { name: 'Tienda Shopify', myshopifyDomain: 'tienda.myshopify.com', currencyCode: 'EUR' } },
        });
      }
      const after = payload.variables?.after || null;
      if (!after) {
        return json(res, 200, {
          data: {
            products: {
              pageInfo: { hasNextPage: true, endCursor: 'cursor-2' },
              nodes: [
                {
                  id: 'gid://shopify/Product/9001',
                  title: 'Bolso de piel',
                  handle: 'bolso-de-piel',
                  descriptionHtml: '<p>Hecho a mano.</p>',
                  vendor: 'Cuero Vivo',
                  productType: 'Bolsos',
                  status: 'ACTIVE',
                  tags: ['piel'],
                  options: [{ name: 'Color', values: ['Marrón'] }],
                  images: { nodes: [{ url: 'https://shop.example.com/bolso.jpg', altText: 'Bolso' }] },
                  variants: {
                    nodes: [
                      {
                        id: 'gid://shopify/ProductVariant/9101',
                        title: 'Marrón',
                        price: '189.00',
                        compareAtPrice: null,
                        sku: 'BOL-MAR',
                        barcode: '',
                        taxable: true,
                        inventoryQuantity: 6,
                        selectedOptions: [{ name: 'Color', value: 'Marrón' }],
                        inventoryItem: { id: 'gid://shopify/InventoryItem/9201', tracked: true },
                      },
                    ],
                  },
                  collections: { nodes: [{ id: 'gid://shopify/Collection/1', title: 'Bolsos' }] },
                },
              ],
            },
          },
        });
      }
      return json(res, 200, {
        data: {
          products: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: 'gid://shopify/Product/9002',
                title: 'Cinturón de piel',
                handle: 'cinturon-de-piel',
                descriptionHtml: '<p>Acabado curtido.</p>',
                vendor: 'Cuero Vivo',
                productType: 'Bolsos',
                status: 'ACTIVE',
                tags: [],
                options: [{ name: 'Title', values: ['Default Title'] }],
                images: { nodes: [] },
                variants: {
                  nodes: [
                    {
                      id: 'gid://shopify/ProductVariant/9102',
                      title: 'Default Title',
                      price: '59.00',
                      compareAtPrice: null,
                      sku: 'CIN-01',
                      barcode: '',
                      taxable: true,
                      inventoryQuantity: 22,
                      selectedOptions: [{ name: 'Title', value: 'Default Title' }],
                      inventoryItem: { id: 'gid://shopify/InventoryItem/9202', tracked: true },
                    },
                  ],
                },
                collections: { nodes: [] },
              },
            ],
          },
        },
      });
    });
  });
}

/* ------------------------------------------------------------------ tests */

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'import-test-'));
  const store = new ShopStore(join(dir, 'shop.json'));
  const backend = new MockBackend(store);
  return { dir, store, backend, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('the WooCommerce importer reads products, variations and categories', async (t) => {
  const server = await wooServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const connection = { url: server.url, key: 'ck_test', secret: 'cs_test' };

  const check = await woocommerceImporter.testConnection(connection);
  assert.equal(check.ok, true);
  assert.match(check.message, /Connected/);

  const { products } = await woocommerceImporter.fetchCatalogue(connection);
  assert.equal(products.length, 2);

  const cuero = products.find((p) => p.title === 'Cuero para bolso');
  assert.equal(cuero.sourceId, 'woo_501');
  assert.equal(cuero.variants.length, 2);
  assert.equal(cuero.variants[0].price, '24.00');
  assert.equal(cuero.variants[0].inventoryQuantity, 25);
  assert.deepEqual(cuero.variants[0].optionValues, [{ name: 'Color', value: 'Natural' }]);
  assert.equal(cuero.images.length, 2);
  assert.deepEqual(cuero.categories.map((c) => c.name), ['Cuero']);

  const patron = products.find((p) => p.title === 'Patrón de bolso de mano');
  assert.equal(patron.variants.length, 1);
  assert.equal(patron.variants[0].price, '9.50');
});

test('the WooCommerce import lands in the shop catalogue', async (t) => {
  const server = await wooServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const report = await h.backend.importCatalogue({
    source: 'woocommerce',
    connection: { url: server.url, key: 'ck_test', secret: 'cs_test' },
  });
  assert.equal(report.imported, 2);
  assert.equal(report.updated, 0);
  assert.equal(report.problems.length, 0);

  const { products } = await h.backend.searchProducts({ limit: 100 });
  const imported = products.filter((p) => p.id.startsWith('imp_'));
  assert.equal(imported.length, 2);
  assert.ok(imported.every((p) => p.variants.length > 0));

  // importing again updates, it does not duplicate
  const again = await h.backend.importCatalogue({
    source: 'woocommerce',
    connection: { url: server.url, key: 'ck_test', secret: 'cs_test' },
  });
  assert.equal(again.imported, 0);
  assert.equal(again.updated, 2);
  const after = await h.backend.searchProducts({ limit: 100 });
  assert.equal(after.products.filter((p) => p.id.startsWith('imp_')).length, 2);
});

test('a wrong WooCommerce password is reported clearly', async (t) => {
  const server = await wooServer();
  t.after(() => server.close());
  await assert.rejects(
    () => woocommerceImporter.testConnection({ url: server.url, key: 'nope', secret: 'nope' }),
    /refused the credentials/,
  );
});

test('the Wix importer reads products, variants and collections', async (t) => {
  const server = await wixServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const connection = { siteId: 'site-1', token: 'tok', baseUrl: `${server.url}/stores/v1` };

  const check = await wixImporter.testConnection(connection);
  assert.equal(check.ok, true);

  const { products } = await wixImporter.fetchCatalogue(connection);
  assert.equal(products.length, 1);
  const kit = products[0];
  assert.equal(kit.sourceId, 'wix_wix-1');
  assert.equal(kit.variants.length, 1);
  assert.equal(kit.variants[0].price, '45');
  assert.equal(kit.variants[0].inventoryQuantity, 7);
  assert.equal(kit.images.length, 1);
  assert.deepEqual(kit.categories.map((c) => c.name), ['Kits']);
});

test('the Wix import lands in the shop catalogue', async (t) => {
  const server = await wixServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const report = await h.backend.importCatalogue({
    source: 'wix',
    connection: { siteId: 'site-1', token: 'tok', baseUrl: `${server.url}/stores/v1` },
  });
  assert.equal(report.imported, 1);

  const { products } = await h.backend.searchProducts({ limit: 100 });
  const kit = products.find((p) => p.title === 'Kit de costura');
  assert.ok(kit, 'the imported product is in the catalogue');
  assert.equal(kit.variants[0].price, '45');
});

test('the Shopify importer paginates and reads the catalogue', async (t) => {
  const server = await shopifyServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const connection = { domain: 'tienda.myshopify.com', token: 'shpat_test', baseUrl: `${server.url}/graphql.json` };

  const check = await shopifyImporter.testConnection(connection);
  assert.equal(check.ok, true);
  assert.equal(check.details.shop, 'Tienda Shopify');

  const { products } = await shopifyImporter.fetchCatalogue(connection);
  assert.equal(products.length, 2, 'it follows the cursor to the second page');
  const bolso = products.find((p) => p.title === 'Bolso de piel');
  assert.equal(bolso.sourceId, 'gid://shopify/Product/9001');
  assert.equal(bolso.variants[0].price, '189.00');
  assert.equal(bolso.variants[0].inventoryQuantity, 6);
  assert.equal(bolso.images.length, 1);
  assert.deepEqual(bolso.categories.map((c) => c.name), ['Bolsos']);
});

test('the Shopify import lands in the shop catalogue', async (t) => {
  const server = await shopifyServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const report = await h.backend.importCatalogue({
    source: 'shopify',
    connection: { domain: 'tienda.myshopify.com', token: 'shpat_test', baseUrl: `${server.url}/graphql.json` },
  });
  assert.equal(report.imported, 2);

  const { products } = await h.backend.searchProducts({ limit: 100 });
  const bolso = products.find((p) => p.title === 'Bolso de piel');
  assert.ok(bolso);
  assert.equal(bolso.variants[0].sku, 'BOL-MAR');
});

test('a wrong Shopify token is reported clearly', async (t) => {
  const server = await shopifyServer();
  t.after(() => server.close());
  await assert.rejects(
    () => shopifyImporter.testConnection({ domain: 'x.myshopify.com', token: 'wrong', baseUrl: `${server.url}/graphql.json` }),
    /refused the token/,
  );
});

test('a dry run imports nothing', async (t) => {
  const server = await wooServer();
  const h = harness();
  t.after(async () => { await server.close(); h.cleanup(); });

  const report = await h.backend.importCatalogue({
    source: 'woocommerce',
    connection: { url: server.url, key: 'ck_test', secret: 'cs_test' },
    dryRun: true,
  });
  assert.equal(report.dryRun, true);
  assert.equal(report.imported, 2);
  const { products } = await h.backend.searchProducts({ limit: 100 });
  assert.equal(products.filter((p) => p.id.startsWith('imp_')).length, 0);
});

test('an unknown source is refused', async () => {
  await assert.rejects(() => runImport({ source: 'prestashop' }), /Unknown import source/);
});
