#!/usr/bin/env node
/**
 * Builds the public site into `dist/`.
 *
 * Only the storefront goes out: the owner panel and the tool API stay on the
 * server, they are not part of the static site.
 *
 *   npm run build:site
 */

import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = join(ROOT, 'public');
const DIST = join(ROOT, 'dist');

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

cpSync(join(PUBLIC, 'index.html'), join(DIST, 'index.html'));
cpSync(join(PUBLIC, 'assets'), join(DIST, 'assets'), { recursive: true });

// The static site has no server behind it, so the shop runs in demo mode and
// the catalogue travels with it.
const catalogue = JSON.parse(readFileSync(join(PUBLIC, 'assets', 'catalog.json'), 'utf8'));
writeFileSync(join(DIST, 'assets', 'catalog.json'), `${JSON.stringify(catalogue, null, 2)}\n`);

process.stdout.write(
  `site: dist/ (index.html, assets/, ${catalogue.products.length} products, ${catalogue.themes.length} templates)\n`,
);
