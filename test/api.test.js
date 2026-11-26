import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, call } from './helpers.js';

test('HTTP surface', async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  await t.test('GET /health is open and reports readiness', async () => {
    const res = await call(`${base}/health`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.mode, 'mock');
    assert.equal(res.body.tools, 35);
  });

  await t.test('GET / serves the shop', async () => {
    const res = await call(`${base}/`);
    assert.equal(res.status, 200);
    assert.match(String(res.body), /AUR/i);
    assert.match(String(res.body), /<html/i);
  });

  await t.test('GET /tools.html serves the tool catalogue page', async () => {
    const res = await call(`${base}/tools.html`);
    assert.equal(res.status, 200);
    assert.match(String(res.body), /shopify-agent/);
  });

  await t.test('GET /assets serves the static assets', async () => {
    const css = await call(`${base}/assets/styles.css`);
    assert.equal(css.status, 200);
    const js = await call(`${base}/assets/app.js`);
    assert.equal(js.status, 200);
    const cat = await call(`${base}/assets/catalog.json`);
    assert.equal(cat.status, 200);
    assert.ok(cat.body.products.length > 0);
  });

  await t.test('static paths cannot escape the public folder', async () => {
    const res = await call(`${base}/assets/../../package.json`);
    assert.notEqual(res.status, 200);
  });

  await t.test('GET /info describes the service and points at the endpoints', async () => {
    const res = await call(`${base}/info`);
    assert.equal(res.status, 200);
    assert.ok(res.body.endpoints.mcp);
    assert.ok(res.body.endpoints.commands);
    assert.ok(res.body.endpoints.shop);
    assert.ok(res.body.endpoints.toolCatalogue);
  });

  await t.test('GET /tools lists the catalogue with JSON Schemas', async () => {
    const res = await call(`${base}/tools`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 35);
    const tool = res.body.data.find((t2) => t2.name === 'search_products');
    assert.equal(tool.inputSchema.type, 'object');
    assert.equal(tool.readOnly, true);
  });

  await t.test('GET /tools/openai returns function definitions', async () => {
    const res = await call(`${base}/tools/openai`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data[0].type, 'function');
    assert.ok(res.body.data[0].function.parameters);
    assert.ok(res.body.data[0].function.name);
  });

  await t.test('GET /tools/:name describes a single tool', async () => {
    const res = await call(`${base}/tools/update_inventory`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.name, 'update_inventory');
  });

  await t.test('GET /tools/:name returns 404 for an unknown tool', async () => {
    const res = await call(`${base}/tools/nope`);
    assert.equal(res.status, 404);
    assert.equal(res.body.ok, false);
    assert.equal(res.body.error.code, 'invalid_input');
  });

  await t.test('POST /tools/:name runs the tool', async () => {
    const res = await call(`${base}/tools/search_products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'sweater' }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.data.products.length, 1);
  });

  await t.test('POST /tools/:name returns 400 on a bad argument', async () => {
    const res = await call(`${base}/tools/search_products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 9999 }),
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_input');
  });

  await t.test('POST /tools with a name in the body works too', async () => {
    const res = await call(`${base}/tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool: 'list_locations', arguments: {} }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.locations.length, 1);
  });

  await t.test('POST /commands runs a batch and keeps going after a failure', async () => {
    const res = await call(`${base}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { tool: 'list_locations', arguments: {} },
          { tool: 'search_products', arguments: { limit: 500 } },
          { tool: 'get_product', arguments: { productId: '999999' } },
        ],
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.succeeded, 1);
    assert.equal(res.body.data.failed, 2);
    assert.equal(res.body.data.results[2].ok, false);
  });

  await t.test('a malformed body is a 400, not a crash', async () => {
    const res = await call(`${base}/tools/list_locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ not json',
    });
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'invalid_input');
  });

  await t.test('unknown routes are 404', async () => {
    const res = await call(`${base}/nope`);
    assert.equal(res.status, 404);
  });
});

test('the API key protects the tool endpoints', async (t) => {
  const { base, close } = await startTestServer({ apiKey: 's3cret' });
  t.after(close);

  await t.test('health stays open', async () => {
    const res = await call(`${base}/health`);
    assert.equal(res.status, 200);
  });

  await t.test('a call without the key is refused', async () => {
    const res = await call(`${base}/tools/list_locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'unauthorized');
  });

  await t.test('a call with the wrong key is refused', async () => {
    const res = await call(`${base}/tools/list_locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer nope' },
      body: '{}',
    });
    assert.equal(res.status, 401);
  });

  await t.test('a call with the right key goes through', async () => {
    const res = await call(`${base}/tools/list_locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer s3cret' },
      body: '{}',
    });
    assert.equal(res.status, 200);
  });

  await t.test('x-api-key also works', async () => {
    const res = await call(`${base}/tools/list_locations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 's3cret' },
      body: '{}',
    });
    assert.equal(res.status, 200);
  });
});
