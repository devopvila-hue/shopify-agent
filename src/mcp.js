/**
 * MCP (Model Context Protocol) over Streamable HTTP.
 *
 * A focused implementation of the JSON-RPC 2.0 surface an agent needs:
 * initialize, notifications/initialized, ping, tools/list and tools/call.
 * No SDK, no session store, no SSE.
 *
 * The transport is intentionally forgiving: it answers application/json and
 * also honours the text/event-stream Accept header, because different MCP
 * clients send different combinations.
 */

import { toAppError, ErrorCode } from './errors.js';

const JSONRPC_VERSION = '2.0';
const DEFAULT_PROTOCOL_VERSION = '2025-06-18';

export const MCP_SERVER_INFO = { name: 'shopify-agent', version: '1.0.0' };

/** JSON-RPC error codes. */
const RPC = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
};

function rpcError(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: JSONRPC_VERSION, id: id ?? null, error };
}

function rpcResult(id, result) {
  return { jsonrpc: JSONRPC_VERSION, id: id ?? null, result };
}

/**
 * Handle one JSON-RPC request body.
 *
 * @param {unknown} body parsed JSON body (single request or batch)
 * @param {object} ctx { registry, backend }
 * @returns {object|null} the JSON-RPC response, or null for notifications
 */
export async function handleMcpMessage(body, ctx) {
  if (Array.isArray(body)) {
    const responses = [];
    for (const item of body) {
      const response = await handleOne(item, ctx);
      if (response) responses.push(response);
    }
    return responses.length ? responses : null;
  }
  return handleOne(body, ctx);
}

async function handleOne(body, ctx) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return rpcError(null, RPC.INVALID_REQUEST, 'Expected a JSON-RPC object.');
  }
  const { id, method } = body;
  if (typeof method !== 'string') {
    return rpcError(id, RPC.INVALID_REQUEST, 'Missing method.');
  }

  // Notifications carry no id and expect no response.
  const isNotification = id === undefined || id === null;

  try {
    switch (method) {
      case 'initialize': {
        const requested = body.params?.protocolVersion;
        const protocolVersion =
          typeof requested === 'string' && requested.length ? requested : DEFAULT_PROTOCOL_VERSION;
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVER_INFO,
        });
      }
      case 'notifications/initialized':
      case 'initialized':
        return null;
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools: ctx.registry.toMcpTools() });
      case 'tools/call':
        return rpcResult(id, await callTool(body.params || {}, ctx));
      case 'resources/list':
        return rpcResult(id, { resources: [] });
      case 'prompts/list':
        return rpcResult(id, { prompts: [] });
      default:
        if (isNotification) return null;
        return rpcError(id, RPC.METHOD_NOT_FOUND, `Unknown method: ${method}`);
    }
  } catch (err) {
    const appError = toAppError(err);
    if (isNotification) return null;
    return rpcError(id, RPC.INTERNAL_ERROR, appError.message, appError.toJSON());
  }
}

async function callTool(params, ctx) {
  const name = params.name;
  if (typeof name !== 'string' || !name) {
    throw Object.assign(new Error('tools/call requires a tool name.'), {
      code: ErrorCode.INVALID_INPUT,
    });
  }
  const args = params.arguments ?? {};
  try {
    const data = await ctx.registry.invoke(name, args, ctx);
    return {
      content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
      structuredContent: data,
      isError: false,
    };
  } catch (err) {
    const appError = toAppError(err);
    // Tool failures are reported inside the result, as the MCP spec expects,
    // so the model can read the message and retry.
    return {
      content: [{ type: 'text', text: JSON.stringify({ error: appError.toJSON() }, null, 2) }],
      isError: true,
    };
  }
}

/**
 * Wrap a JSON-RPC response as an HTTP body.
 * @param {object|null} payload
 * @param {boolean} sse
 */
export function mcpHttpBody(payload, sse = false) {
  if (payload === null || payload === undefined) {
    return { body: '', contentType: null, sse: false };
  }
  const json = JSON.stringify(payload);
  if (!sse) return { body: json, contentType: 'application/json', sse: false };
  return {
    body: `event: message\ndata: ${json}\n\n`,
    contentType: 'text/event-stream',
    sse: true,
  };
}

/**
 * Does the client accept an SSE stream?
 * @param {string|undefined} acceptHeader
 */
export function wantsEventStream(acceptHeader) {
  if (!acceptHeader) return false;
  return acceptHeader.includes('text/event-stream') && !acceptHeader.includes('application/json');
}
