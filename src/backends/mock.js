/**
 * Offline mock backend.
 *
 * Implements exactly the same domain API as the live Shopify backend, over an
 * in-memory store seeded with a deterministic catalogue. That means every tool
 * works with no credentials and no network, and the server can be started and
 * tested anywhere.
 *
 * It is not a Shopify emulator: it covers the operations this server exposes
 * and nothing else.
 */

import { notFound, invalidInput, conflict } from '../errors.js';
import { vatRate, breakdown, round2 } from '../tax.js';
import { computeQuote, quoteView, discountLines } from '../quotes.js';
import { attachFile, grantDownload } from '../digital.js';

const DAY = 24 * 60 * 60 * 1000;
const EPOCH = Date.parse('2026-11-01T09:00:00.000Z');

let counter = 0;
const nextId = (prefix, start = 1000) => `${prefix}${(start + counter++).toString()}`;

export function gid(type, id) {
  return `gid://shopify/${type}/${id}`;
}

/** Accepts a gid or a bare numeric id and returns the numeric part. */
export function numericId(value) {
  if (typeof value !== 'string') return null;
  const match = /(\d+)\s*$/.exec(value.trim());
  return match ? match[1] : null;
}

function seed() {
  counter = 0;
  const locationId = 'gid://shopify/Location/9001';

  const products = [
    {
      id: 'gid://shopify/Product/1001',
      title: 'Aurora Merino Sweater',
      descriptionHtml: '<p>Soft merino wool sweater.</p>',
      handle: 'aurora-merino-sweater',
      status: 'ACTIVE',
      vendor: 'Northwind',
      productType: 'Apparel',
      tags: ['new', 'wool'],
      createdAt: new Date(EPOCH - 20 * DAY).toISOString(),
      updatedAt: new Date(EPOCH - 2 * DAY).toISOString(),
      imageUrl: null,
      variants: [
        {
          id: 'gid://shopify/ProductVariant/2001',
          title: 'S',
          price: '89.00',
          compareAtPrice: null,
          sku: 'AUR-S',
          barcode: '',
          taxable: true,
          tracked: true,
          inventoryItemId: 'gid://shopify/InventoryItem/3001',
          selectedOptions: [{ name: 'Size', value: 'S' }],
          inventory: { [locationId]: 12 },
        },
        {
          id: 'gid://shopify/ProductVariant/2002',
          title: 'M',
          price: '89.00',
          compareAtPrice: null,
          sku: 'AUR-M',
          barcode: '',
          taxable: true,
          tracked: true,
          inventoryItemId: 'gid://shopify/InventoryItem/3002',
          selectedOptions: [{ name: 'Size', value: 'M' }],
          inventory: { [locationId]: 7 },
        },
        {
          id: 'gid://shopify/ProductVariant/2003',
          title: 'L',
          price: '94.00',
          compareAtPrice: null,
          sku: 'AUR-L',
          barcode: '',
          taxable: true,
          tracked: true,
          inventoryItemId: 'gid://shopify/InventoryItem/3003',
          selectedOptions: [{ name: 'Size', value: 'L' }],
          inventory: { [locationId]: 0 },
        },
      ],
      collections: [{ id: 'gid://shopify/Collection/5001', title: 'New arrivals' }],
      metafields: [],
    },
    {
      id: 'gid://shopify/Product/1002',
      title: 'Ceramica Mug',
      descriptionHtml: '<p>Hand thrown stoneware mug, 350 ml.</p>',
      handle: 'ceramica-mug',
      status: 'ACTIVE',
      vendor: 'Ceramica Studio',
      productType: 'Home',
      tags: ['handmade'],
      createdAt: new Date(EPOCH - 60 * DAY).toISOString(),
      updatedAt: new Date(EPOCH - 10 * DAY).toISOString(),
      imageUrl: null,
      variants: [
        {
          id: 'gid://shopify/ProductVariant/2004',
          title: 'Default Title',
          price: '24.00',
          compareAtPrice: null,
          sku: 'CER-01',
          barcode: '',
          taxable: true,
          tracked: true,
          inventoryItemId: 'gid://shopify/InventoryItem/3004',
          selectedOptions: [{ name: 'Title', value: 'Default Title' }],
          inventory: { [locationId]: 43 },
        },
      ],
      collections: [],
      metafields: [],
    },
    {
      id: 'gid://shopify/Product/1003',
      title: 'Alpine Daypack 22L',
      descriptionHtml: '<p>Twenty two litre day pack.</p>',
      handle: 'alpine-daypack-22l',
      status: 'DRAFT',
      vendor: 'Northwind',
      productType: 'Bags',
      tags: [],
      createdAt: new Date(EPOCH - 3 * DAY).toISOString(),
      updatedAt: new Date(EPOCH - 1 * DAY).toISOString(),
      imageUrl: null,
      variants: [
        {
          id: 'gid://shopify/ProductVariant/2005',
          title: 'Default Title',
          price: '145.00',
          compareAtPrice: '175.00',
          sku: 'ALP-22',
          barcode: '',
          taxable: true,
          tracked: true,
          inventoryItemId: 'gid://shopify/InventoryItem/3005',
          selectedOptions: [{ name: 'Title', value: 'Default Title' }],
          inventory: { [locationId]: 4 },
        },
      ],
      collections: [],
      metafields: [],
    },
  ];

  // The rest of the catalogue, kept compact on purpose.
  const EXTRA = [
    { t: 'Fjord Down Vest', c: 'Apparel', v: 'Northwind', p: '145.00', d: 'Relleno reciclado, corte técnico, capucha desmontable.', o: [['S', 6], ['M', 9], ['L', 4]] },
    { t: 'Tind Wool Scarf', c: 'Apparel', v: 'Northwind', p: '39.00', d: 'Lana merino de Thickness, 180 × 30 cm.', o: [['One size', 25]] },
    { t: 'Coast Merino Beanie', c: 'Apparel', v: 'Northwind', p: '29.00', d: 'Punto fino, doble vuelta, instructions de lavado tejidas.', o: [['One size', 40]] },
    { t: 'Ceramica Bowl Set', c: 'Home', v: 'Ceramica Studio', p: '58.00', d: 'Tres bol es torneados y esmaltados a mano.', o: [['Set of 3', 18]] },
    { t: 'Linen Apron', c: 'Home', v: 'Ceramica Studio', p: '42.00', d: 'Lino grueso con correas de algodón.', o: [['One size', 22]] },
    { t: 'Cedar Desk Tray', c: 'Home', v: 'Atelier Nord', p: '62.00', d: 'Cedro macizo con rebaje para bolígrafo.', o: [['One size', 11]] },
    { t: 'Solstice Candle', c: 'Home', v: 'Atelier Nord', p: '28.00', d: 'Cera de soja, 55 horas de burning, notes de hinojo.', o: [['350 g', 30]] },
    { t: 'Trek Wallet', c: 'Bags', v: 'Northwind', p: '35.00', d: 'Cuero curtido con costura reforzada.', o: [['One size', 52]] },
    { t: 'Harbour Canvas Tote', c: 'Bags', v: 'Northwind', p: '79.00', d: 'Lona encerada, base reforzada, 38 × 42 cm.', o: [['Natural', 14], ['Negro', 8]] },
    { t: 'Field Notebook Set', c: 'Paper', v: 'Atelier Nord', p: '19.00', d: 'Tres cuadernos de papel de algodón cosido.', o: [['Set of 3', 64]] },
  ];

  let variantSeq = 2200;
  let itemSeq = 3200;
  for (const [index, spec] of EXTRA.entries()) {
    const productId = `gid://shopify/Product/${1100 + index}`;
    const variants = spec.o.map(([value, stock]) => {
      variantSeq += 1;
      itemSeq += 1;
      return {
        id: `gid://shopify/ProductVariant/${variantSeq}`,
        title: value,
        price: spec.p,
        compareAtPrice: null,
        sku: `${spec.t.slice(0, 3).toUpperCase()}-${value.replace(/\s+/g, '').slice(0, 4).toUpperCase()}`,
        barcode: '',
        taxable: true,
        tracked: true,
        inventoryItemId: `gid://shopify/InventoryItem/${itemSeq}`,
        selectedOptions: [{ name: 'Title', value }],
        inventory: { [locationId]: stock },
      };
    });
    products.push({
      id: productId,
      title: spec.t,
      descriptionHtml: `<p>${spec.d}</p>`,
      handle: slugify(spec.t),
      status: 'ACTIVE',
      vendor: spec.v,
      productType: spec.c,
      tags: [spec.c.toLowerCase()],
      createdAt: new Date(EPOCH - (30 + index * 4) * DAY).toISOString(),
      updatedAt: new Date(EPOCH - (index + 1) * DAY).toISOString(),
      imageUrl: null,
      variants,
      collections: [],
      metafields: [],
    });
  }

  const customers = [
    {
      id: 'gid://shopify/Customer/6001',
      firstName: 'Marta',
      lastName: 'Rivas',
      email: 'marta.rivas@example.com',
      phone: '+34 600 000 001',
      createdAt: new Date(EPOCH - 120 * DAY).toISOString(),
      tags: ['vip'],
      note: 'Always ships to the Valencia warehouse.',
      taxExempt: false,
      numberOfOrders: 2,
      amountSpent: { amount: '202.00', currencyCode: 'EUR' },
      addresses: [
        {
          address1: 'Calle Mayor 12',
          address2: '',
          city: 'Valencia',
          provinceCode: 'VC',
          country: 'Spain',
          zip: '46001',
          phone: '+34 600 000 001',
        },
      ],
      metafields: [],
    },
    {
      id: 'gid://shopify/Customer/6002',
      firstName: 'Jonas',
      lastName: 'Berg',
      email: 'jonas.berg@example.com',
      phone: '',
      createdAt: new Date(EPOCH - 40 * DAY).toISOString(),
      tags: [],
      note: '',
      taxExempt: false,
      numberOfOrders: 1,
      amountSpent: { amount: '89.00', currencyCode: 'EUR' },
      addresses: [],
      metafields: [],
    },
    {
      id: 'gid://shopify/Customer/6003',
      firstName: 'Lucia',
      lastName: 'Ferrer',
      email: 'lucia.ferrer@example.com',
      phone: '+34 600 000 003',
      createdAt: new Date(EPOCH - 5 * DAY).toISOString(),
      tags: ['wholesale'],
      note: '',
      taxExempt: true,
      numberOfOrders: 0,
      amountSpent: { amount: '0.00', currencyCode: 'EUR' },
      addresses: [],
      metafields: [],
    },
  ];

  const orders = [
    {
      id: 'gid://shopify/Order/7001',
      name: '#1001',
      createdAt: new Date(EPOCH - 1 * DAY).toISOString(),
      displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'UNFULFILLED',
      totalPrice: { amount: '113.00', currencyCode: 'EUR' },
      subtotalPrice: { amount: '89.00', currencyCode: 'EUR' },
      totalShippingPrice: { amount: '4.50', currencyCode: 'EUR' },
      totalTax: { amount: '19.50', currencyCode: 'EUR' },
      customer: {
        id: 'gid://shopify/Customer/6001',
        firstName: 'Marta',
        lastName: 'Rivas',
        email: 'marta.rivas@example.com',
      },
      shippingAddress: {
        address1: 'Calle Mayor 12',
        address2: '',
        city: 'Valencia',
        provinceCode: 'VC',
        country: 'Spain',
        zip: '46001',
        phone: '+34 600 000 001',
      },
      lineItems: [
        {
          id: 'gid://shopify/LineItem/8001',
          title: 'Aurora Merino Sweater',
          quantity: 1,
          fulfilledQuantity: 0,
          totalPrice: { amount: '89.00', currencyCode: 'EUR' },
          variant: { id: 'gid://shopify/ProductVariant/2002', title: 'M', sku: 'AUR-M' },
        },
      ],
      tags: ['priority'],
      note: 'Leave with the neighbour if nobody answers.',
      metafields: [],
    },
    {
      id: 'gid://shopify/Order/7002',
      name: '#1002',
      createdAt: new Date(EPOCH - 4 * DAY).toISOString(),
      displayFinancialStatus: 'PAID',
      displayFulfillmentStatus: 'FULFILLED',
      totalPrice: { amount: '24.00', currencyCode: 'EUR' },
      subtotalPrice: { amount: '24.00', currencyCode: 'EUR' },
      totalShippingPrice: { amount: '0.00', currencyCode: 'EUR' },
      totalTax: { amount: '0.00', currencyCode: 'EUR' },
      customer: {
        id: 'gid://shopify/Customer/6002',
        firstName: 'Jonas',
        lastName: 'Berg',
        email: 'jonas.berg@example.com',
      },
      shippingAddress: {
        address1: 'Storgatan 4',
        address2: '',
        city: 'Stockholm',
        provinceCode: '',
        country: 'Sweden',
        zip: '11122',
        phone: '',
      },
      lineItems: [
        {
          id: 'gid://shopify/LineItem/8002',
          title: 'Ceramica Mug',
          quantity: 1,
          fulfilledQuantity: 1,
          totalPrice: { amount: '24.00', currencyCode: 'EUR' },
          variant: { id: 'gid://shopify/ProductVariant/2004', title: 'Default Title', sku: 'CER-01' },
        },
      ],
      tags: [],
      note: '',
      metafields: [],
    },
    {
      id: 'gid://shopify/Order/7003',
      name: '#1003',
      createdAt: new Date(EPOCH - 9 * DAY).toISOString(),
      displayFinancialStatus: 'REFUNDED',
      displayFulfillmentStatus: 'CANCELLED',
      totalPrice: { amount: '145.00', currencyCode: 'EUR' },
      subtotalPrice: { amount: '145.00', currencyCode: 'EUR' },
      totalShippingPrice: { amount: '0.00', currencyCode: 'EUR' },
      totalTax: { amount: '0.00', currencyCode: 'EUR' },
      customer: {
        id: 'gid://shopify/Customer/6001',
        firstName: 'Marta',
        lastName: 'Rivas',
        email: 'marta.rivas@example.com',
      },
      shippingAddress: null,
      lineItems: [
        {
          id: 'gid://shopify/LineItem/8003',
          title: 'Alpine Daypack 22L',
          quantity: 1,
          fulfilledQuantity: 0,
          totalPrice: { amount: '145.00', currencyCode: 'EUR' },
          variant: { id: 'gid://shopify/ProductVariant/2005', title: 'Default Title', sku: 'ALP-22' },
        },
      ],
      tags: [],
      note: 'Customer cancelled within the hour.',
      metafields: [],
    },
  ];

  return {
    shop: { name: 'Demo Store', domain: 'demo.myshopify.com', currency: 'EUR' },
    locations: [
      {
        id: locationId,
        name: 'Valencia Warehouse',
        address: {
          address1: 'Carrer de la Font 3',
          city: 'Valencia',
          provinceCode: 'VC',
          countryCode: 'ES',
          zip: '46001',
        },
      },
    ],
    products,
    customers,
    orders,
  };
}

