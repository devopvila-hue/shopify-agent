/**
 * The tool registry.
 *
 * One definition per tool, and three transports generated from it:
 *   - MCP `tools/list` / `tools/call`
 *   - plain HTTP `GET /tools` + `POST /tools/:name`
 *   - OpenAI-style function definitions (`GET /tools/openai`)
 *
 * Adding a tool means adding one definition. Nothing else changes.
 */

import { validateArgs } from './validate.js';
import { toAppError, invalidInput } from './errors.js';

/**
 * @typedef {object} ToolDefinition
 * @property {string} name
 * @property {string} title
 * @property {string} description
 * @property {boolean} readOnly
 * @property {boolean} destructive
 * @property {boolean} idempotent
 * @property {object} inputSchema
 * @property {(backend: any, args: any, ctx: object) => Promise<any>} handler
 */

/**
 * @param {ToolDefinition} tool
 * @returns {ToolDefinition}
 */
export function defineTool(tool) {
  if (!tool || typeof tool.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(tool.name)) {
    throw new Error(`Invalid tool name: ${tool && tool.name}`);
  }
  if (!tool.inputSchema || tool.inputSchema.type !== 'object') {
    throw new Error(`Tool ${tool.name} must declare an object inputSchema`);
  }
  if (typeof tool.handler !== 'function') {
    throw new Error(`Tool ${tool.name} must declare a handler`);
  }
  return {
    readOnly: false,
    destructive: false,
    idempotent: false,
    ...tool,
  };
}

export class Registry {
  /** @param {ToolDefinition[]} tools */
  constructor(tools = []) {
    /** @type {Map<string, ToolDefinition>} */
    this.tools = new Map();
    for (const tool of tools) this.add(tool);
  }

  add(tool) {
    if (this.tools.has(tool.name)) throw new Error(`Duplicate tool: ${tool.name}`);
    this.tools.set(tool.name, tool);
    return this;
  }

  has(name) {
    return this.tools.has(name);
  }

  get(name) {
    return this.tools.get(name);
  }

  list() {
    return [...this.tools.values()];
  }

  /** Catalogue view used by `GET /tools`. */
  describe() {
    return this.list().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      readOnly: tool.readOnly,
      destructive: tool.destructive,
      idempotent: tool.idempotent,
      inputSchema: tool.inputSchema,
    }));
  }

  /** MCP `tools/list` payload. */
  toMcpTools() {
    return this.list().map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      inputSchema: tool.inputSchema,
      annotations: {
        readOnlyHint: Boolean(tool.readOnly),
        destructiveHint: Boolean(tool.destructive),
        idempotentHint: Boolean(tool.idempotent),
        openWorldHint: true,
      },
    }));
  }

  /** OpenAI-compatible function definitions. */
  toOpenAiTools() {
    return this.list().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: `${tool.description}\n\n[${tool.readOnly ? 'read-only' : 'mutating'}${tool.destructive ? ', destructive' : ''}]`,
        parameters: tool.inputSchema,
      },
    }));
  }

  /**
   * Validate arguments and run the tool.
   * @param {string} name
   * @param {unknown} rawArgs
   * @param {object} ctx
   */
  async invoke(name, rawArgs, ctx) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw invalidInput(`Unknown tool: ${name}`, {
        available: this.list().map((t) => t.name),
      });
    }
    const args = validateArgs(rawArgs, tool.inputSchema);
    try {
      const data = await tool.handler(ctx.backend, args, ctx);
      return data;
    } catch (err) {
      throw toAppError(err);
    }
  }
}
