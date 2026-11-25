/**
 * Order tools.
 */

import { defineTool } from '../registry.js';
import { invalidInput } from '../errors.js';

const ADDRESS_SCHEMA = {
  type: 'object',
  description: 'Postal address.',
  properties: {
    address1: { type: 'string' },
    address2: { type: 'string' },
    city: { type: 'string' },
    company: { type: 'string' },
    country: { type: 'string', description: 'Country name, e.g. Spain.' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    phone: { type: 'string' },
    province: { type: 'string', description: 'Province or state.' },
    zip: { type: 'string' },
  },
  additionalProperties: false,
};

const METAFIELDS_SCHEMA = {
  type: 'array',
  description: 'Custom fields to write.',
  items: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Existing metafield id, when updating.' },
      namespace: { type: 'string' },
      key: { type: 'string' },
      value: { type: 'string' },
      type: { type: 'string' },
    },
    required: ['value'],
    additionalProperties: false,
  },
};

export const orderTools = [
  defineTool({
    name: 'search_orders',
    title: 'Search orders',
    description:
      'List or search orders. Filter by status, or by Shopify search syntax such as "email:a@b.com" or ' +
      '"created_at:2026-11-01". Use it to answer "what orders came in today" or "is this order paid".',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: ['any', 'open', 'closed', 'cancelled'],
          default: 'any',
          description: 'Order status filter. Default "any".',
        },
        query: {
          type: 'string',
          description: 'Shopify search syntax over orders, e.g. "email:a@b.com" or "financial_status:paid".',
        },
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 100,
          default: 20,
          description: 'Maximum records to return. Default 20.',
        },
        cursor: { type: 'string', description: 'Opaque cursor from a previous page.' },
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.searchOrders(args),
  }),

  defineTool({
    name: 'get_order',
    title: 'Get one order',
    description:
      'Fetch a single order with its line items, customer, shipping address, totals and metafields.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        orderId: {
          type: 'string',
          minLength: 1,
          description: 'Order id. Accepts a full gid or the bare numeric id.',
        },
      },
      required: ['orderId'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      const order = await backend.getOrder({ id: args.orderId });
      if (!order) throw invalidInput(`No order with id ${args.orderId}`);
      return { order };
    },
  }),

  defineTool({
    name: 'update_order',
    title: 'Update order',
    description:
      'Change an order: tags, contact email, internal note, shipping address or metafields. ' +
      'Only the fields you pass are changed.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Order id or gid.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Replacement tag list.' },
        email: { type: 'string', format: 'email', description: 'Contact email.' },
        note: { type: 'string', description: 'Internal note, visible to staff only.' },
        shippingAddress: ADDRESS_SCHEMA,
        metafields: METAFIELDS_SCHEMA,
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ order: await backend.updateOrder(args) }),
  }),

  defineTool({
    name: 'fulfill_order',
    title: 'Fulfill order',
    description:
      'Mark items of an order as shipped. Pass the order id and, optionally, the line items to ship with their ' +
      'quantities. If you omit the items, every remaining fulfillable item is shipped. Tracking details are ' +
      'optional but recommended.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', minLength: 1, description: 'Order id or gid.' },
        lineItems: {
          type: 'array',
          description: 'Items to ship. Omit to ship everything that is still fulfillable.',
          items: {
            type: 'object',
            properties: {
              lineItemId: {
                type: 'string',
                description: 'Line item id. Get it from get_order.',
              },
              quantity: { type: 'integer', minimum: 1, description: 'How many units to ship.' },
            },
            required: ['lineItemId'],
            additionalProperties: false,
          },
        },
        trackingInfo: {
          type: 'object',
          description: 'Carrier and tracking number.',
          properties: {
            company: { type: 'string' },
            number: { type: 'string' },
            url: { type: 'string' },
          },
          additionalProperties: false,
        },
        notifyCustomer: {
          type: 'boolean',
          default: true,
          description: 'Send the customer the shipping notification. Default true.',
        },
        message: { type: 'string', description: 'Internal message attached to the fulfillment.' },
      },
      required: ['orderId'],
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.fulfillOrder(args),
  }),
];