/**
 * Cursor pagination over an array. The cursor is an opaque base64 offset.
 */
function paginate(items, limit, cursor) {
  const offset = decodeCursor(cursor);
  if (offset > items.length) {
    throw invalidInput('Invalid cursor: it points past the end of the result set.');
  }
  const slice = items.slice(offset, offset + limit);
  const nextOffset = offset + slice.length;
  const hasNextPage = nextOffset < items.length;
  return {
    items: slice,
    pageInfo: {
      hasNextPage,
      endCursor: hasNextPage ? encodeCursor(nextOffset) : null,
      totalCount: items.length,
    },
  };
}

export function encodeCursor(offset) {
  return Buffer.from(`offset:${offset}`, 'utf8').toString('base64url');
}

export function decodeCursor(cursor) {
  if (cursor === undefined || cursor === null || cursor === '') return 0;
  try {
    const decoded = Buffer.from(String(cursor), 'base64url').toString('utf8');
    const match = /^offset:(\d+)$/.exec(decoded);
    if (!match) throw new Error('bad cursor');
    return Number(match[1]);
  } catch {
    throw invalidInput('Invalid cursor.');
  }
}

function matches(text, term) {
  return String(text || '').toLowerCase().includes(term);
}

function money(amount, currency) {
  return { amount: String(amount), currencyCode: currency };
}

