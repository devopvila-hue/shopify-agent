/**
 * The HTTP server.
 *
 * One process, three ways in:
 *   - MCP Streamable HTTP   POST /mcp
 *   - plain tool calls      POST /tools/:name, POST /commands
 *   - schema export         GET /tools, GET /tools/openai
 *
 * There is no chat endpoint and no LLM inside. This server executes orders,
 * it does not talk to the user.
 */

import { createServer as createHttpServer } from 'node:http';
import { URL } from 'node:url';
import { toAppError, ErrorCode, unauthorized, invalidInput } from './errors.js';
import { handleMcpMessage, mcpHttpBody, wantsEventStream, MCP_SERVER_INFO } from './mcp.js';

const MAX_BODY_BYTES = 1024 * 1024;

/**
 * @param {object} options
 * @param {import('./registry.js').Registry} options.registry
 * @param {object} options.backend
 * @param {object} options.config
 */
export function createServer({ registry, backend, config }) {
  const server = createHttpServer((req, res) => {
    handle(req, res, { registry, backend, config }).catch((err) => {
      sendError(res, toAppError(err));
    });
  });
  server.on('clientError', (_err, socket) => {
    socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  return server;
}

async function handle(req, res, { registry, backend, config }) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = (req.method || 'GET').toUpperCase();

  // Health check stays open so a supervisor can probe the process.
  if (path === '/health') {
    return sendJson(res, 200, {
      ok: true,
      status: 'ready',
      mode: backend.mode,
      tools: registry.list().length,
      apiVersion: backend.apiVersion,
    });
  }

  try {
    requireAuth(req, config);
  } catch (err) {
    return sendError(res, toAppError(err), 401);
  }

  if (method === 'GET' && path === '/') {
    return sendJson(res, 200, {
      ok: true,
      service: MCP_SERVER_INFO.name,
      version: MCP_SERVER_INFO.version,
      description:
        'Agentic Shopify server. Exposes Shopify operations as callable tools. ' +
        'No chat interface, no LLM inside.',
      mode: backend.mode,
      endpoints: {
        tools: 'GET /tools',
        openaiTools: 'GET /tools/openai',
        callTool: 'POST /tools/{tool}',
        commands: 'POST /commands',
        mcp: 'POST /mcp',
        health: 'GET /health',
      },
    });
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
      const data = await registry.invoke(name, args, { registry, backend, config });
      return sendJson(res, 200, { ok: true, data });
    }
    return sendError(res, invalidInput(`Method ${method} not allowed on ${path}`), 405);
  }

  if (method === 'POST' && path === '/tools') {
    const body = await readJsonBody(req);
    const name = body.tool || body.name;
    if (!name) throw invalidInput('Provide a tool name as "tool" or "name".');
    const args = body.arguments ?? body.args ?? {};
    const data = await registry.invoke(name, args, { registry, backend, config });
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
        const data = await registry.invoke(name, args, { registry, backend, config });
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
    const payload = await handleMcpMessage(body, { registry, backend, config });
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

function requireAuth(req, config) {
  if (!config.apiKey) return;
  const header = req.headers.authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(header);
  const provided = bearer ? bearer[1] : req.headers['x-api-key'];
  if (provided !== config.apiKey) {
    throw unauthorized('Missing or wrong API key. Send "Authorization: Bearer <key>".');
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw invalidInput('Request body too large.');
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return {};
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
