/**
 * Tools de productos digitales.
 *
 * Sirven para vender ficheros: un patrón de costura en PDF, plantillas en ZIP,
 * un libro de recetas. El fichero se guarda fuera de la carpeta pública y se
 * entrega con un enlace con token.
 */

import { defineTool } from '../registry.js';
import { invalidInput } from '../errors.js';

export const digitalTools = [
  defineTool({
    name: 'attach_digital_file',
    title: 'Attach digital file',
    description:
      'Attach a downloadable file to a product: a PDF sewing pattern, a ZIP of templates, an ebook. ' +
      'The product becomes a digital product and buyers get a download link when they order it. ' +
      'Accepted: PDF, ZIP, EPUB, DOC, DOCX, XLSX, PPTX, PNG, JPG, TXT, CSV, up to 25 MB.',
    readOnly: false,
    idempotent: false,
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', minLength: 1, description: 'Product the file belongs to.' },
        variantId: {
          type: 'string',
          description: 'Variant, when each variant has its own file. Omit if the file covers all of them.',
        },
        filename: { type: 'string', minLength: 1, description: 'Original file name, for the extension.' },
        contentBase64: { type: 'string', minLength: 1, description: 'File content, base64 encoded.' },
        mimeType: { type: 'string', description: 'For example application/pdf.' },
      },
      required: ['productId', 'filename', 'contentBase64'],
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.attachDigitalFile(args),
  }),

  defineTool({
    name: 'list_digital_files',
    title: 'List digital files',
    description: 'List the downloadable files attached to a product, or to the whole shop.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        productId: { type: 'string', description: 'Only the files of this product.' },
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.listDigitalFiles(args),
  }),

  defineTool({
    name: 'remove_digital_file',
    title: 'Remove digital file',
    description: 'Remove a downloadable file and every download link that pointed at it. Needs confirm: true.',
    readOnly: false,
    destructive: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', minLength: 1, description: 'File id.' },
        confirm: { type: 'boolean', description: 'Must be true.' },
      },
      required: ['id', 'confirm'],
      additionalProperties: false,
    },
    handler: async (backend, args) => {
      if (args.confirm !== true) throw invalidInput('remove_digital_file requires confirm: true');
      return backend.removeDigitalFile(args);
    },
  }),

  defineTool({
    name: 'list_downloads',
    title: 'List download links',
    description:
      'List the download links that have been handed out, with the order and the customer they belong to. ' +
      'Use it to answer "where is the pattern I bought" or to resend a link.',
    readOnly: true,
    idempotent: true,
    inputSchema: {
      type: 'object',
      properties: {
        orderId: { type: 'string', description: 'Only the links of this order.' },
      },
      additionalProperties: false,
    },
    handler: async (backend, args) => backend.listDownloads(args),
  }),
];
