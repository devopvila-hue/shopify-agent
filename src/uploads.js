/**
 * Subida de imágenes.
 *
 * El fichero se guarda en `public/uploads/` y se sirve desde ahí. Solo se
 * aceptan imágenes, con un límite de 5 MB, y el nombre se genera en el
 * servidor: nadie decide dónde se escribe ni con qué nombre.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { invalidInput } from './errors.js';

const ALLOWED = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

const MAX_BYTES = 5 * 1024 * 1024;

/**
 * @param {object} args { filename, contentBase64, mimeType }
 * @param {object} config
 * @returns {Promise<{url: string, path: string, bytes: number, mimeType: string}>}
 */
export async function uploadImage(args, config) {
  const filename = String(args.filename || 'image');
  const mimeType = String(args.mimeType || '').toLowerCase();
  const extension = ALLOWED[mimeType] || ALLOWED[`image/${extname(filename).slice(1).toLowerCase()}`];
  if (!extension) {
    throw invalidInput(`Unsupported image type: ${mimeType || extname(filename) || 'unknown'}.`);
  }

  const base64 = String(args.contentBase64 || '').replace(/^data:[^;]+;base64,/, '');
  if (!base64) throw invalidInput('No image content was sent.');

  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch {
    throw invalidInput('The image content is not valid base64.');
  }
  if (!buffer.length) throw invalidInput('The image content is empty.');
  if (buffer.length > MAX_BYTES) {
    throw invalidInput(`The image is ${(buffer.length / 1024 / 1024).toFixed(1)} MB, the limit is 5 MB.`);
  }

  const dir = join(resolve(process.cwd(), 'public'), 'uploads');
  mkdirSync(dir, { recursive: true });

  const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}${extension}`;
  const path = join(dir, name);
  writeFileSync(path, buffer);

  return {
    url: `/uploads/${name}`,
    path,
    bytes: buffer.length,
    mimeType: mimeType || `image/${extension.slice(1)}`,
  };
}
