#!/usr/bin/env node
/**
 * Entry point.
 *
 * Reads the configuration, picks a backend, starts the HTTP server and prints
 * the exact lines you need to plug the server into an AI tool.
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { loadConfig, configProblems } from './config.js';
import { createRegistry } from './tools/index.js';
import { MockBackend } from './backends/mock.js';
import { ShopifyBackend } from './backends/shopify.js';
import { createServer } from './server.js';
import { ShopStore } from './store.js';
import { StripeClient } from './stripe.js';
import { uploadImage } from './uploads.js';

export function buildApp(config = loadConfig()) {
  const problems = configProblems(config);
  if (problems.length) {
    const error = new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    error.problems = problems;
    throw error;
  }

  const registry = createRegistry();
  const store = new ShopStore(config.dataFile);
  const stripe = new StripeClient({
    secretKey: config.stripeSecretKey,
    webhookSecret: config.stripeWebhookSecret,
  });

  const backend =
    config.mode === 'shopify'
      ? new ShopifyBackend({
          domain: config.domain,
          apiVersion: config.apiVersion,
          accessToken: config.accessToken,
          clientId: config.clientId,
          clientSecret: config.clientSecret,
          store,
          filesDir: config.filesDir,
        })
      : new MockBackend(store, config.filesDir);

  return {
    config,
    registry,
    backend,
    store,
    stripe,
    uploadImage: (args) => uploadImage(args, config),
  };
}

export function start(config = loadConfig()) {
  const app = buildApp(config);
  const server = createServer(app);
  server.listen(config.port, config.host, () => {
    const base = `http://${config.host}:${config.port}`;
    const lines = [
      '',
      `  shopify-agent ${config.mode === 'mock' ? '(offline mock store)' : `(live: ${config.domain})`}`,
      '',
      `  Tools      ${base}/tools`,
      `  OpenAI     ${base}/tools/openai`,
      `  MCP        ${base}/mcp`,
      `  Health     ${base}/health`,
      '',
    ];
    if (config.mode === 'mock') {
      lines.push('  No store credentials found, so the server is running against the built in mock.');
      lines.push('  Set SHOPIFY_STORE_DOMAIN plus a token to talk to a real store.');
      lines.push('');
    }
    if (config.apiKey) {
      lines.push(`  API key required on every call (Authorization: Bearer ...).`);
      lines.push('');
    }
    process.stdout.write(`${lines.join('\n')}\n`);
  });

  const shutdown = () => {
    if (app.backend.destroy) app.backend.destroy();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return { ...app, server };
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  try {
    start();
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
