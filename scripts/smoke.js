#!/usr/bin/env node
/**
 * Smoke test: boot the server, exercise it over every transport, print what
 * came back. Useful as a first check after cloning, and as a demo.
 *
 *   npm run smoke
 */

import { start } from '../src/index.js';

const PORT = Number(process.env.SMOKE_PORT || 8791);

async function main() {
  const app = start({
    mode: 'mock',
    requestedMode: 'mock',
    domain: '',
    accessToken: '',
    clientId: '',
    clientSecret: '',
    authMode: 'none',
    apiVersion: 'mock',
    port: PORT,
    host: '127.0.0.1',
    apiKey: '',
    requireAuth: false,
  });

  await new Promise((resolve) => setTimeout(resolve, 250));
  const base = `http://127.0.0.1:${PORT}`;

  const health = await (await fetch(`${base}/health`)).json();
  console.log('\nhealth          ', JSON.stringify(health));

  const tools = await (await fetch(`${base}/tools`)).json();
  console.log(`tools           ${tools.data.length} available`);
  console.log(`                ${tools.data.map((t) => t.name).join(', ')}`);

  const openai = await (await fetch(`${base}/tools/openai`)).json();
  console.log(`openai defs     ${openai.data.length} function definitions\n`);

  const list = await (
    await fetch(`${base}/tools/search_products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 3 }),
    })
  ).json();
  console.log('search_products ', list.data.products.map((p) => `${p.title} (${p.status})`).join(' | '));

  const batch = await (
    await fetch(`${base}/commands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { tool: 'list_locations', arguments: {} },
          { tool: 'store_info', arguments: {} },
        ],
      }),
    })
  ).json();
  console.log('commands        ', `${batch.data.succeeded} ok, ${batch.data.failed} failed`);

  const mcpInit = await (
    await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'smoke', version: '1' } },
      }),
    })
  ).json();
  console.log('mcp initialize  ', JSON.stringify(mcpInit.result.serverInfo));

  const mcpList = await (
    await fetch(`${base}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
    })
  ).json();
  console.log('mcp tools/list  ', `${mcpList.result.tools.length} tools\n`);

  app.backend.destroy?.();
  app.server.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
