/**
 * Tools de ofertas (presupuestos).
 *
 * Una oferta es una propuesta de venta: puede llevar productos del catálogo o
 * líneas libres con precio propio, que es lo que hace falta para presupuestar
 * un proyecto (DEPARTIFY, por ejemplo, vende automatizaciones, no SKUs).
 *
 * Aceptar una oferta crea un pedido de verdad en la tienda.
 */

import { defineTool } from '../registry.js';
import { invalidInput, notFound } from '../errors.js';
import { QUOTE_STATUS } from '../quotes.js';

const CUSTOMER_SCHEMA = {
  type: 'object',
  description: 'Who the quote is for.',
  properties: {
    email: { type: 'string', format: 'email', description: 'Contact email. Required to send the quote.' },
    firstName: { type: 'string' },
    lastName: { type: 'string' },
    company: { type: 'string', description: 'Company name.' },
    phone: { type: 'string' },
  },
  additionalProperties: false,
};

const LINE_SCHEMA = {
  type: 'array',
  minItems: 1,
  description:
    'What is being quoted. Use a variantId for catalogue products, or a free line with a title and a price for services.',
  items: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Line description. Filled from the product when you use a variantId.' },
      description: { type: 'string', description: 'Extra detail for this line.' },
      variantId: {
        type: 'string',
        description: 'Catalogue variant to quote. When given, the price comes from the catalogue.',
      },
      quantity: { type: 'integer', minimum: 1, default: 1, description: 'Units. Default 1.' },
      unitPrice: {
        type: 'string',
        description: 'Price per unit, tax excluded, as a decimal string e.g. "2400.00". Required for free lines.',
      },
    },
    additionalProperties: false,
  },
};

const DISCOUNT_SCHEMA = {
  type: 'object',
  description: 'Discount applied to the whole quote.',
  properties: {
    type: { type: 'string', enum: ['percent', 'fixed'], default: 'percent', description: 'Percent or fixed amount.' },
    value: { type: 'number', minimum: 0, description: 'The percentage or the amount, depending on type.' },
  },
  required: ['value'],
  additionalProperties: false,
};

export const quoteTools = [
  defineTool({
    name: 'create_quote',
    title: 'Create quote',
    description:
      'Create a quote (a price proposal) for a customer. Mix catalogue products and free lines, for example ' +
      '"3 x sweater at 89 EUR plus 400 EUR of design work". Returns the quote with its totals, tax included.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        customer: CUSTOMER_SCHEMA,
        lines: LINE_SCHEMA,
        discount: DISCOUNT_SCHEMA,
        validUntil: {
          type: 'string',
          description: 'When the quote stops being valid, as an ISO date e.g. 2026-12-31.',
        },
        note: { type: 'string', description: 'Message for the customer, shown on the quote.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags to find it later.' },
        status: {
          type: 'string',
          enum: ['DRAFT', 'SENT'],
          default: 'DRAFT',
          description: 'DRAFT while you prepare it, SENT once the customer has it.',
        },
      },
      required: ['lines'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ quote: await backend.createQuote(args) }),
  }),

  defineTool({
    name: 'list_quotes',
    title: 'List quotes',
    description:
      'List the quotes, newest first. Filter by status or by customer email. Use it to answer ' +
      '"what did I quote to this client" or "what is still open".',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          enum: QUOTE_STATUS,
          description: 'Only quotes in this status.',
        },
        customerEmail: { type: 'string', description: 'Quotes for this email.' },
        limit: { type: 'integer', minimum: 1, maximum: 100, default: 20, description: 'Maximum quotes. Default 20.' },
        cursor: { type: 'string', description: 'Opaque cursor from a previous page.' },
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.listQuotes(args),
  }),

  defineTool({
    name: 'get_quote',
    title: 'Get one quote',
    description: 'Fetch a quote with its lines, discount, tax and totals, and the order it produced if accepted.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          minLength: 1,
          description: 'Quote id or number, e.g. OF-2026-0001.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      const quote = await backend.getQuote({ id: args.id });
      if (!quote) throw notFound(`No quote with id ${args.id}`);
      return { quote };
    },
  }),

  defineTool({
    name: 'update_quote',
    title: 'Update quote',
    description:
      'Change a quote: its lines, its discount, the expiry date, the note, the tags or its status. ' +
      'The totals and the tax are recalculated. An accepted quote can no longer be changed.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Quote id or number.' },
        status: { type: 'string', enum: QUOTE_STATUS, description: 'New status.' },
        customer: CUSTOMER_SCHEMA,
        lines: LINE_SCHEMA,
        discount: DISCOUNT_SCHEMA,
        validUntil: { type: 'string', description: 'New expiry date, ISO.' },
        note: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ quote: await backend.updateQuote(args) }),
  }),

  defineTool({
    name: 'accept_quote',
    title: 'Accept quote',
    description:
      'Turn a quote into a real order: the quote becomes ACCEPTED and an order is created in the store ' +
      'with its lines, ready to be prepared and shipped. Needs confirm: true.',
    readOnly: false,
    destructive: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Quote id or number.' },
        confirm: { type: 'boolean', description: 'Must be true. It creates a real order.' },
        shippingAddress: {
          type: 'object',
          description: 'Shipping address for the order, if the quote had none.',
          properties: {
            address1: { type: 'string' },
            address2: { type: 'string' },
            city: { type: 'string' },
            country: { type: 'string' },
            provinceCode: { type: 'string' },
            zip: { type: 'string' },
            firstName: { type: 'string' },
            lastName: { type: 'string' },
            phone: { type: 'string' },
          },
          additionalProperties: false,
        },
      },
      required: ['id', 'confirm'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (args.confirm !== true) {
        throw invalidInput('accept_quote requires confirm: true: it creates a real order.');
      }
      return backend.acceptQuote(args);
    },
  }),

  defineTool({
    name: 'decline_quote',
    title: 'Decline quote',
    description: 'Mark a quote as declined, with an optional reason. It stays on record for the history.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Quote id or number.' },
        reason: { type: 'string', description: 'Why it was declined. Kept with the quote.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.declineQuote(args),
  }),
];
