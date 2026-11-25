/**
 * Test helpers: boot the real server on an ephemeral port against the mock
 * backend, and talk to it over HTTP.
 */

import { buildApp } from '../src/index.js';
import { createServer } from '../src/server.js';

export const TEST_CONFIG = {
  mode: 'mock',
  requestedMode: 'mock',
  domain: '',
  accessToken: '',
  clientId: '',
  clientSecret: '',
  authMode: 'none',
  apiVersion: 'mock',
  port: 0,
  host: '127.0.0.1',
  apiKey: '',
  requireAuth: false,
};

/**
 * @param {object} [overrides]
 * @returns {Promise<{base: string, app: object, close: () => Promise<void>}>}
 */
export async function startTestServer(overrides = {}) {
  const config = { ...TEST_CONFIG, ...overrides };
  const app = buildApp(config);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;
  return {
    base,
    app,
    server,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(resolve);
      }),
  };
}

/**
 * @param {string} url
 * @param {RequestInit} [options]
 */
export async function call(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

/**
 * POST a JSON-RPC message to the MCP endpoint.
 * @param {string} base
 * @param {object} message
 */
export async function mcp(base, message, headers = {}) {
  return call(`${base}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(message),
  });
}
