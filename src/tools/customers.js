/**
 * Customer tools.
 */

import { defineTool } from '../registry.js';
import { invalidInput } from '../errors.js';

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

export const customerTools = [
  defineTool({
    name: 'search_customers',
    title: 'Search customers',
    description:
      'List or search customers. Use it to answer "who is this customer" and to see how much each customer ' +
      'has spent. The query accepts Shopify search syntax, so an email address works as a query.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search term. An email address, a name, or Shopify search syntax such as "tag:vip".',
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
    handler: async (backend, args) => backend.searchCustomers(args),
  }),

  defineTool({
    name: 'get_customer',
    title: 'Get one customer',
    description:
      'Fetch a single customer with contact details, tags, addresses, order count and total spend.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        customerId: {
          type: 'string',
          minLength: 1,
          description: 'Customer id. Accepts a full gid or the bare numeric id.',
        },
      },
      required: ['customerId'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      const customer = await backend.getCustomer({ id: args.customerId });
      if (!customer) throw invalidInput(`No customer with id ${args.customerId}`);
      return { customer };
    },
  }),

  defineTool({
    name: 'update_customer',
    title: 'Update customer',
    description:
      'Change a customer record: name, email, phone, tags, tax exemption, internal note or metafields. ' +
      'Only the fields you pass are changed.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Customer id or gid.' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string', format: 'email' },
        phone: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Replacement tag list.' },
        note: { type: 'string', description: 'Internal note.' },
        taxExempt: { type: 'boolean' },
        metafields: METAFIELDS_SCHEMA,
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ customer: await backend.updateCustomer(args) }),
  }),
];
