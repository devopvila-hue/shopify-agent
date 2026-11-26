/**
 * Product tools.
 *
 * Every handler talks to the backend through a small domain API, so the same
 * tool works against a real store and against the offline mock.
 */

import { defineTool } from '../registry.js';
import { invalidInput } from '../errors.js';

const STATUS_ENUM = ['ACTIVE', 'DRAFT', 'ARCHIVED'];

const SEO_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string', description: 'SEO title tag.' },
    description: { type: 'string', description: 'SEO meta description.' },
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
      type: { type: 'string', description: 'e.g. single_line_text_field, json, number_integer' },
    },
    required: ['value'],
    additionalProperties: false,
  },
};

const PAGINATION = {
  limit: {
    type: 'integer',
    minimum: 1,
    maximum: 100,
    default: 20,
    description: 'Maximum records to return. Default 20.',
  },
  cursor: {
    type: 'string',
    description: 'Opaque cursor from a previous page. Omit for the first page.',
  },
};

export const productTools = [
  defineTool({
    name: 'search_products',
    title: 'Search products',
    description:
      'List or search catalogue products. Use this to answer "what do we sell", "find the product called X" or ' +
      'to check prices and stock. Returns a page of products plus a cursor to fetch the next page.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Free text search using Shopify search syntax over title, body, vendor and tags. ' +
            'Plain words work ("hoodie"); advanced filters work too ("tag:new", "vendor:Northwind"). ' +
            'Combined with the status filter below.',
        },
        status: {
          type: 'string',
          enum: STATUS_ENUM,
          description: 'Restrict to a product status. Omit for all statuses.',
        },
        ...PAGINATION,
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.searchProducts(args),
  }),

  defineTool({
    name: 'get_product',
    title: 'Get one product',
    description:
      'Fetch a single product with its variants, prices, stock levels, images, collections and metafields. ' +
      'Use this before editing a product so you change what you think you are changing.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          minLength: 1,
          description:
            'Shopify product id. Accepts the full gid (gid://shopify/Product/123) or the bare numeric id (123).',
        },
      },
      required: ['productId'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      const product = await backend.getProduct({ id: args.productId });
      if (!product) throw invalidInput(`No product with id ${args.productId}`);
      return { product };
    },
  }),

  defineTool({
    name: 'create_product',
    title: 'Create product',
    description:
      'Create a product. Starts as DRAFT unless you set a status. Use productOptions to create options such as ' +
      'Size or Colour in the same call.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', minLength: 1, description: 'Product title.' },
        descriptionHtml: { type: 'string', description: 'Rich text description.' },
        handle: {
          type: 'string',
          description: 'URL slug. Auto-generated from the title when omitted.',
        },
        vendor: { type: 'string', description: 'Vendor / brand.' },
        productType: { type: 'string', description: 'Product type or category.' },
        tags: { type: 'array', items: { type: 'string' }, description: 'Tags.' },
        status: {
          type: 'string',
          enum: STATUS_ENUM,
          default: 'DRAFT',
          description: 'Product status. Default DRAFT.',
        },
        seo: SEO_SCHEMA,
        metafields: METAFIELDS_SCHEMA,
        productOptions: {
          type: 'array',
          maxItems: 3,
          description: 'Options to create inline, for example Size with values S, M, L.',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, description: 'Option name, e.g. Size.' },
              values: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { name: { type: 'string', minLength: 1 } },
                  required: ['name'],
                  additionalProperties: false,
                },
                description: 'Option values. Omit for a free-text option.',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        collectionsToJoin: {
          type: 'array',
          items: { type: 'string' },
          description: 'Collection ids to add the product to.',
        },
        categoryId: {
          type: 'string',
          description: 'Shop category id, from list_categories.',
        },
        images: {
          type: 'array',
          maxItems: 5,
          description: 'Product images, in display order. Up to five. The default one is what the shop shows.',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', minLength: 1 },
              alt: { type: 'string' },
              isDefault: { type: 'boolean' },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
        taxRate: {
          type: 'number',
          description: 'VAT percentage for this product. Overrides the category and the shop default.',
        },
        isDigital: {
          type: 'boolean',
          description: 'True when the product is a file the customer downloads instead of a parcel.',
        },
      },
      required: ['title'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ product: await backend.createProduct(args) }),
  }),

  defineTool({
    name: 'update_product',
    title: 'Update product',
    description:
      'Update fields on an existing product. Only the fields you pass are changed; everything else is left alone. ' +
      'Collections can be added with collectionsToJoin and removed with collectionsToLeave.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Product id or gid.' },
        title: { type: 'string' },
        descriptionHtml: { type: 'string' },
        handle: { type: 'string', description: 'New URL slug.' },
        vendor: { type: 'string' },
        productType: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        status: { type: 'string', enum: STATUS_ENUM },
        seo: SEO_SCHEMA,
        metafields: METAFIELDS_SCHEMA,
        collectionsToJoin: { type: 'array', items: { type: 'string' } },
        collectionsToLeave: { type: 'array', items: { type: 'string' } },
        redirectNewHandle: {
          type: 'boolean',
          description: 'Keep the old handle as a redirect when changing it.',
        },
        categoryId: {
          type: 'string',
          description: 'Move the product to this category, from list_categories.',
        },
        images: {
          type: 'array',
          maxItems: 5,
          description: 'Replace the product images, in display order. Up to five. The default one is what the shop shows.',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', minLength: 1 },
              alt: { type: 'string' },
              isDefault: { type: 'boolean' },
            },
            required: ['url'],
            additionalProperties: false,
          },
        },
        taxRate: {
          type: 'number',
          description: 'VAT percentage for this product. Overrides the category and the shop default.',
        },
        isDigital: {
          type: 'boolean',
          description: 'True when the product is a file the customer downloads instead of a parcel.',
        },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (backend, args) => ({ product: await backend.updateProduct(args) }),
  }),

  defineTool({
    name: 'delete_product',
    title: 'Delete product',
    description:
      'Permanently delete a product and all of its variants. This cannot be undone. Prefer update_product with ' +
      'status ARCHIVED for reversible removal.',
    readOnly: false,
    destructive: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'Product id or gid.' },
        confirm: {
          type: 'boolean',
          description: 'Must be true. Set it to acknowledge that the deletion is permanent.',
        },
      },
      required: ['id', 'confirm'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (args.confirm !== true) {
        throw invalidInput('delete_product requires confirm: true');
      }
      return backend.deleteProduct({ id: args.id });
    },
  }),

  defineTool({
    name: 'manage_variants',
    title: 'Manage product variants',
    description:
      'Create, update or delete the variants of a product. Variants carry price, sku, barcode and inventory. ' +
      'For inventory quantities use update_inventory instead.',
    readOnly: false,
    destructive: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', minLength: 1, description: 'Product id or gid.' },
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete'],
          default: 'update',
          description: 'What to do with the variants below. Default "update".',
        },
        variants: {
          type: 'array',
          minItems: 1,
          description: 'Variants to create or update.',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'Variant id. Required for update, omit for create.',
              },
              price: { type: 'string', description: 'Price as a decimal string, e.g. "49.00".' },
              compareAtPrice: { type: 'string', description: 'Compare-at price, shown struck through.' },
              sku: { type: 'string', description: 'Stock keeping unit.' },
              barcode: { type: 'string' },
              taxable: { type: 'boolean' },
              tracked: { type: 'boolean', description: 'Whether inventory is tracked for this variant.' },
              optionValues: {
                type: 'array',
                description: 'Option values for this variant, e.g. Size = M.',
                items: {
                  type: 'object',
                  properties: {
                    optionName: { type: 'string', description: 'Option name, e.g. Size.' },
                    name: { type: 'string', description: 'Option value, e.g. M.' },
                  },
                  required: ['optionName', 'name'],
                  additionalProperties: false,
                },
              },
            },
            additionalProperties: false,
          },
        },
        strategy: {
          type: 'string',
          enum: ['DEFAULT', 'REMOVE_STANDALONE_VARIANT', 'PRESERVE_STANDALONE_VARIANT'],
          description:
            'What to do with the default "Title" variant when creating. DEFAULT removes it automatically, ' +
            'which is what you normally want.',
        },
        confirm: {
          type: 'boolean',
          description: 'Must be true when action is "delete".',
        },
      },
      required: ['productId', 'variants'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (args.action === 'delete') {
        if (args.confirm !== true) {
          throw invalidInput('manage_variants with action "delete" requires confirm: true');
        }
        return backend.deleteVariants({
          productId: args.productId,
          variantIds: args.variants.map((v) => v.id).filter(Boolean),
        });
      }
      return backend.manageVariants(args);
    },
  }),

  defineTool({
    name: 'manage_options',
    title: 'Manage product options',
    description:
      'Create, rename or delete product options (Size, Colour...). Creating an option adds it to the product; ' +
      'deleting an option removes it and the values attached to it.',
    readOnly: false,
    destructive: true,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', minLength: 1, description: 'Product id or gid.' },
        action: {
          type: 'string',
          enum: ['create', 'update', 'delete'],
          description: 'create adds an option, update renames it or edits its values, delete removes it.',
        },
        options: {
          type: 'array',
          description: 'Options to create (action "create").',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', minLength: 1, description: 'Option name, e.g. Size.' },
              position: { type: 'integer', minimum: 1, description: '1-based position among the options.' },
              values: {
                type: 'array',
                items: { type: 'string' },
                description: 'Option values, e.g. ["A4", "A3"].',
              },
            },
            required: ['name'],
            additionalProperties: false,
          },
        },
        optionId: { type: 'string', description: 'Option id to update (action "update").' },
        name: { type: 'string', description: 'New option name (action "update").' },
        position: { type: 'integer', minimum: 1, description: 'New position (action "update").' },
        valuesToAdd: {
          type: 'array',
          items: { type: 'string' },
          description: 'Values to add to the option (action "update").',
        },
        valuesToDelete: {
          type: 'array',
          items: { type: 'string' },
          description: 'Value ids to remove from the option (action "update").',
        },
        optionIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Option ids to delete (action "delete").',
        },
        confirm: { type: 'boolean', description: 'Must be true when action is "delete".' },
      },
      required: ['productId', 'action'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (args.action === 'delete' && args.confirm !== true) {
        throw invalidInput('manage_options with action "delete" requires confirm: true');
      }
      return backend.manageOptions(args);
    },
  }),
];
