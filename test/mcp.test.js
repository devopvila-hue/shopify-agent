import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, mcp } from './helpers.js';

test('MCP over Streamable HTTP', async (t) => {
  const { base, close } = await startTestServer();
  t.after(close);

  await t.test('initialize returns the protocol version and the server info', async () => {
    const res = await mcp(base, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.jsonrpc, '2.0');
    assert.equal(res.body.id, 1);
    assert.equal(res.body.result.protocolVersion, '2025-06-18');
    assert.equal(res.body.result.serverInfo.name, 'shopify-agent');
    assert.ok(res.body.result.capabilities.tools);
  });

  await t.test('initialize echoes a client protocol version it does not know', async () => {
    const res = await mcp(base, {
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: '2099-01-01' },
    });
    assert.equal(res.body.result.protocolVersion, '2099-01-01');
  });

  await t.test('notifications get no response', async () => {
    const res = await mcp(base, { jsonrpc: '2.0', method: 'notifications/initialized' });
    assert.equal(res.status, 202);
  });

  await t.test('ping works', async () => {
    const res = await mcp(base, { jsonrpc: '2.0', id: 3, method: 'ping' });
    assert.equal(res.body.result !== undefined, true);
  });

  await t.test('tools/list returns every tool with a JSON Schema', async () => {
    const res = await mcp(base, { jsonrpc: '2.0', id: 4, method: 'tools/list' });
    const tools = res.body.result.tools;
    assert.equal(tools.length, 35);
    const product = tools.find((t2) => t2.name === 'search_products');
    assert.equal(product.inputSchema.type, 'object');
    assert.equal(product.annotations.readOnlyHint, true);
    const remove = tools.find((t2) => t2.name === 'delete_product');
    assert.equal(remove.annotations.destructiveHint, true);
  });

  await t.test('tools/call runs the tool and returns the data', async () => {
    const res = await mcp(base, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'search_products', arguments: { query: 'sweater' } },
    });
    const result = res.body.result;
    assert.equal(result.isError, false);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.products.length, 1);
    assert.deepEqual(result.structuredContent, payload);
  });

  await t.test('tools/call reports a failure inside the result, not as a protocol error', async () => {
    const res = await mcp(base, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'get_product', arguments: { productId: '999999' } },
    });
    const result = res.body.result;
    assert.equal(result.isError, true);
    const payload = JSON.parse(result.content[0].text);
    assert.equal(payload.error.code, 'invalid_input');
  });

  await t.test('tools/call on an unknown tool is an error result', async () => {
    const res = await mcp(base, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'nope' },
    });
    assert.equal(res.body.result.isError, true);
  });

  await t.test('an unknown method returns a JSON-RPC error', async () => {
    const res = await mcp(base, { jsonrpc: '2.0', id: 8, method: 'tools/nope' });
    assert.equal(res.body.error.code, -32601);
  });

  await t.test('a malformed request returns a JSON-RPC error', async () => {
    const res = await mcp(base, { jsonrpc: '2.0', id: 9 });
    assert.equal(res.body.error.code, -32600);
  });

  await t.test('a batch of requests is answered in order', async () => {
    const res = await mcp(base, [
      { jsonrpc: '2.0', id: 10, method: 'ping' },
      { jsonrpc: '2.0', id: 11, method: 'tools/list' },
    ]);
    assert.equal(res.status, 200);
    assert.equal(res.body.length, 2);
    assert.equal(res.body[0].id, 10);
    assert.equal(res.body[1].id, 11);
  });

  await t.test('an SSE Accept header gets an event stream', async () => {
    const res = await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 12, method: 'ping' }),
    });
    assert.equal(res.headers.get('content-type'), 'text/event-stream');
    const text = await res.text();
    assert.match(text, /^event: message\ndata: /);
  });
});
