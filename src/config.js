/**
 * Configuration.
 *
 * Reads plain environment variables and, if present, a `.env` file next to
 * the project root. Real environment variables always win over the file.
 */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Latest stable Admin API version at the time of writing. */
export const DEFAULT_API_VERSION = '2026-10';

/**
 * Parse a minimal `.env` file. Supports `KEY=value`, `export KEY=value`,
 * `#` comments and single/double quoted values.
 * @param {string} contents
 * @returns {Record<string,string>}
 */
export function parseDotEnv(contents) {
  const out = {};
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const withoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eq = withoutExport.indexOf('=');
    if (eq === -1) continue;
    const key = withoutExport.slice(0, eq).trim();
    let value = withoutExport.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function readDotEnv(path) {
  try {
    return parseDotEnv(readFileSync(path, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * @param {Record<string,string>} [env]
 * @returns {object} resolved configuration
 */
export function loadConfig(env = process.env) {
  const fileEnv = readDotEnv(join(ROOT, '.env'));
  const get = (key) => {
    const fromProcess = env[key];
    if (fromProcess !== undefined && fromProcess !== '') return fromProcess;
    const fromFile = fileEnv[key];
    if (fromFile !== undefined && fromFile !== '') return fromFile;
    return undefined;
  };

  const domain = (get('SHOPIFY_STORE_DOMAIN') || get('MYSHOPIFY_DOMAIN') || '').trim();
  const accessToken = (get('SHOPIFY_ACCESS_TOKEN') || '').trim();
  const clientId = (get('SHOPIFY_CLIENT_ID') || '').trim();
  const clientSecret = (get('SHOPIFY_CLIENT_SECRET') || '').trim();

  const hasStaticToken = Boolean(accessToken);
  const hasClientCredentials = Boolean(clientId && clientSecret);
  const credentialsPresent = hasStaticToken || hasClientCredentials;

  const requestedMode = (get('SHOPIFY_MODE') || 'auto').trim().toLowerCase();
  const mode = resolveMode(requestedMode, credentialsPresent);

  const port = Number(get('PORT') || 8788);
  const host = (get('HOST') || '127.0.0.1').trim();

  return {
    mode,
    requestedMode,
    domain,
    accessToken,
    clientId,
    clientSecret,
    authMode: hasStaticToken ? 'static_token' : hasClientCredentials ? 'client_credentials' : 'none',
    apiVersion: (get('SHOPIFY_API_VERSION') || DEFAULT_API_VERSION).trim(),
    port: Number.isFinite(port) ? port : 8788,
    host,
    apiKey: (get('AGENT_API_KEY') || '').trim(),
    requireAuth: (get('SHOPIFY_REQUIRE_AUTH') || '').toLowerCase() === 'true',
  };
}

function resolveMode(requested, credentialsPresent) {
  if (requested === 'mock' || requested === 'shopify') return requested;
  return credentialsPresent ? 'shopify' : 'mock';
}

/**
 * Validate the configuration and explain what is missing.
 * @param {object} config
 * @returns {string[]} list of problems (empty when usable)
 */
export function configProblems(config) {
  const problems = [];
  if (config.mode === 'shopify') {
    if (!config.domain) problems.push('SHOPIFY_STORE_DOMAIN is required in shopify mode.');
    if (config.authMode === 'none') {
      problems.push(
        'No credentials: set SHOPIFY_ACCESS_TOKEN, or SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET.',
      );
    }
  }
  if (config.requireAuth && config.mode === 'mock') {
    problems.push('SHOPIFY_REQUIRE_AUTH=true but no store credentials are configured.');
  }
  return problems;
}
