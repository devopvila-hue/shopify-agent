/**
 * Productos digitales.
 *
 * Un fichero (un PDF con un patrón de costura, un ZIP con plantillas, un
 * libro de recipes) se guarda fuera de la carpeta pública y se entrega con
 * un enlace con token: quien tenga el enlace descarga el fichero, quien no,
 * no.
 *
 * El token es la contraseña. Por eso la ruta de descarga vive fuera del
 * cierre de la API: el cliente no tiene por qué saber la clave del servidor.
 */

import { randomBytes, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { invalidInput, notFound, forbidden } from './errors.js';

const ALLOWED = {
  'application/pdf': '.pdf',
  'application/zip': '.zip',
  'application/x-zip-compressed': '.zip',
  'application/epub+zip': '.epub',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/plain': '.txt',
  'text/csv': '.csv',
};

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

/**
 * @param {string} [mimeType]
 * @param {string} [filename]
 * @returns {string} the extension to use
 */
export function extensionFor(mimeType, filename = '') {
  const known = ALLOWED[String(mimeType || '').toLowerCase()];
  if (known) return known;
  const match = /\.([a-z0-9]{2,5})$/i.exec(String(filename).trim());
  const ext = match ? `.${match[1].toLowerCase()}` : '';
  if (ext && Object.values(ALLOWED).includes(ext)) return ext;
  throw invalidInput(
    `That file type is not allowed for a digital product. Accepted: PDF, ZIP, EPUB, DOC, DOCX, XLSX, PPTX, PNG, JPG, TXT, CSV.`,
  );
}

/**
 * @param {string} filename
 * @returns {string} a safe file name
 */
export function safeName(filename) {
  const base = String(filename || 'file')
    .split('/')
    .pop()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return base || 'file';
}

/**
 * Store a file for a product and register it.
 *
 * @param {object} options
 * @param {object} options.store the ShopStore
 * @param {string} options.productId
 * @param {string} [options.variantId]
 * @param {string} options.filename
 * @param {string} options.contentBase64
 * @param {string} options.mimeType
 * @param {string} options.dir where the files live
 * @returns {object} the stored file
 */
export function attachFile({ store, productId, variantId = null, filename, contentBase64, mimeType, dir }) {
  const extension = extensionFor(mimeType, filename);
  const name = safeName(filename);
  const base64 = String(contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw invalidInput('No file content was sent.');

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw invalidInput('The file content is not valid base64.');
  }
  if (!buffer.length) throw invalidInput('The file is empty.');
  if (buffer.length > MAX_FILE_BYTES) {
    throw invalidInput(
      `The file is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, the limit is 25 MB.`,
    );
  }

  const id = `file_${randomBytes(8).toString('hex')}`;
  const storedName = `${id}${extension}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, storedName), buffer);

  const record = {
    id,
    productId,
    variantId,
    filename: name,
    storedName,
    mimeType: String(mimeType || 'application/octet-stream'),
    bytes: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex'),
    createdAt: new Date().toISOString(),
    downloads: 0,
  };
  store.addFile(record);
  return record;
}

/**
 * Give somebody the right to download a file.
 *
 * @param {object} options
 * @param {object} options.store
 * @param {object} options.file the stored file record
 * @param {string} options.orderId
 * @param {string} [options.email]
 * @param {number} [options.expiresInDays]
 */
export function grantDownload({ store, file, orderId, email = '', expiresInDays = 30 }) {
  const grant = {
    token: randomBytes(24).toString('hex'),
    fileId: file.id,
    productId: file.productId,
    variantId: file.variantId,
    filename: file.filename,
    orderId: orderId || null,
    email,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + expiresInDays * 86400000).toISOString(),
    downloads: 0,
  };
  store.addGrant(grant);
  return grant;
}

/**
 * Resolve a download token.
 * @param {object} store
 * @param {string} token
 */
export function resolveGrant(store, token) {
  const grant = store.listGrants().find((g) => g.token === token);
  if (!grant) throw notFound('That download link is not valid.');
  if (grant.expiresAt && new Date(grant.expiresAt).getTime() < Date.now()) {
    throw forbidden('That download link has expired.');
  }
  const file = store.listFiles().find((f) => f.id === grant.fileId);
  if (!file) throw notFound('The file behind that link is gone.');
  return { grant, file };
}

/**
 * Read the bytes of a stored file.
 * @param {object} file
 * @param {string} dir
 */
export function readFile(file, dir) {
  const path = join(dir, file.storedName);
  if (!existsSync(path)) throw notFound('The file is not on disk any more.');
  return { path, buffer: readFileSync(path), bytes: statSync(path).size };
}
