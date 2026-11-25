/**
 * The HTTP server.
 *
 * One process, several surfaces:
 *   - the shop            GET /            (public/, in 4 languages)
 *   - the admin panel     GET /admin       (local only, optional password)
 *   - the tool API        POST /tools/...  MCP, REST, batch
 *   - the Stripe webhook  POST /webhooks/stripe
 *
 * There is no chat endpoint and no LLM inside. This server executes orders,
 * it does not talk to the user.
 */

import { createServer as createHttpServer } from 'node:http';
import { URL } from 'node:url';
import { readFileSync } from 'node:fs';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toAppError, ErrorCode, unauthorized, invalidInput, forbidden } from './errors.js';
import { handleMcpMessage, mcpHttpBody, wantsEventStream, MCP_SERVER_INFO } from './mcp.js';
import { negotiateLocale, isLocale, LOCALES, LOCALE_NAMES } from './i18n.js';
import { vatRate } from './tax.js';
import { THEMES, getTheme } from './themes.js';

const MAX_BODY_BYTES = 8 * 1024 * 1024;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = join(ROOT, 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.woff2': 'font/woff2',
};

/**
 * Serve a file from `public/`, refusing anything that escapes it.
 * @param {string} relativePath
 * @param {import('node:http').ServerResponse} res
 * @param {string} [transform] optional html transform
 */
function serveStatic(relativePath, res, transform) {
  const target = resolve(PUBLIC_DIR, `.${relativePath}`);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) return false;
  let body;
  try {
    body = readFileSync(target);
  } catch {
    return false;
  }
  if (transform) body = Buffer.from(transform(body.toString('utf8')));
  const type = MIME[extname(target).toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': body.length,
    'Cache-Control': 'no-cache',
  });
  res.end(body);
  return true;
}

/**
 * @param {object} options
 * @param {import('./registry.js').Registry} options.registry
 * @param {object} options.backend
 * @param {object} options.config
 * @param {object} [options.store]
 * @param {object} [options.stripe]
 * @param {(args: object) => Promise<object>} [options.uploadImage]
 */