export class MockBackend {
  /**
   * @param {object} [store] a ShopStore, for categories, images and tax
   */
  constructor(store = null, filesDirectory = null) {
    this.mode = 'mock';
    this.apiVersion = 'mock';
    this.data = seed();
    this.currency = this.data.shop.currency;
    this.store = store;
    this.filesDirectory = filesDirectory;
  }

  get settings() {
    return (
      this.store?.settings || {
        currency: this.currency,
        taxCountry: 'ES',
        pricesIncludeTax: true,
        freeShippingThreshold: 50,
        shippingFlatRate: 4.9,
        shopName: 'AURORA',
        defaultLocale: 'en',
      }
    );
  }

  /** VAT rate that applies to the shop right now. */
  get taxRate() {
    return vatRate(this.settings.taxCountry);
  }

  async storeInfo() {
    const settings = this.settings;
    return {
      mode: this.mode,
      shop: settings.shopName || this.data.shop.name,
      domain: this.data.shop.domain,
      apiVersion: this.apiVersion,
      currency: settings.currency || this.currency,
      taxCountry: settings.taxCountry,
      vatRate: this.taxRate,
      pricesIncludeTax: settings.pricesIncludeTax !== false,
      defaultLocale: settings.defaultLocale || 'en',
      locationCount: this.data.locations.length,
      productCount: this.data.products.length,
      orderCount: this.data.orders.length,
      customerCount: this.data.customers.length,
      live: false,
    };
  }

  // ----------------------------------------------------------- categorías

  async listCategories() {
    if (!this.store) return [];
    return this.store.listCategories();
  }

  async createCategory(input) {
    if (!this.store) throw conflict('This backend does not support categories.');
    return this.store.createCategory(input);
  }

  async updateCategory(input) {
    if (!this.store) throw conflict('This backend does not support categories.');
    const updated = this.store.updateCategory(input.id, input);
    if (!updated) throw notFound(`No category with id ${input.id}`);
    return updated;
  }

  async deleteCategory(input) {
    if (!this.store) throw conflict('This backend does not support categories.');
    const removed = this.store.deleteCategory(input.id);
    if (!removed) throw notFound(`No category with id ${input.id}`);
    return { deletedCategoryId: removed.id };
  }

