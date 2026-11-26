/**
 * Tools de importación de catálogo.
 *
 * Traen productos desde otra plataforma (Shopify, WooCommerce o Wix) al
 * catálogo de la tienda, con sus variantes, precios, imágenes y stock.
 *
 * Importar dos veces el mismo producto lo actualiza, no lo duplica.
 */

import { defineTool } from '../registry.js';
import { invalidInput } from '../errors.js';
import { IMPORT_SOURCES } from '../importers/index.js';

const CONNECTION_SCHEMA = {
  type: 'object',
  description:
    'How to reach the source store. Which fields are needed depends on the source: ' +
    'Shopify needs domain and token; WooCommerce needs url, key and secret; ' +
    'Wix needs siteId and token.',
  properties: {
    domain: { type: 'string', description: 'Shopify store domain, e.g. your-store.myshopify.com.' },
    token: { type: 'string', description: 'Shopify Admin API token, or a Wix access token.' },
    apiVersion: { type: 'string', description: 'Shopify Admin API version, e.g. 2026-10.' },
    url: { type: 'string', description: 'WooCommerce store URL, e.g. https://tienda.example.com.' },
    key: { type: 'string', description: 'WooCommerce consumer key.' },
    secret: { type: 'string', description: 'WooCommerce consumer secret.' },
    siteId: { type: 'string', description: 'Wix site ID.' },
    baseUrl: { type: 'string', description: 'Wix API base URL, if the default does not fit.' },
  },
  additionalProperties: false,
};

export const importTools = [
  defineTool({
    name: 'test_import_connection',
    title: 'Test import connection',
    description:
      'Check the credentials for a source store without importing anything. Use it before a real import ' +
      'so the owner finds out about a wrong password before the catalogue is half copied.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: IMPORT_SOURCES,
          description: 'Which platform to read from.',
        },
        connection: CONNECTION_SCHEMA,
      },
      required: ['source', 'connection'],
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.testImportConnection(args),
  }),

  defineTool({
    name: 'import_catalogue',
    title: 'Import catalogue',
    description:
      'Import the catalogue from another store into this shop: products, variants, prices, images, ' +
      'categories and stock. Use dryRun first to see what would come in. Importing the same product ' +
      'again updates it instead of duplicating it.',
    readOnly: false,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: IMPORT_SOURCES,
          description: 'Which platform to read from.',
        },
        connection: CONNECTION_SCHEMA,
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 1000,
          default: 250,
          description: 'Maximum products to import. Default 250.',
        },
        dryRun: {
          type: 'boolean',
          default: false,
          description: 'When true, nothing is written: it only reports what would be imported.',
        },
      },
      required: ['source', 'connection'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (!args.source) throw invalidInput('Choose the source platform.');
      return backend.importCatalogue(args);
    },
  }),
];