export function createServer({ registry, backend, config, store, stripe, uploadImage }) {
  const server = createHttpServer((req, res) => {
    handle(req, res, { registry, backend, config, store, stripe, uploadImage }).catch((err) => {
      sendError(res, toAppError(err));
    });
  });
  server.on('clientError', (_err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  return server;
}

async function handle(req, res, ctx) {
  const { registry, backend, config } = ctx;
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = (req.method || 'GET').toUpperCase();

  const locale = detectLocale(req, url);

  // Health check stays open so a supervisor can probe the process.
  if (path === '/health') {
    return sendJson(res, 200, {
      ok: true,
      status: 'ready',
      mode: backend.mode,
      tools: registry.list().length,
      apiVersion: backend.apiVersion,
      locale,
    });
  }

  // ------------------------------------------------------------- the shop

  if (method === 'GET' && path === '/') {
    if (serveStatic('/index.html', res, (html) => injectShopConfig(html, ctx, locale))) {
      return undefined;
    }
  }

  if (method === 'GET' && path === '/admin') {
    if (requireAdmin(req, config)) {
      if (serveStatic('/admin/index.html', res, (html) => injectShopConfig(html, ctx, locale))) {
        return undefined;
      }
    } else {
      return sendError(res, forbidden('The admin panel needs the admin password.'), 403);
    }
  }

  if (
    method === 'GET' &&
    (path === '/tools.html' ||
      path.startsWith('/assets/') ||
      path.startsWith('/uploads/') ||
      path.startsWith('/admin/'))
  ) {
    if (serveStatic(path, res)) return undefined;
    return sendError(res, invalidInput(`Not found: ${path}`), 404);
  }

  if (method === 'GET' && path === '/info') {
    return sendJson(res, 200, {
      ok: true,
      service: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      description:
        'Agentic Shopify server. A shop front plus a tool API. No chat interface, no LLM inside.',
      mode: backend.mode,
      locale,
      locales: LOCALES,
      localeNames: LOCALE_NAMES,
      endpoints: {
        shop: 'GET /',
        admin: 'GET /admin',
        toolCatalogue: 'GET /tools.html',
        tools: 'GET /tools',
        openaiTools: 'GET /tools/openai',
        callTool: 'POST /tools/{tool}',
        commands: 'POST /commands',
        mcp: 'POST /mcp',
        stripeWebhook: 'POST /webhooks/stripe',
        info: 'GET /info',
        health: 'GET /health',
      },
    });
  }

  // -------------------------------------------------------- the Stripe hook

  if (method === 'POST' && path === '/webhooks/stripe') {
    const raw = await readRawBody(req);
    if (!ctx.stripe?.webhookSecret) {
      return sendError(res, invalidInput('Stripe webhooks are not configured.'), 501);
    }
    const event = ctx.stripe.verifyWebhook(raw, req.headers['stripe-signature']);
    await handleStripeEvent(event, ctx);
    return sendJson(res, 200, { ok: true, received: true });
  }

  // --------------------------------------------------------- the tool API

  try {
    requireAuth(req, config);
  } catch (err) {
    return sendError(res, toAppError(err), 401);
  }

  if (method === 'GET' && path === '/tools') {
    return sendJson(res, 200, { ok: true, data: registry.describe() });
  }

  if (method === 'GET' && path === '/tools/openai') {
    return sendJson(res, 200, { ok: true, data: registry.toOpenAiTools() });
  }

  if (path.startsWith('/tools/')) {
    const name = decodeURIComponent(path.slice('/tools/'.length));
    if (method === 'GET') {
      const tool = registry.get(name);
      if (!tool) return sendError(res, invalidInput(`Unknown tool: ${name}`), 404);
      const { readOnly, destructive, idempotent, title, description, inputSchema } = tool;
      return sendJson(res, 200, {
        ok: true,
        data: { name, title, description, readOnly, destructive, idempotent, inputSchema },
      });
    }
    if (method === 'POST') {
      const args = await readJsonBody(req);
      const data = await registry.invoke(name, args, toolContext(ctx));
      return sendJson(res, 200, { ok: true, data });
    }
    return sendError(res, invalidInput(`Method ${method} not allowed on ${path}`), 405);
  }

  if (method === 'POST' && path === '/tools') {
    const body = await readJsonBody(req);
    const name = body.tool || body.name;
    if (!name) throw invalidInput('Provide a tool name as "tool" or "name".');
    const args = body.arguments ?? body.args ?? {};
    const data = await registry.invoke(name, args, toolContext(ctx));
    return sendJson(res, 200, { ok: true, data });
  }

  if (method === 'POST' && path === '/commands') {
    const body = await readJsonBody(req);
    const commands = Array.isArray(body.commands) ? body.commands : [body];
    if (!commands.length) throw invalidInput('No commands given.');
    const results = [];
    for (const command of commands) {
      const name = command.tool || command.name;
      try {
        if (!name) throw invalidInput('Each command needs a "tool" name.');
        const args = command.arguments ?? command.args ?? {};
        const data = await registry.invoke(name, args, toolContext(ctx));
        results.push({ tool: name, ok: true, data });
      } catch (err) {
        const appError = toAppError(err);
        results.push({ tool: name || null, ok: false, error: appError.toJSON() });
      }
    }
    return sendJson(res, 200, {
      ok: true,
      data: {
        results,
        succeeded: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
    });
  }

  if (method === 'POST' && path === '/mcp') {
    const body = await readJsonBody(req);
    const payload = await handleMcpMessage(body, { ...toolContext(ctx) });
    const sse = wantsEventStream(req.headers.accept);
    const out = mcpHttpBody(payload, sse);
    if (!out.contentType) {
      res.writeHead(202).end();
      return undefined;
    }
    res.writeHead(200, {
      'Content-Type': out.contentType,
      'Cache-Control': 'no-store',
      ...(sse ? { Connection: 'keep-alive' } : {}),
    });
    res.end(out.body);
    return undefined;
  }

  return sendError(res, invalidInput(`Not found: ${method} ${path}`), 404);
}

function toolContext(ctx) {
  return {
    registry: ctx.registry,
    backend: ctx.backend,
    config: ctx.config,
    store: ctx.store,
    stripe: ctx.stripe,
    uploadImage: ctx.uploadImage,
    publicBase: ctx.config?.publicBase || '',
  };
}

function detectLocale(req, url) {
  const fromQuery = url.searchParams.get('lang');
  if (isLocale(fromQuery)) return fromQuery;
  const header = req.headers['accept-language'];
  const preferred = String(header || '')
    .split(',')
    .map((part) => part.trim());
  return negotiateLocale(preferred, 'en');
}

/**
 * Inject the shop configuration into the served HTML so the front end knows
 * the locale, the VAT regime and whether Stripe is live.
 */
function injectShopConfig(html, ctx, locale) {
  const settings = ctx.store?.settings || {};
  const payload = {
    locale,
    locales: LOCALES,
    shopName: settings.shopName || 'AURORA',
    currency: settings.currency || 'EUR',
    taxCountry: settings.taxCountry || 'ES',
    vatRate: vatRate(settings.taxCountry || 'ES'),
    pricesIncludeTax: settings.pricesIncludeTax !== false,
    freeShippingThreshold: settings.freeShippingThreshold ?? 50,
    shippingFlatRate: settings.shippingFlatRate ?? 4.9,
    stripeEnabled: Boolean(ctx.stripe?.isConfigured?.()),
    mode: ctx.backend.mode,
    theme: themePayload(getTheme(settings.defaultTheme)),
    themes: THEMES.map(themePayload),
  };
  const script = `<script>window.__SHOP__=${JSON.stringify(payload)};</script>`;
  return html.replace('<!--SHOP_CONFIG-->', script);
}

/** Compact theme record for the browser. */
function themePayload(theme) {
  return {
    id: theme.id,
    name: theme.name,
    industry: theme.industry,
    palette: theme.palette,
    layout: theme.layout,
    fonts: theme.fonts,
  };
}

function requireAdmin(req, config) {
  if (!config.adminPassword) return true;
  const header = req.headers.authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  const provided = bearer ? bearer[1] : req.headers['x-admin-password'];
  return provided === config.adminPassword;
}

async function handleStripeEvent(event, ctx) {
  const type = event?.type;
  if (type !== 'checkout.session.completed') return;
  const session = event.data?.object;
  const orderId = session?.metadata?.orderId;
  if (!orderId) return;
  await ctx.backend.updateOrder({ id: orderId, financialStatus: 'PAID' });
}

function requireAuth(req, config) {
  if (!config.apiKey) return;
  const header = req.headers.authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  const provided = bearer ? bearer[1] : req.headers['x-api-key'];
  if (provided !== config.apiKey) {
    throw unauthorized('Missing or wrong API key. Send "Authorization: Bearer <key>".');
  }
}

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw invalidInput('Request body too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function readJsonBody(req) {
  const text = await readRawBody(req);
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw invalidInput('Request body is not valid JSON.');
  }
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function sendError(res, error, status) {
  const code = error.code || ErrorCode.INTERNAL;
  const httpStatus =
    status ||
    (code === ErrorCode.INVALID_INPUT
      ? 400
      : code === ErrorCode.NOT_FOUND
        ? 404
        : code === ErrorCode.UNAUTHORIZED
          ? 401
          : code === ErrorCode.FORBIDDEN
            ? 403
            : code === ErrorCode.CONFLICT
              ? 409
              : code === ErrorCode.UNSUPPORTED
                ? 501
                : code === ErrorCode.UPSTREAM
                  ? 502
                  : 500);
  sendJson(res, httpStatus, {
    ok: false,
    error: error.toJSON ? error.toJSON() : { code, message: error.message },
  });
}