  async assignCategory(input) {
    if (!this.store) throw conflict('This backend does not support categories.');
    const product = this.#findProduct(input.productId);
    if (!product) throw notFound(`No product with id ${input.productId}`);
    if (input.categoryId) {
      const category = this.store.findCategory(input.categoryId);
      if (!category) throw notFound(`No category with id ${input.categoryId}`);
    }
    this.store.setProductMeta(product.id, { category: input.categoryId || null });
    return { product: this.#productView(product) };
  }

  async setProductImages(input) {
    if (!this.store) throw conflict('This backend does not support images.');
    const product = this.#findProduct(input.productId);
    if (!product) throw notFound(`No product with id ${input.productId}`);
    this.store.setProductMeta(product.id, { images: input.images || [] });
    return { product: this.#productView(product) };
  }

  // -------------------------------------------------- ficheros digitales

  get filesDir() {
    return this.filesDirectory;
  }

  async attachDigitalFile(input) {
    if (!this.store) throw conflict('This backend does not support digital files.');
    const product = this.#findProduct(input.productId);
    if (!product) throw notFound(`No product with id ${input.productId}`);
    const file = attachFile({
      store: this.store,
      productId: input.productId,
      variantId: input.variantId || null,
      filename: input.filename,
      contentBase64: input.contentBase64,
      mimeType: input.mimeType,
      dir: this.filesDirectory,
    });
    this.store.setProductMeta(product.id, { digital: true });
    return { file: fileView(file) };
  }

  async listDigitalFiles(input = {}) {
    if (!this.store) throw conflict('This backend does not support digital files.');
    return { files: this.store.listFiles(input.productId).map(fileView) };
  }

  async removeDigitalFile(input) {
    if (!this.store) throw conflict('This backend does not support digital files.');
    const removed = this.store.removeFile(input.id);
    if (!removed) throw notFound(`No file with id ${input.id}`);
    return { deletedFileId: removed.id };
  }

  async listDownloads(input = {}) {
    if (!this.store) throw conflict('This backend does not support digital files.');
    const grants = this.store.listGrants();
    const filtered = input.orderId ? grants.filter((g) => g.orderId === input.orderId) : grants;
    return {
      downloads: filtered.map((g) => ({
        token: g.token,
        filename: g.filename,
        orderId: g.orderId,
        email: g.email,
        url: `/downloads/${g.token}`,
        expiresAt: g.expiresAt,
        downloads: g.downloads || 0,
        createdAt: g.createdAt,
      })),
    };
  }

  async updateSettings(input) {
    if (!this.store) throw conflict('This backend does not support settings.');
    return this.store.updateSettings(input);
  }

  async shopStats() {
    const settings = this.settings;
    const paid = this.data.orders.filter(
      (o) => o.displayFinancialStatus === 'PAID' || o.displayFinancialStatus === 'PARTIALLY_PAID',
    );
    const revenue = paid.reduce((sum, o) => sum + Number(o.totalPrice.amount), 0);
    const lowStock = this.data.products.flatMap((p) =>
      p.variants
        .filter((v) => Object.values(v.inventory).some((n) => n > 0 && n <= 5))
        .map((v) => ({
          productId: p.id,
          title: p.title,
          variantId: v.id,
          variant: v.title,
          available: Object.values(v.inventory).reduce((a, b) => a + b, 0),
        })),
    );
    return {
      revenue: { amount: revenue.toFixed(2), currencyCode: settings.currency || this.currency },
      orderCount: this.data.orders.length,
      paidOrderCount: paid.length,
      productCount: this.data.products.length,
      customerCount: this.data.customers.length,
      categoryCount: this.store ? this.store.listCategories().length : 0,
      lowStock,
      taxCountry: settings.taxCountry,
      vatRate: this.taxRate,
      currency: settings.currency || this.currency,
    };
  }

  async listLocations({ limit = 20 } = {}) {
    return this.data.locations.slice(0, limit).map((location) => ({
      id: location.id,
      name: location.name,
      address: location.address,
    }));
  }

  // ---------------------------------------------------------------- products

  /** Seed catalogue plus anything imported from another platform. */
  #allProducts() {
    return [...this.data.products, ...(this.store ? this.store.listImported() : [])];
  }

  async importCatalogue(options) {
    const { runImport } = await import('../importers/index.js');
    return runImport({
      ...options,
      store: this.store,
      locations: this.data.locations,
    });
  }

  async testImportConnection(options) {
    const { importer } = await import('../importers/index.js');
    return importer(options.source).testConnection(options.connection);
  }

  async searchProducts({ query, status, limit = 20, cursor } = {}) {
    let items = this.#allProducts();
    if (query) {
      const term = String(query).toLowerCase();
      items = items.filter(
        (p) => matches(p.title, term) || matches(p.vendor, term) || matches(p.productType, term) || matches(p.handle, term),
      );
    }
    if (status) items = items.filter((p) => p.status === status);
    const page = paginate(items, limit, cursor);
    return { products: page.items.map((p) => this.#productView(p)), pageInfo: page.pageInfo };
  }

  async getProduct({ id }) {
    const product = this.#findProduct(id);
    if (!product) return null;
    return this.#productView(product);
  }

  async createProduct(input) {
    const product = {
      id: gid('Product', nextId('p', 1100)),
      title: input.title,
      descriptionHtml: input.descriptionHtml || '',
      handle: input.handle || slugify(input.title),
      status: input.status || 'DRAFT',
      vendor: input.vendor || '',
      productType: input.productType || '',
      tags: input.tags || [],
      createdAt: new Date(EPOCH).toISOString(),
      updatedAt: new Date(EPOCH).toISOString(),
      imageUrl: null,
      variants: [],
      collections: [],
      metafields: (input.metafields || []).map((m) => ({
        id: gid('Metafield', nextId('m', 7000)),
        namespace: m.namespace || 'custom',
        key: m.key || '',
        value: m.value,
        type: m.type || 'single_line_text_field',
      })),
    };

    const options = input.productOptions || [];
    for (const option of options) {
      const values = (option.values || []).map((v) => v.name);
      product.variants = buildVariants(product, option.name, values, this.currency);
    }
    if (!product.variants.length) {
      product.variants = buildVariants(product, 'Title', ['Default Title'], this.currency);
    }
    if (input.collectionsToJoin?.length) {
      product.collections = input.collectionsToJoin.map((cid) => ({ id: cid, title: cid }));
    }
    this.data.products.push(product);
    if (this.store) {
      const meta = {};
      if (input.categoryId !== undefined) meta.category = input.categoryId;
      if (input.images !== undefined) meta.images = input.images;
      if (input.taxRate !== undefined) meta.taxRate = input.taxRate;
      if (input.isDigital !== undefined) meta.digital = input.isDigital;
      if (Object.keys(meta).length) this.store.setProductMeta(product.id, meta);
    }
    return this.#productView(product);
  }

  async updateProduct(input) {
    const product = this.#findProduct(input.id);
    if (!product) throw notFound(`No product with id ${input.id}`);

    for (const field of ['title', 'descriptionHtml', 'handle', 'vendor', 'productType', 'status']) {
      if (input[field] !== undefined) product[field] = input[field];
    }
    if (input.tags !== undefined) product.tags = input.tags;
    if (input.seo) product.seo = input.seo;
    if (input.metafields) {
      product.metafields = mergeMetafields(product.metafields, input.metafields);
    }
    if (input.collectionsToJoin?.length) {
      for (const cid of input.collectionsToJoin) {
        if (!product.collections.some((c) => c.id === cid)) {
          product.collections.push({ id: cid, title: cid });
        }
      }
    }
    if (input.collectionsToLeave?.length) {
      product.collections = product.collections.filter((c) => !input.collectionsToLeave.includes(c.id));
    }
    if (this.store) {
      const meta = {};
      if (input.categoryId !== undefined) meta.category = input.categoryId;
      if (input.images !== undefined) meta.images = input.images;
      if (input.taxRate !== undefined) meta.taxRate = input.taxRate;
      if (input.isDigital !== undefined) meta.digital = input.isDigital;
      if (Object.keys(meta).length) this.store.setProductMeta(product.id, meta);
    }
    product.updatedAt = new Date(EPOCH).toISOString();
    return this.#productView(product);
  }

  async deleteProduct({ id }) {
    const index = this.data.products.findIndex((p) => p.id === id || numericId(p.id) === numericId(id));
    if (index === -1) throw notFound(`No product with id ${id}`);
    const [removed] = this.data.products.splice(index, 1);
    return { deletedProductId: removed.id };
  }

  async manageVariants(input) {
    const product = this.#findProduct(input.productId);
    if (!product) throw notFound(`No product with id ${input.productId}`);
    const action = input.action || 'update';

    if (action === 'create') {
      for (const variant of input.variants) {
        product.variants.push({
          id: variant.id || gid('ProductVariant', nextId('v', 2100)),
          title: variant.optionValues?.map((o) => o.name).join(' / ') || 'Default Title',
          price: variant.price || '0.00',
          compareAtPrice: variant.compareAtPrice || null,
          sku: variant.sku || '',
          barcode: variant.barcode || '',
          taxable: variant.taxable !== false,
          tracked: variant.tracked !== false,
          inventoryItemId: gid('InventoryItem', nextId('i', 3100)),
          selectedOptions: (variant.optionValues || []).map((o) => ({ name: o.optionName, value: o.name })),
          inventory: {},
        });
      }
    } else {
      for (const patch of input.variants) {
        const variant = product.variants.find((v) => v.id === patch.id);
        if (!variant) throw notFound(`No variant with id ${patch.id} on product ${product.id}`);
        for (const field of ['price', 'compareAtPrice', 'sku', 'barcode', 'taxable', 'tracked']) {
          if (patch[field] !== undefined) variant[field] = patch[field];
        }
        if (patch.optionValues) {
          variant.selectedOptions = patch.optionValues.map((o) => ({ name: o.optionName, value: o.name }));
          variant.title = patch.optionValues.map((o) => o.name).join(' / ');
        }
      }
    }
    product.updatedAt = new Date(EPOCH).toISOString();
    return { product: this.#productView(product) };
  }

  async deleteVariants({ productId, variantIds }) {
    const product = this.#findProduct(productId);
    if (!product) throw notFound(`No product with id ${productId}`);
    if (!variantIds?.length) throw invalidInput('No variant ids given.');
    const before = product.variants.length;
    product.variants = product.variants.filter((v) => !variantIds.includes(v.id));
    if (product.variants.length === before) {
      throw notFound('None of the given variants belong to this product.');
    }
    product.updatedAt = new Date(EPOCH).toISOString();
    return { product: this.#productView(product), deletedCount: before - product.variants.length };
  }

  async manageOptions(input) {
    const product = this.#findProduct(input.productId);
    if (!product) throw notFound(`No product with id ${input.productId}`);
    const action = input.action;

    if (action === 'create') {
      const options = input.options || [];
      if (!options.length) throw invalidInput('action "create" needs at least one option.');
      for (const option of options) {
        const values = option.values?.length ? option.values : [option.name];
        product.variants = buildVariants(product, option.name, values, this.currency, product.variants);
      }
    } else if (action === 'update') {
      const variant = product.variants[0];
      if (variant && input.name) {
        const previous = variant.selectedOptions[0]?.name;
        variant.selectedOptions = variant.selectedOptions.map((o) =>
          previous ? { name: input.name, value: o.value } : o,
        );
        variant.title = variant.selectedOptions.map((o) => o.value).join(' / ');
      }
    } else if (action === 'delete') {
      product.variants = product.variants.map((v) => ({
        ...v,
        selectedOptions: v.selectedOptions.slice(1),
        title: v.selectedOptions.slice(1).map((o) => o.value).join(' / ') || 'Default Title',
      }));
    }
    product.updatedAt = new Date(EPOCH).toISOString();
    return { product: this.#productView(product) };
  }

  // --------------------------------------------------------------- inventory

  async updateInventory(input) {
    const location = this.data.locations.find((l) => l.id === input.locationId);
    if (!location) throw notFound(`No location with id ${input.locationId}`);

    let variant = null;
    if (input.variantId) {
      for (const product of this.data.products) {
        const found = product.variants.find((v) => v.id === input.variantId);
        if (found) {
          variant = found;
          break;
        }
      }
    }
    if (!variant && input.inventoryItemId) {
      for (const product of this.data.products) {
        const found = product.variants.find((v) => v.inventoryItemId === input.inventoryItemId);
        if (found) {
          variant = found;
          break;
        }
      }
    }
    if (!variant) throw notFound('No variant or inventory item matched the given id.');

    const current = variant.inventory[location.id] ?? 0;
    const delta = input.delta !== undefined ? input.delta : input.quantity - current;
    const next = current + delta;
    if (next < 0) {
      throw conflict(`Stock would go negative (currently ${current} at ${location.name}).`);
    }
    variant.inventory[location.id] = next;

    return {
      changes: [
        {
          name: 'available',
          inventoryItemId: variant.inventoryItemId,
          locationId: location.id,
          delta,
          quantityBefore: current,
          quantityAfterChange: next,
        },
      ],
    };
  }

  // ------------------------------------------------------------------ orders

  async createOrder(input) {
    const requested = input.lineItems || [];
    const custom = input.lines || [];
    if (!requested.length && !custom.length) {
      throw invalidInput('An order needs at least one line item.');
    }

    const raw = [
      ...custom.map((line) => ({
        title: line.title || 'Línea',
        quantity: line.quantity ?? 1,
        unitPrice: Number(line.unitPrice ?? 0),
        variant: null,
      })),
      ...requested.map((item) => {
        const variant = this.#findVariant(item.variantId);
        if (!variant) throw notFound(`No variant with id ${item.variantId}`);
        const product = this.#productOfVariant(variant);
        const unit = Number(variant.price);
        if (!Number.isFinite(unit)) throw invalidInput(`Variant ${variant.id} has no usable price.`);
        return {
          title: product.title,
          quantity: item.quantity ?? 1,
          unitPrice: unit,
          variant: { id: variant.id, title: variant.title, sku: variant.sku },
        };
      }),
    ];

    // The discount is spread over the lines so the order adds up to the
    // total the customer was quoted.
    const lineItems = discountLines(raw, input.discount).map((line, index) => ({
      id: gid('LineItem', `8${100 + this.data.orders.length}${index}`),
      title: line.title,
      quantity: line.quantity,
      fulfilledQuantity: 0,
      totalPrice: money((Number(line.unitPrice) * line.quantity).toFixed(2), this.currency),
      variant: line.variant,
    }));

    const subtotal = lineItems.reduce((sum, line) => sum + Number(line.totalPrice.amount), 0);
    const settings = this.settings;
    const threshold = settings.freeShippingThreshold ?? 50;
    const shipping = subtotal >= threshold ? 0 : (settings.shippingFlatRate ?? 4.9);
    const tax = round2((subtotal * this.taxRate) / 100);
    const total = round2(subtotal + shipping + tax);

    const customer = input.customer?.email
      ? {
          id: gid('Customer', String(6100 + this.data.customers.length)),
          firstName: input.customer.firstName || '',
          lastName: input.customer.lastName || '',
          email: input.customer.email,
        }
      : null;

    const order = {
      id: gid('Order', String(7100 + this.data.orders.length)),
      name: `#${1000 + this.data.orders.length + 1}`,
      createdAt: new Date(EPOCH).toISOString(),
      displayFinancialStatus: input.financialStatus || 'PENDING',
      displayFulfillmentStatus: 'UNFULFILLED',
      totalPrice: money(total.toFixed(2), this.currency),
      subtotalPrice: money(subtotal.toFixed(2), this.currency),
      totalShippingPrice: money(shipping.toFixed(2), this.currency),
      totalTax: money(tax.toFixed(2), this.currency),      customer,
      shippingAddress: input.shippingAddress || null,
      lineItems,
      tags: input.tags || [],
      note: input.note || '',
      metafields: [],
    };

    this.data.orders.push(order);
    const downloads = this.#grantDownloads(order);
    const view = this.#orderView(order);
    if (downloads.length) view.downloads = downloads;
    return view;
  }

  /** Digital products: the buyer gets a link right away. */
  #grantDownloads(order) {
    if (!this.store || !this.filesDirectory) return [];
    const grants = [];
    for (const line of order.lineItems || []) {
      const product = this.data.products.find(
        (p) => p.title === line.title && p.variants.some((v) => v.id === line.variant?.id),
      );
      if (!product) continue;
      const meta = this.store.productMeta(product.id);
      if (!meta?.digital) continue;
      const files = this.store.listFiles(product.id);
      const file = files.find((f) => !line.variant?.id || !f.variantId || f.variantId === line.variant.id);
      if (!file) continue;
      const grant = grantDownload({
        store: this.store,
        file,
        orderId: order.id,
        email: order.customer?.email || '',
      });
      grants.push({ token: grant.token, filename: grant.filename, url: `/downloads/${grant.token}` });
    }
    return grants;
  }

  async searchOrders({ status = 'any', query, limit = 20, cursor } = {}) {
    let items = this.data.orders;
    if (status && status !== 'any') {
      items = items.filter((o) => orderStatus(o) === status);
    }
    if (query) {
      const term = String(query).toLowerCase();
      items = items.filter(
        (o) =>
          matches(o.name, term) ||
          matches(o.customer?.email, term) ||
          matches(o.customer?.firstName, term) ||
          matches(o.customer?.lastName, term) ||
          matches(o.note, term),
      );
    }
    const page = paginate(items, limit, cursor);
    return { orders: page.items.map((o) => this.#orderView(o)), pageInfo: page.pageInfo };
  }

  async getOrder({ id }) {
    const order = this.#findOrder(id);
    return order ? this.#orderView(order) : null;
  }

  async updateOrder(input) {
    const order = this.#findOrder(input.id);
    if (!order) throw notFound(`No order with id ${input.id}`);
    if (input.tags !== undefined) order.tags = input.tags;
    if (input.email !== undefined) order.email = input.email;
    if (input.note !== undefined) order.note = input.note;
    if (input.shippingAddress !== undefined) order.shippingAddress = input.shippingAddress;
    if (input.metafields) order.metafields = mergeMetafields(order.metafields, input.metafields);
    if (input.financialStatus !== undefined) order.displayFinancialStatus = input.financialStatus;
    return this.#orderView(order);
  }

  async fulfillOrder(input) {
    const order = this.#findOrder(input.orderId);
    if (!order) throw notFound(`No order with id ${input.orderId}`);

    const requested = new Map(
      (input.lineItems || []).map((item) => [item.lineItemId, item.quantity ?? 1]),
    );
    const shipped = [];

    for (const line of order.lineItems) {
      const remaining = line.quantity - line.fulfilledQuantity;
      if (remaining <= 0) continue;
      const wanted = requested.has(line.id) ? requested.get(line.id) : remaining;
      const quantity = Math.min(wanted, remaining);
      if (quantity <= 0) continue;
      line.fulfilledQuantity += quantity;
      shipped.push({ lineItemId: line.id, title: line.title, quantity });
    }

    if (!shipped.length) {
      throw conflict('Nothing left to fulfill on this order.');
    }
    order.displayFulfillmentStatus = order.lineItems.every((l) => l.fulfilledQuantity >= l.quantity)
      ? 'FULFILLED'
      : 'PARTIALLY_FULFILLED';

    return {
      fulfillment: {
        id: gid('Fulfillment', nextId('f', 9100)),
        status: 'SUCCESS',
        orderId: order.id,
        lineItems: shipped,
        trackingInfo: input.trackingInfo || null,
        notifyCustomer: input.notifyCustomer !== false,
        message: input.message || null,
      },
    };
  }

  // --------------------------------------------------------------- ofertas

  async createQuote(input) {
    if (!this.store) throw conflict('This backend does not support quotes.');
    const lines = input.lines || [];
    if (!lines.length) throw invalidInput('A quote needs at least one line.');

    const enriched = [];
    for (const line of lines) {
      if (line.variantId && line.unitPrice === undefined) {
        const variant = this.#findVariant(line.variantId);
        if (!variant) throw notFound(`No variant with id ${line.variantId}`);
        const product = this.#productOfVariant(variant);
        enriched.push({ ...line, title: line.title || product.title, unitPrice: variant.price });
      } else {
        enriched.push(line);
      }
    }

    const discount = input.discount || null;
    const totals = computeQuote({
      lines: enriched,
      discount,
      taxRate: this.taxRate,
      currency: this.settings.currency || this.currency,
    });

    const now = new Date().toISOString();
    const quote = this.store.createQuote({
      status: input.status || 'DRAFT',
      customer: input.customer || null,
      lines: totals.lines,
      discount,
      discountAmount: totals.discountAmount,
      subtotal: totals.subtotal,
      taxRate: this.taxRate,
      taxAmount: totals.taxAmount,
      total: totals.total,
      currency: totals.currency,
      validUntil: input.validUntil || null,
      note: input.note || '',
      tags: input.tags || [],
      orderId: null,
      createdAt: now,
      updatedAt: now,
    });
    return quoteView(quote);
  }

  async listQuotes({ status, customerEmail, limit = 20, cursor } = {}) {
    if (!this.store) throw conflict('This backend does not support quotes.');
    let items = this.store.listQuotes();
    if (status) items = items.filter((q) => q.status === status);
    if (customerEmail) {
      const term = String(customerEmail).toLowerCase();
      items = items.filter((q) => (q.customer?.email || '').toLowerCase().includes(term));
    }
    const page = paginate(items, limit, cursor);
    return { quotes: page.items.map(quoteView), pageInfo: page.pageInfo };
  }

  async getQuote({ id }) {
    if (!this.store) throw conflict('This backend does not support quotes.');
    const quote = this.store.findQuote(id);
    return quote ? quoteView(quote) : null;
  }

  async updateQuote(input) {
    if (!this.store) throw conflict('This backend does not support quotes.');
    const quote = this.store.findQuote(input.id);
    if (!quote) throw notFound(`No quote with id ${input.id}`);
    if (quote.status === 'ACCEPTED') {
      throw conflict('This quote was already accepted and cannot be changed.');
    }

    const patch = {};
    for (const field of ['status', 'customer', 'validUntil', 'note', 'tags']) {
      if (input[field] !== undefined) patch[field] = input[field];
    }
    if (input.discount !== undefined) patch.discount = input.discount;

    if (input.lines !== undefined || input.discount !== undefined) {
      const lines = input.lines || quote.lines;
      const totals = computeQuote({
        lines,
        discount: input.discount !== undefined ? input.discount : quote.discount,
        taxRate: quote.taxRate ?? this.taxRate,
        currency: quote.currency || this.settings.currency || this.currency,
      });
      patch.lines = totals.lines;
      patch.discountAmount = totals.discountAmount;
      patch.subtotal = totals.subtotal;
      patch.taxAmount = totals.taxAmount;
      patch.total = totals.total;
    }

    patch.updatedAt = new Date().toISOString();
    return quoteView(this.store.updateQuote(input.id, patch));
  }

  async acceptQuote(input) {
    if (!this.store) throw conflict('This backend does not support quotes.');
    const quote = this.store.findQuote(input.id);
    if (!quote) throw notFound(`No quote with id ${input.id}`);
    if (quote.status === 'ACCEPTED') throw conflict('This quote was already accepted.');
    if (quote.status === 'DECLINED') throw conflict('A declined quote cannot be accepted.');

    const order = await this.createOrder({
      lineItems: quote.lines.filter((line) => line.variantId),
      lines: quote.lines.filter((line) => !line.variantId),
      discount: quote.discount,
      customer: quote.customer,
      shippingAddress: input.shippingAddress,
      note: quote.note || 'Pedido desde una oferta aceptada.',
      tags: [...(quote.tags || []), `oferta:${quote.number}`],
      financialStatus: 'PENDING',
    });

    const updated = this.store.updateQuote(quote.id, {
      status: 'ACCEPTED',
      orderId: order.id,
      updatedAt: new Date().toISOString(),
    });
    return { quote: quoteView(updated), order };
  }

  async declineQuote(input) {
    if (!this.store) throw conflict('This backend does not support quotes.');
    const quote = this.store.findQuote(input.id);
    if (!quote) throw notFound(`No quote with id ${input.id}`);
    if (quote.status === 'ACCEPTED') throw conflict('An accepted quote cannot be declined.');
    const updated = this.store.updateQuote(quote.id, {
      status: 'DECLINED',
      note: input.reason ? `${quote.note || ''}\n${input.reason}`.trim() : quote.note,
      updatedAt: new Date().toISOString(),
    });
    return { quote: quoteView(updated) };
  }

  // --------------------------------------------------------------- customers

  async searchCustomers({ query, limit = 20, cursor } = {}) {
    let items = this.data.customers;
    if (query) {
      const term = String(query).toLowerCase();
      items = items.filter(
        (c) =>
          matches(c.email, term) ||
          matches(c.firstName, term) ||
          matches(c.lastName, term) ||
          c.tags.some((t) => matches(t, term)),
      );
    }
    const page = paginate(items, limit, cursor);
    return { customers: page.items.map((c) => this.#customerView(c)), pageInfo: page.pageInfo };
  }

  async getCustomer({ id }) {
    const customer = this.#findCustomer(id);
    return customer ? this.#customerView(customer) : null;
  }

  async updateCustomer(input) {
    const customer = this.#findCustomer(input.id);
    if (!customer) throw notFound(`No customer with id ${input.id}`);
    for (const field of ['firstName', 'lastName', 'email', 'phone', 'note', 'taxExempt']) {
      if (input[field] !== undefined) customer[field] = input[field];
    }
    if (input.tags !== undefined) customer.tags = input.tags;
    if (input.metafields) customer.metafields = mergeMetafields(customer.metafields, input.metafields);
    return this.#customerView(customer);
  }

  // ----------------------------------------------------------------- helpers

  #findProduct(id) {
    return this.#allProducts().find(
      (p) => p.id === id || numericId(p.id) === numericId(id),
    );
  }

  #findOrder(id) {
    return this.data.orders.find((o) => o.id === id || numericId(o.id) === numericId(id));
  }

  #findCustomer(id) {
    return this.data.customers.find((c) => c.id === id || numericId(c.id) === numericId(id));
  }

  #findVariant(variantId) {
    for (const product of this.data.products) {
      const variant = product.variants.find((v) => v.id === variantId);
      if (variant) return variant;
    }
    return null;
  }

  #productOfVariant(variant) {
    return this.data.products.find((p) => p.variants.includes(variant)) || { title: variant.title };
  }

  #productView(product) {
    const variants = product.variants.map((v) => ({
      id: v.id,
      title: v.title,
      price: v.price,
      compareAtPrice: v.compareAtPrice,
      sku: v.sku,
      barcode: v.barcode,
      taxable: v.taxable,
      tracked: v.tracked,
      inventoryItemId: v.inventoryItemId,
      selectedOptions: v.selectedOptions,
      inventoryQuantity: Object.values(v.inventory).reduce((sum, n) => sum + n, 0),
      inventoryByLocation: { ...v.inventory },
    }));
    const prices = variants.map((v) => Number(v.price)).filter((n) => Number.isFinite(n));
    const category = this.store ? this.store.categoryFor(product) : null;
    const images = this.store ? this.store.imagesFor(product) : product.imageUrl ? [{ url: product.imageUrl, alt: product.title }] : [];
    const taxRate = this.store ? this.store.taxRateFor(product, this.taxRate) : this.taxRate;
    const meta = this.store ? this.store.productMeta(product.id) : null;
    const digitalFiles = this.store ? this.store.listFiles(product.id) : [];
    return {
      id: product.id,
      title: product.title,
      descriptionHtml: product.descriptionHtml,
      handle: product.handle,
      status: product.status,
      vendor: product.vendor,
      productType: product.productType,
      category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
      tags: product.tags,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt,
      imageUrl: product.imageUrl,
      images,
      seo: product.seo || null,
      variants,
      collections: product.collections,
      metafields: product.metafields,
      priceRange: {
        minPrice: money(prices.length ? Math.min(...prices).toFixed(2) : '0.00', this.currency),
        maxPrice: money(prices.length ? Math.max(...prices).toFixed(2) : '0.00', this.currency),
      },
      totalInventory: variants.reduce((sum, v) => sum + v.inventoryQuantity, 0),
      taxRate,
      digital: Boolean(meta?.digital),
      digitalFiles: digitalFiles.map((file) => ({ id: file.id, filename: file.filename, bytes: file.bytes })),
    };
  }

  #orderView(order) {
    return {
      id: order.id,
      name: order.name,
      createdAt: order.createdAt,
      displayFinancialStatus: order.displayFinancialStatus,
      displayFulfillmentStatus: order.displayFulfillmentStatus,
      totalPrice: order.totalPrice,
      subtotalPrice: order.subtotalPrice,
      totalShippingPrice: order.totalShippingPrice,
      totalTax: order.totalTax,
      customer: order.customer,
      shippingAddress: order.shippingAddress,
      lineItems: order.lineItems.map((line) => ({
        id: line.id,
        title: line.title,
        quantity: line.quantity,
        fulfilledQuantity: line.fulfilledQuantity,
        totalPrice: line.totalPrice,
        variant: line.variant,
      })),
      tags: order.tags,
      note: order.note,
      metafields: order.metafields,
    };
  }

  #customerView(customer) {
    return {
      id: customer.id,
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      createdAt: customer.createdAt,
      tags: customer.tags,
      note: customer.note,
      taxExempt: customer.taxExempt,
      numberOfOrders: customer.numberOfOrders,
      amountSpent: customer.amountSpent,
      addresses: customer.addresses,
      metafields: customer.metafields,
    };
  }
}

