/**
 * Store level tools: where am I, and where is the stock.
 */

import { defineTool } from '../registry.js';

export const storeTools = [
  defineTool({
    name: 'store_info',
    title: 'Store info',
    description:
      'Report which store this server is talking to, whether it is live or the offline mock, the Admin API ' +
      'version in use and how many locations exist. Call this first when you need to know what you are allowed ' +
      'to expect. Never guess: this tells you the truth.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (backend) => backend.storeInfo(),
  }),

  defineTool({
    name: 'list_locations',
    title: 'List locations',
    description:
      'List the physical locations of the store. You need a location id to adjust inventory, because stock is ' +
      'counted per location.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum locations to return. Default 20.',
        },
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ locations: await backend.listLocations(args) }),
  }),
];
