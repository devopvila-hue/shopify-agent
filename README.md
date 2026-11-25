# shopify-agent

An **agentic Shopify server**. It exposes Shopify Admin operations as callable
tools over three transports, so any tool that can receive orders from an AI
can drive a Shopify store.

**There is no chat interface and no LLM inside.** This server does not talk to
the user. It executes orders. That is the whole point: you put it behind
Claude, Cursor, an OpenAI function-calling loop, n8n, a Make scenario, or your
own agent, and the agent gets a clean, typed tool surface.

```
┌──────────────┐   MCP / HTTP / OpenAI functions   ┌────────────────┐   GraphQL   ┌─────────┐
│ your AI tool │ ───────────────────────────────▶  │ shopify-agent │ ──────────▶ │ Shopify │
└──────────────┘                                   └────────────────┘             └─────────┘
```

- **Zero runtime dependencies.** Node's own `http` and `fetch`. No SDK, no
  `zod`, no `graphql-request`, no `dotenv`, no build step.
- **Runs offline.** With no credentials it starts against a built-in mock
  store, so you can develop, test and demo without touching a real store.
- **One catalogue, three transports.** MCP, plain REST and OpenAI function
  definitions are generated from the same 17 tool definitions.

---

## Quick start

```bash
git clone https://github.com/devopvila-hue/shopify-agent.git
cd shopify-agent
npm start
```

That is it — no `npm install` needed, there are no dependencies. The server
starts on `http://127.0.0.1:8788` against the offline mock store.

```bash
curl http://127.0.0.1:8788/health
# {"ok":true,"status":"ready","mode":"mock","tools":17,"apiVersion":"mock"}

curl -X POST http://127.0.0.1:8788/tools/search_products \
  -H 'Content-Type: application/json' \
  -d '{"query":"sweater"}'
```

To talk to a real store, copy `.env.example` to `.env` and fill in your
credentials. Then `npm start` again.

```bash
npm test          # 62 tests, no network needed
npm run smoke     # boots the server and exercises all three transports
```

---

## Connecting it to your AI tool

### 1. Any MCP client (Claude Desktop, Claude Code, Cursor, Zed, …)

Point the client at the HTTP endpoint:

```json
{
  "mcpServers": {
    "shopify": {
      "type": "http",
      "url": "http://127.0.0.1:8788/mcp"
    }
  }
}
```

If the client only speaks stdio MCP, pipe it:

```bash
npx @modelcontextprotocol/server-proxy --url http://127.0.0.1:8788/mcp
```

### 2. Any OpenAI-compatible function-calling loop

The catalogue is already in the shape the OpenAI API expects:

```bash
curl http://127.0.0.1:8788/tools/openai
```

```jsonc
[
  {
    "type": "function",
    "function": {
      "name": "search_products",
      "description": "List or search catalogue products. …",
      "parameters": { "type": "object", "properties": { /* … */ } }
    }
  }
]
```

Feed that straight into your `tools` parameter, then call the tool the model
chose:

```bash
curl -X POST http://127.0.0.1:8788/tools/search_products \
  -H 'Content-Type: application/json' \
  -d '{"query":"hoodie","limit":5}'
```

### 3. A batch of orders in one request

`POST /commands` takes a list and returns one result per command. A failure
in one command does not stop the others.

```bash
curl -X POST http://127.0.0.1:8788/commands \
  -H 'Content-Type: application/json' \
  -d '{
    "commands": [
      { "tool": "list_locations", "arguments": {} },
      { "tool": "search_products", "arguments": { "query": "mug" } },
      { "tool": "get_order", "arguments": { "orderId": "gid://shopify/Order/7001" } }
    ]
  }'
```

```jsonc
{
  "ok": true,
  "data": {
    "results": [
      { "tool": "list_locations", "ok": true, "data": { "locations": [ /* … */ ] } },
      { "tool": "search_products", "ok": true, "data": { "products": [ /* … */ ] } },
      { "tool": "get_order", "ok": false, "error": { "code": "not_found", "message": "…" } }
    ],
    "succeeded": 2,
    "failed": 1
  }
}
```

### 4. A custom agent loop

Every response has the same shape, so the loop is trivial:

