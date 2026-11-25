import test from 'node:test';
import assert from 'node:assert/strict';
import { createRegistry } from '../src/tools/index.js';
import { MockBackend } from '../src/backends/mock.js';

function harness() {
  const registry = createRegistry();
  const backend = new MockBackend();
  const ctx = { registry, backend };
  const call = (name, args = {}) => registry.invoke(name, args, ctx);
  return { registry, backend, call };
}

test('the catalogue exposes the expected tools', () => {
  const { registry } = harness();
  const names = registry.list().map((t) => t.name);
  assert.equal(names.length, 29);
  for (const expected of [
    'store_info',
    'list_locations',
    'search_products',
    'get_product',
    'create_product',
    'update_product',
    'delete_product',
    'manage_variants',
    'manage_options',
    'update_inventory',
    'create_order',
    'search_orders',
    'get_order',
    'update_order',
    'fulfill_order',
    'search_customers',
    'get_customer',
    'update_customer',
  ]) {
    assert.ok(names.includes(expected), `missing tool ${expected}`);
  }
});

test('every tool has a description, an object schema and no extra properties', () => {
  const { registry } = harness();
  for (const tool of registry.list()) {
    assert.ok(tool.description.length > 30, `${tool.name} needs a real description`);
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} must reject unknown keys`);
  }
});

test('store_info reports the mock backend', async () => {
  const { call } = harness();
  const info = await call('store_info');
  assert.equal(info.mode, 'mock');
  assert.equal(info.live, false);
  assert.ok(info.productCount > 0);
});

test('search_products filters by text and status', async () => {
  const { call } = harness();
  const all = await call('search_products', { limit: 100 });
  assert.ok(all.products.length >= 10);

  const sweaters = await call('search_products', { query: 'sweater' });
  assert.equal(sweaters.products.length, 1);
  assert.equal(sweaters.products[0].title, 'Aurora Merino Sweater');

  const drafts = await call('search_products', { status: 'DRAFT' });
  assert.equal(drafts.products.length, 1);
  assert.equal(drafts.products[0].status, 'DRAFT');
});

test('search_products paginates with a cursor', async () => {
  const { call } = harness();
  const first = await call('search_products', { limit: 12 });
  assert.equal(first.products.length, 12);
  assert.equal(first.pageInfo.hasNextPage, true);
  assert.ok(first.pageInfo.endCursor);

  const second = await call('search_products', { limit: 12, cursor: first.pageInfo.endCursor });
  assert.equal(second.products.length, 1);
  assert.equal(second.pageInfo.hasNextPage, false);
});

test('get_product accepts a gid or a bare numeric id', async () => {
  const { call } = harness();
  const byGid = await call('get_product', { productId: 'gid://shopify/Product/1001' });
  const byNumber = await call('get_product', { productId: '1001' });
  assert.equal(byGid.product.id, byNumber.product.id);
  assert.equal(byGid.product.variants.length, 3);
});

test('get_product rejects an unknown product', async () => {
  const { call } = harness();
  await assert.rejects(() => call('get_product', { productId: '9999' }), /No product with id/);
});

test('create_product then update_product', async () => {
  const { call } = harness();
  const created = await call('create_product', {
    title: 'Test Lamp',
    vendor: 'Lumen',
    productOptions: [{ name: 'Colour', values: [{ name: 'Black' }, { name: 'White' }] }],
  });
  assert.equal(created.product.title, 'Test Lamp');
  assert.equal(created.product.status, 'DRAFT');
  assert.equal(created.product.variants.length, 2);

  const updated = await call('update_product', {
    id: created.product.id,
    status: 'ACTIVE',
    tags: ['lamp'],
  });
  assert.equal(updated.product.status, 'ACTIVE');
  assert.deepEqual(updated.product.tags, ['lamp']);
});

test('delete_product demands confirmation', async () => {
  const { call } = harness();
  await assert.rejects(
    () => call('delete_product', { id: 'gid://shopify/Product/1002', confirm: false }),
    /requires confirm: true/,
  );
  const result = await call('delete_product', { id: 'gid://shopify/Product/1002', confirm: true });
  assert.equal(result.deletedProductId, 'gid://shopify/Product/1002');
  await assert.rejects(() => call('get_product', { productId: '1002' }), /No product/);
});

test('manage_variants updates a price and a sku', async () => {
  const { call } = harness();
  const result = await call('manage_variants', {
    productId: 'gid://shopify/Product/1002',
    action: 'update',
    variants: [{ id: 'gid://shopify/ProductVariant/2004', price: '29.00', sku: 'CER-02' }],
  });
  const variant = result.product.variants[0];
  assert.equal(variant.price, '29.00');
  assert.equal(variant.sku, 'CER-02');
});

test('update_inventory sets an absolute quantity and rejects a negative stock', async () => {
  const { call } = harness();
  const locations = await call('list_locations', {});
  const locationId = locations.locations[0].id;

  const set = await call('update_inventory', {
    variantId: 'gid://shopify/ProductVariant/2001',
    locationId,
    quantity: 5,
  });
  assert.equal(set.changes[0].quantityBefore, 12);
  assert.equal(set.changes[0].quantityAfterChange, 5);

  const relative = await call('update_inventory', {
    variantId: 'gid://shopify/ProductVariant/2001',
    locationId,
    delta: -2,
  });
  assert.equal(relative.changes[0].quantityAfterChange, 3);

  await assert.rejects(
    () => call('update_inventory', { variantId: 'gid://shopify/ProductVariant/2001', locationId, quantity: -1 }),
    /would go negative/,
  );
});

test('update_inventory requires exactly one of quantity or delta', async () => {
  const { call } = harness();
  await assert.rejects(
    () => call('update_inventory', { variantId: 'x', locationId: 'y' }),
    /quantity.*delta|delta.*quantity/,
  );
});

test('create_order places a real order with totals and line items', async () => {
  const { call } = harness();
  const order = await call('create_order', {
    lineItems: [
      { variantId: 'gid://shopify/ProductVariant/2004', quantity: 2 },
      { variantId: 'gid://shopify/ProductVariant/2001', quantity: 1 },
    ],
    customer: { email: 'comprador@example.com', firstName: 'Ana', lastName: 'Solo' },
    shippingAddress: { address1: 'Calle Mayor 12', city: 'Valencia', country: 'Spain', zip: '46001' },
  });
  assert.ok(order.order.id);
  assert.equal(order.order.customer.email, 'comprador@example.com');
  assert.equal(order.order.lineItems.length, 2);
  assert.equal(order.order.lineItems[0].quantity, 2);
  assert.ok(Number(order.order.totalPrice.amount) > 0);

  const found = await call('search_orders', { query: 'comprador@example.com' });
  assert.equal(found.orders.length, 1);
});

test('create_order needs at least one line item', async () => {
  const { call } = harness();
  await assert.rejects(() => call('create_order', { lineItems: [] }), /must contain at least 1 items/);
});

test('the catalogue has enough products for a shop front', async () => {
  const { call } = harness();
  const { products } = await call('search_products', { limit: 100 });
  assert.ok(products.length >= 10, `only ${products.length} products`);
  const categories = new Set(products.map((p) => p.productType));
  assert.ok(categories.size >= 4, `only ${categories.size} categories`);
});

test('search_orders filters by status and by customer email', async () => {
  const { call } = harness();
  const all = await call('search_orders', { limit: 50 });
  assert.equal(all.orders.length, 3);

  const open = await call('search_orders', { status: 'open', limit: 50 });
  assert.equal(open.orders.length, 1);
  assert.equal(open.orders[0].name, '#1001');

  const byEmail = await call('search_orders', { query: 'marta.rivas@example.com', limit: 50 });
  assert.equal(byEmail.orders.length, 2);
});

test('update_order changes tags and note', async () => {
  const { call } = harness();
  const result = await call('update_order', {
    id: 'gid://shopify/Order/7001',
    tags: ['vip', 'gift'],
    note: 'Leave at the door',
  });
  assert.deepEqual(result.order.tags, ['vip', 'gift']);
  assert.equal(result.order.note, 'Leave at the door');
});

test('fulfill_order ships the requested line item and refuses to ship twice', async () => {
  const { call } = harness();
  const order = await call('get_order', { orderId: 'gid://shopify/Order/7001' });
  const lineItemId = order.order.lineItems[0].id;

  const fulfilled = await call('fulfill_order', {
    orderId: 'gid://shopify/Order/7001',
    lineItems: [{ lineItemId, quantity: 1 }],
    trackingInfo: { company: 'SEUR', number: 'TRACK123' },
  });
  assert.equal(fulfilled.fulfillment.status, 'SUCCESS');
  assert.equal(fulfilled.fulfillment.lineItems[0].quantity, 1);

  await assert.rejects(
    () => call('fulfill_order', { orderId: 'gid://shopify/Order/7001' }),
    /Nothing left to fulfill/,
  );
});

test('search_customers finds by email and by tag', async () => {
  const { call } = harness();
  const byEmail = await call('search_customers', { query: 'lucia.ferrer@example.com' });
  assert.equal(byEmail.customers.length, 1);
  assert.equal(byEmail.customers[0].firstName, 'Lucia');

  const byTag = await call('search_customers', { query: 'wholesale' });
  assert.equal(byTag.customers.length, 1);
});

test('update_customer changes the phone and the tags', async () => {
  const { call } = harness();
  const result = await call('update_customer', {
    id: 'gid://shopify/Customer/6003',
    phone: '+34 600 111 222',
    tags: ['wholesale', 'eu'],
  });
  assert.equal(result.customer.phone, '+34 600 111 222');
  assert.deepEqual(result.customer.tags, ['wholesale', 'eu']);
});

test('unknown tools fail with a helpful message', async () => {
  const { call } = harness();
  await assert.rejects(() => call('does_not_exist', {}), /Unknown tool: does_not_exist/);
});

test('invalid arguments are rejected before the backend is touched', async () => {
  const { call } = harness();
  await assert.rejects(() => call('search_products', { limit: 5000 }), /must be <= 100/);
  await assert.rejects(() => call('search_products', { unknown: 1 }), /unknown property/);
});