function fileView(file) {
  return {
    id: file.id,
    productId: file.productId,
    variantId: file.variantId,
    filename: file.filename,
    mimeType: file.mimeType,
    bytes: file.bytes,
    sha256: file.sha256,
    downloads: file.downloads || 0,
    createdAt: file.createdAt,
  };
}

function orderStatus(order) {
  if (order.displayFulfillmentStatus === 'CANCELLED') return 'cancelled';
  return order.displayFulfillmentStatus === 'FULFILLED' ? 'closed' : 'open';
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildVariants(product, optionName, values, currency, existing = []) {
  const variants = values.map((value) => ({
    id: gid('ProductVariant', nextId('v', 2100)),
    title: value,
    price: '0.00',
    compareAtPrice: null,
    sku: '',
    barcode: '',
    taxable: true,
    tracked: true,
    inventoryItemId: gid('InventoryItem', nextId('i', 3100)),
    selectedOptions: [{ name: optionName, value }],
    inventory: {},
  }));
  return existing.length ? [...existing, ...variants] : variants;
}

function mergeMetafields(current, incoming) {
  const out = [...current];
  for (const field of incoming) {
    const index = field.id
      ? out.findIndex((m) => m.id === field.id)
      : out.findIndex((m) => m.key === field.key && m.namespace === (field.namespace || 'custom'));
    const value = {
      id: field.id || gid('Metafield', nextId('m', 7000)),
      namespace: field.namespace || 'custom',
      key: field.key || '',
      value: field.value,
      type: field.type || 'single_line_text_field',
    };
    if (index === -1) out.push(value);
    else out[index] = { ...out[index], ...value };
  }
  return out;
}
