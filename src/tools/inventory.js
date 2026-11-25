/**
 * Inventory tools.
 */

import { defineTool } from '../registry.js';

export const inventoryTools = [
  defineTool({
    name: 'update_inventory',
    title: 'Update inventory',
    description:
      'Change the stock of a variant at a location. Give either a quantity (set an absolute number) or a delta ' +
      '(add or subtract). Get variant ids from get_product or search_products, and location ids from list_locations.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        variantId: {
          type: 'string',
          minLength: 1,
          description: 'Variant id (gid://shopify/ProductVariant/123).',
        },
        inventoryItemId: {
          type: 'string',
          minLength: 1,
          description: 'Inventory item id, if you have one instead of the variant id.',
        },
        locationId: {
          type: 'string',
          minLength: 1,
          description: 'Location id where the stock is kept.',
        },
        quantity: {
          type: 'integer',
          description: 'Absolute number of units to set. Mutually exclusive with delta.',
        },
        delta: {
          type: 'integer',
          description: 'Units to add (positive) or subtract (negative). Mutually exclusive with quantity.',
        },
        reason: {
          type: 'string',
          enum: ['correction', 'received', 'damaged', 'movement_created', 'movement_updated', 'other'],
          default: 'correction',
          description: 'Audit reason recorded with the adjustment. Default "correction".',
        },
      },
      required: ['locationId'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (!args.variantId && !args.inventoryItemId) {
        const err = new Error('Provide either variantId or inventoryItemId');
        err.code = 'invalid_input';
        throw err;
      }
      if (args.quantity === undefined && args.delta === undefined) {
        const err = new Error('Provide either quantity (absolute) or delta (relative)');
        err.code = 'invalid_input';
        throw err;
      }
      if (args.quantity !== undefined && args.delta !== undefined) {
        const err = new Error('Provide quantity or delta, not both');
        err.code = 'invalid_input';
        throw err;
      }
      return backend.updateInventory(args);
    },
  }),
];
