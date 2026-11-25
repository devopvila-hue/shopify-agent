/**
 * Tools de administración del propietario.
 *
 * Son las mismas tools que ve un agente, pero con intención de tienda: son
 * las que usa el panel de /admin. Todo lo que se puede hacer desde el panel
 * se puede hacer también desde un cliente MCP o desde REST.
 */

import { defineTool } from '../registry.js';
import { invalidInput, notFound, unsupported } from '../errors.js';
import { LOCALES } from '../i18n.js';
import { VAT_RATES, COUNTRY_NAMES } from '../tax.js';
import { THEMES } from '../themes.js';

const IMAGE_SCHEMA = {
  type: 'array',
  description: 'Product images, in display order.',
  items: {
    type: 'object',
    properties: {
      url: { type: 'string', minLength: 1, description: 'Image URL. Must be http(s) or a path under /uploads/.' },
      alt: { type: 'string', description: 'Alternative text, used by screen readers.' },
    },
    required: ['url'],
    additionalProperties: false,
  },
};

export const adminTools = [
  defineTool({
    name: 'list_categories',
    title: 'List categories',
    description:
      'List the shop categories. These are the owner taxonomy, not Shopify collections: ' +
      'they group products for the storefront and can carry their own VAT rate.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (backend) => ({ categories: await backend.listCategories() }),
  }),

  defineTool({
    name: 'create_category',
    title: 'Create category',
    description:
      'Create a category. Optionally give it its own VAT rate, which then applies to every ' +
      'product in it unless the product overrides it.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 1, description: 'Category name, as shown to the customer.' },
        slug: { type: 'string', description: 'URL slug. Generated from the name when omitted.' },
        description: { type: 'string', description: 'Short description for the category page.' },
        taxRate: {
          type: 'number',
          description:
            'VAT percentage for this category, e.g. 21 for Spain, 19 for Romania, 27 for Hungary. ' +
            'Leave it out to use the shop default.',
        },
        imageUrl: { type: 'string', description: 'Image for the category header.' },
      },
      required: ['name'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ category: await backend.createCategory(args) }),
  }),

  defineTool({
    name: 'update_category',
    title: 'Update category',
    description: 'Rename a category, change its description, image or VAT rate.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Category id.' },
        name: { type: 'string' },
        description: { type: 'string' },
        taxRate: { type: 'number', description: 'VAT percentage, or null to go back to the shop default.' },
        imageUrl: { type: 'string' },
        position: { type: 'integer', minimum: 0, description: 'Order in the storefront.' },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ category: await backend.updateCategory(args) }),
  }),

  defineTool({
    name: 'delete_category',
    title: 'Delete category',
    description:
      'Delete a category. The products stay, they just lose the category. Needs confirm: true.',
    readOnly: false,
    destructive: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Category id.' },
        confirm: { type: 'boolean', description: 'Must be true.' },
      },
      required: ['id', 'confirm'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (args.confirm !== true) throw invalidInput('delete_category requires confirm: true');
      return backend.deleteCategory(args);
    },
  }),

  defineTool({
    name: 'assign_category',
    title: 'Assign category to product',
    description: 'Put a product into a category, or take it out of every category.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', minLength: 1, description: 'Product id.' },
        categoryId: {
          type: 'string',
          description: 'Category id. Leave it out to remove the product from its category.',
        },
      },
      required: ['productId'],
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.assignCategory(args),
  }),

  defineTool({
    name: 'set_product_images',
    title: 'Set product images',
    description:
      'Replace the images of a product. Give an ordered list of image URLs. Images already ' +
      'uploaded through upload_image come back as /uploads/... URLs.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', minLength: 1, description: 'Product id.' },
        images: IMAGE_SCHEMA,
      },
      required: ['productId', 'images'],
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.setProductImages(args),
  }),

  defineTool({
    name: 'upload_image',
    title: 'Upload image',
    description:
      'Store an image on the server and get a URL back. Send the file base64 encoded. ' +
      'Only png, jpeg, webp, gif and svg are accepted, up to 5 MB.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string', minLength: 1, description: 'Original file name, for the extension.' },
        contentBase64: { type: 'string', minLength: 1, description: 'File content, base64 encoded.' },
        mimeType: { type: 'string', description: 'For example image/png.' },
      },
      required: ['filename', 'contentBase64'],
      additionalProperties: false,
    },
    handler: async (backend, args, ctx) => ctx.uploadImage(args),
  }),

  defineTool({
    name: 'shop_stats',
    title: 'Shop stats',
    description:
      'Dashboard numbers: revenue, order count, product count, low stock variants and the ' +
      'VAT configuration currently in force.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async (backend) => backend.shopStats(),
  }),

  defineTool({
    name: 'update_settings',
    title: 'Update shop settings',
    description:
      'Change the shop settings: which country VAT applies to, whether displayed prices include ' +
      'VAT, the currency, the free shipping threshold, the default language and the shop name.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        shopName: { type: 'string' },
        currency: { type: 'string', minLength: 3, maxLength: 3, description: 'ISO code, e.g. EUR.' },
        taxCountry: {
          type: 'string',
          description: `Country whose VAT rate applies. ${Object.entries(VAT_RATES)
            .map(([code, rate]) => `${code} ${rate}%`)
            .join(', ')}.`,
        },
        pricesIncludeTax: {
          type: 'boolean',
          description: 'When true (EU default) the storefront shows prices with VAT included.',
        },
        defaultLocale: {
          type: 'string',
          enum: LOCALES,
          description: 'Language used when the visitor has no preference.',
        },
        freeShippingThreshold: { type: 'number', minimum: 0, description: 'Order value for free shipping.' },
        shippingFlatRate: { type: 'number', minimum: 0, description: 'Flat shipping cost.' },
        defaultTheme: {
          type: 'string',
          enum: THEMES.map((t) => t.id),
          description: `Design template for the storefront. ${THEMES.map((t) => `${t.id} (${t.industry})`).join(', ')}.`,
        },
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ settings: await backend.updateSettings(args) }),
  }),

  defineTool({
    name: 'create_checkout_session',
    title: 'Create checkout session',
    description:
      'Create a Stripe Checkout session and return the URL the customer has to pay on. ' +
      'Only works when the server has Stripe configured; otherwise it reports that Stripe ' +
      'is not set up.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        lines: {
          type: 'array',
          minItems: 1,
          description: 'What the customer is paying for.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, description: 'Product name shown at checkout.' },
              amount: { type: 'number', description: 'Amount per unit, tax included, in the currency unit.' },
              currency: { type: 'string', description: 'Currency code. Defaults to the shop currency.' },
              quantity: { type: 'integer', minimum: 1, default: 1 },
            },
            required: ['name', 'amount'],
            additionalProperties: false,
          },
        },
        orderId: { type: 'string', description: 'Order this payment belongs to.' },
        customerEmail: { type: 'string', format: 'email' },
        successUrl: { type: 'string', description: 'Where Stripe sends the customer after paying.' },
        cancelUrl: { type: 'string', description: 'Where Stripe sends the customer if they cancel.' },
      },
      required: ['lines'],
      additionalProperties: false,
    },
    handler: async (backend, args, ctx) => {
      const stripe = ctx.stripe;
      if (!stripe || !stripe.isConfigured()) {
        throw unsupported('Stripe is not configured on this server. Set STRIPE_SECRET_KEY.');
      }
      const base = ctx.publicBase || '';
      const session = await stripe.createCheckoutSession({
        lines: args.lines,
        customerEmail: args.customerEmail,
        successUrl: args.successUrl || `${base}/#/orders`,
        cancelUrl: args.cancelUrl || `${base}/#/cart`,
        metadata: args.orderId ? { orderId: args.orderId } : undefined,
      });
      return { sessionId: session.id, url: session.url };
    },
  }),

  defineTool({
    name: 'list_tax_rates',
    title: 'List VAT rates',
    description:
      'Standard VAT rate for every country the shop supports. Use it to explain a price or to ' +
      'check which rate a country will get.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: async () => ({
      rates: Object.entries(VAT_RATES).map(([country, rate]) => ({
        country,
        name: COUNTRY_NAMES[country] || country,
        rate,
      })),
    }),
  }),
];