```js
const res = await fetch('http://127.0.0.1:8788/tools/' + name, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY}` },
  body: JSON.stringify(args),
});
const { ok, data, error } = await res.json();
if (!ok) return modelFeedback(error.message);
return modelFeedback(data);
```

---

## Endpoints

| Method | Path | What it does |
| --- | --- | --- |
| `GET` | `/health` | Liveness and readiness. Always open. |
| `GET` | `/` | Service description and the endpoint list. |
| `GET` | `/tools` | Full catalogue with JSON Schemas. |
| `GET` | `/tools/openai` | The catalogue as OpenAI function definitions. |
| `GET` | `/tools/{tool}` | One tool's schema and annotations. |
| `POST` | `/tools/{tool}` | Run one tool. The body is the tool's arguments. |
| `POST` | `/tools` | Run one tool, name and args in the body. |
| `POST` | `/commands` | Run a batch of tools. |
| `POST` | `/mcp` | MCP Streamable HTTP (JSON-RPC 2.0). |

Responses are always `{ "ok": true, "data": … }` or
`{ "ok": false, "error": { "code", "message", "details" } }`.

Error codes: `invalid_input`, `not_found`, `unauthorized`, `forbidden`,
`conflict`, `upstream_error`, `unsupported`, `internal_error`.

---

## The tools

| Tool | Kind | What it does |
| --- | --- | --- |
| `store_info` | read | Which store, live or mock, API version, auth mode. |
| `list_locations` | read | Store locations. You need one to move stock. |
| `search_products` | read | Search the catalogue, paginated. |
| `get_product` | read | One product with variants, prices and stock. |
| `create_product` | write | New product, optionally with options. |
| `update_product` | write | Change title, handle, status, tags, SEO, collections. |
| `delete_product` | write, destructive | Permanent delete. Needs `confirm: true`. |
| `manage_variants` | write | Create, update or delete variants. |
| `manage_options` | write, destructive | Create, rename or delete product options. |
| `update_inventory` | write | Set or adjust stock at a location. |
| `search_orders` | read | Search orders by status or query. |
| `get_order` | read | One order with line items and totals. |
| `update_order` | write | Tags, email, note, shipping address, metafields. |
| `fulfill_order` | write | Ship items, with optional tracking. |
| `search_customers` | read | Search customers by email, name or tag. |
| `get_customer` | read | One customer with addresses and spend. |
| `update_customer` | write | Name, email, phone, tags, note, tax exemption. |

Read-only tools are flagged as such (`readOnly` in the catalogue,
`annotations.readOnlyHint` in MCP), so a host can allowlist reads and let a
model write only when it should.

Destructive tools require `confirm: true`. An agent that forgets it gets a
clear error instead of a deleted product.

---

## Configuration

Everything is environment variables. A `.env` file next to `package.json` is
read automatically; real environment variables always win.

| Variable | Default | Meaning |
| --- | --- | --- |
| `SHOPIFY_MODE` | `auto` | `mock`, `shopify`, or `auto`. |
| `SHOPIFY_STORE_DOMAIN` | — | `your-store.myshopify.com`. Required for `shopify`. |
| `SHOPIFY_ACCESS_TOKEN` | — | Static `shpat_…` token (legacy custom apps). |
| `SHOPIFY_CLIENT_ID` | — | Client id for the client-credentials flow. |
| `SHOPIFY_CLIENT_SECRET` | — | Client secret for the client-credentials flow. |
| `SHOPIFY_API_VERSION` | `2026-10` | Admin API version. |
| `HOST` | `127.0.0.1` | Bind address. |
| `PORT` | `8788` | Bind port. |
| `AGENT_API_KEY` | — | If set, every call needs `Authorization: Bearer <key>`. |
| `SHOPIFY_REQUIRE_AUTH` | `false` | Refuse to start in mock mode. |

### Authentication

Shopify stopped issuing static Admin API tokens through its UI in January
2026, so the **client-credentials** flow is the forward path:

```
SHOPIFY_STORE_DOMAIN=your-store.myshopify.com
SHOPIFY_CLIENT_ID=...
SHOPIFY_CLIENT_SECRET=...
```

The server exchanges the credentials for a short-lived token and refreshes it
in the background, so a long-lived agent process never has to think about it.
Static tokens still work if that is all you have.

---

## What was simplified, and why

This started as a reverse engineering pass over the published
`shopify-mcp` package (v1.0.8): 14 tools, stdio transport only, 6 runtime
dependencies, a module-level mutable client, and no inventory or fulfillment
tool at all. The result here keeps the useful ideas and drops the rest.

| | `shopify-mcp` 1.0.8 | `shopify-agent` |
| --- | --- | --- |
| Transports | stdio only | MCP over HTTP, REST, OpenAI functions |
| Runtime dependencies | 6 (`zod`, `graphql-request`, `dotenv`, `minimist`, …) | 0 |
| State | module-level mutable singleton client | one injected backend per request |
| Errors | raw GraphQL exceptions | uniform `{ code, message }` envelope |
| Pagination | `limit` only | opaque cursor everywhere |
| Inventory | missing | `update_inventory` |
| Fulfillment | missing | `fulfill_order` |
| Metafields | passed into `productUpdate` (ignored by Shopify) | `metafieldsSet` |
| Options API | hand rolled | `productOptionsCreate` / `productOptionUpdate` / `productOptionsDelete` |
| Runs without a store | no | yes, offline mock |
| Tests | none | 62 |

The live backend was written against the current Admin GraphQL docs
(`2026-10` is the latest stable as of now), including the version-gated
`@idempotent` directive and `changeFromQuantity` on inventory adjustments.

---

## Layout

```
src/
  index.js            entry point: config → backend → server
  config.js           environment and .env
  server.js           HTTP routing, auth, error envelope
  mcp.js              MCP Streamable HTTP (JSON-RPC 2.0)
  registry.js         the tool catalogue and the three serialisations
  validate.js         small JSON Schema validator
  errors.js           the error contract
  tools/              one file per domain
  backends/
    mock.js           offline, seeded, in-memory
    shopify.js        live Admin GraphQL
test/                 62 tests
```

The two backends implement the same domain API, so a tool never learns which
one it is talking to, and the mock can be trusted as a contract for the live
one.

---

## License

MIT.
