/**
 * Live Shopify backend.
 *
 * Talks to the Admin GraphQL API with `fetch`. Two authentication modes:
 *
 *  - static token   : `SHOPIFY_ACCESS_TOKEN` (shpat_...), legacy custom apps.
 *  - client creds   : `SHOPIFY_CLIENT_ID` + `SHOPIFY_CLIENT_SECRET`, exchanged
 *                      for a short lived token and refreshed automatically.
 *                      Shopify stopped issuing static tokens in the UI in
 *                      January 2026, so this is the default way forward.
 *
 * Every method returns the same shapes as the mock backend, so the tools
 * never learn which one they are talking to.
 */

import { AppError, ErrorCode, invalidInput, notFound, upstream, forbidden, conflict } from '../errors.js';
import { vatRate } from '../tax.js';
import { computeQuote, quoteView, discountLines } from '../quotes.js';

const REFRESH_MARGIN_MS = 5 * 60 * 1000;

const PRODUCT_FIELDS = `
fragment ProductFields on Product {
  id
  title
  descriptionHtml
  handle
  status
  vendor
  productType
  tags
  createdAt
  updatedAt
  totalInventory
  seo { title description }
  priceRangeV2 {
    minVariantPrice { amount currencyCode }
    maxVariantPrice { amount currencyCode }
  }
  images(first: 3) { nodes { id url altText width height } }
  variants(first: 50) {
    nodes {
      id
      title
      price
      compareAtPrice
      sku
      barcode
      taxable
      inventoryQuantity
      inventoryPolicy
      selectedOptions { name value }
      inventoryItem { id tracked }
    }
  }
  collections(first: 10) { nodes { id title } }
  metafields(first: 20) { nodes { id namespace key value type } }
}`;

const ORDER_FIELDS = `
fragment OrderFields on Order {
  id
  name
  createdAt
  email
  displayFinancialStatus
  displayFulfillmentStatus
  totalPriceSet { shopMoney { amount currencyCode } }
  subtotalPriceSet { shopMoney { amount currencyCode } }
  totalShippingPriceSet { shopMoney { amount currencyCode } }
  totalTaxSet { shopMoney { amount currencyCode } }
  customer { id firstName lastName email phone }
  shippingAddress { address1 address2 city provinceCode country zip phone company }
  lineItems(first: 50) {
    nodes {
      id
      title
      quantity
      currentQuantity
      originalTotalSet { shopMoney { amount currencyCode } }
      variant { id title sku }
    }
  }
  tags
  note
  metafields(first: 20) { nodes { id namespace key value type } }
}`;

const CUSTOMER_FIELDS = `
fragment CustomerFields on Customer {
  id
  firstName
  lastName
  email
  phone
  createdAt
  updatedAt
  tags
  note
  taxExempt
  numberOfOrders
  amountSpent { amount currencyCode }
  defaultAddress { address1 address2 city provinceCode country zip phone }
  addresses { address1 address2 city provinceCode country zip phone }
  metafields(first: 20) { nodes { id namespace key value type } }
}`;

export class ShopifyBackend {
  /**
   * @param {object} config
   * @param {string} config.domain
   * @param {string} config.apiVersion
   * @param {string} [config.accessToken]
   * @param {string} [config.clientId]
   * @param {string} [config.clientSecret]
   * @param {object} [config.store] the shop's own store (categories, settings)
   */
  constructor(config) {
    this.mode = 'shopify';
    this.domain = config.domain;
    this.apiVersion = config.apiVersion;
    this.staticToken = config.accessToken || null;
    this.clientId = config.clientId || null;
    this.clientSecret = config.clientSecret || null;
    this.store = config.store || null;
    this.token = this.staticToken;
    this.expiresAt = 0;
    this.refreshTimer = null;
    this.endpoint = `https://${this.domain}/admin/api/${this.apiVersion}/graphql.json`;
  }

  get settings() {
    return (
      this.store?.settings || {
        currency: 'EUR',
        taxCountry: 'ES',
        pricesIncludeTax: true,
        freeShippingThreshold: 50,
        shippingFlatRate: 4.9,
        shopName: 'AURORA',
        defaultLocale: 'en',
      }
    );
  }

  get taxRate() {
    return vatRate(this.settings.taxCountry);
  }

  // ----------------------------------------------------------- categorías
  // Las categorías son nuestra taxonomía, no colecciones de Shopify: viven en
  // el store local y se enganchan a cada producto con un metafield.

  async listCategories() {
    return this.store ? this.store.listCategories() : [];
  }

  async createCategory(input) {
    if (!this.store) throw conflict('No local store configured for categories.');
    return this.store.createCategory(input);
  }

  async updateCategory(input) {
    if (!this.store) throw conflict('No local store configured for categories.');
    const updated = this.store.updateCategory(input.id, input);
    if (!updated) throw notFound(`No category with id ${input.id}`);
    return updated;
  }

  async deleteCategory(input) {
    if (!this.store) throw conflict('No local store configured for categories.');
    const removed = this.store.deleteCategory(input.id);
    if (!removed) throw notFound(`No category with id ${input.id}`);
    return { deletedCategoryId: removed.id };
  }

  async assignCategory(input) {
    const product = await this.getProduct({ id: input.productId });
    if (!product) throw notFound(`No product with id ${input.productId}`);
    if (input.categoryId && !this.store?.findCategory(input.categoryId)) {
      throw notFound(`No category with id ${input.categoryId}`);
    }
    await this.#setMetafields(input.productId, [
      { namespace: 'custom', key: 'category', type: 'single_line_text_field', value: input.categoryId || '' },
    ]);
    const refreshed = await this.getProduct({ id: input.productId });
    return { product: refreshed || product };
  }

  async setProductImages(input) {
    const product = await this.getProduct({ id: input.productId });
    if (!product) throw notFound(`No product with id ${input.productId}`);
    const images = (input.images || []).filter((image) => image && image.url);
    await this.#setMetafields(input.productId, [
      {
        namespace: 'custom',
        key: 'images',
        type: 'json',
        value: JSON.stringify(images),
      },
    ]);
    const refreshed = await this.getProduct({ id: input.productId });
    return { product: refreshed || product };
  }

  async updateSettings(input) {
    if (!this.store) throw conflict('No local store configured for settings.');
    return this.store.updateSettings(input);
  }

  async shopStats() {
    const data = await this.graphql(
      `
      query ShopStats {
        orders(first: 100, sortKey: CREATED_AT, reverse: true) {
          nodes {
            id
            createdAt
            displayFinancialStatus
            totalPriceSet { shopMoney { amount currencyCode } }
          }
        }
        productsCount { count }
        customersCount { count }
      }
    `,
    );
    const orders = data.orders?.nodes || [];
    const paid = orders.filter(
      (o) => o.displayFinancialStatus === 'PAID' || o.displayFinancialStatus === 'PARTIALLY_PAID',
    );
    const revenue = paid.reduce((sum, o) => sum + Number(o.totalPriceSet?.shopMoney?.amount || 0), 0);
    const settings = this.settings;
    return {
      revenue: {
        amount: revenue.toFixed(2),
        currencyCode: paid[0]?.totalPriceSet?.shopMoney?.currencyCode || settings.currency,
      },
      orderCount: orders.length,
      paidOrderCount: paid.length,
      productCount: data.productsCount?.count ?? 0,
      customerCount: data.customersCount?.count ?? 0,
      categoryCount: this.store ? this.store.listCategories().length : 0,
      lowStock: [],
      taxCountry: settings.taxCountry,
      vatRate: this.taxRate,
      currency: settings.currency,
    };
  }

  // ------------------------------------------------------------------- auth

  async accessToken() {
    if (this.staticToken) return this.staticToken;
    if (!this.token || Date.now() > this.expiresAt - REFRESH_MARGIN_MS) {
      await this.#fetchToken();
    }
    return this.token;
  }

  async #fetchToken() {
    const url = `https://${this.domain}/admin/oauth/access_token`;
    const body = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      });
    } catch (err) {
      throw upstream(`Could not reach Shopify to exchange credentials: ${err.message}`);
    }
    const text = await res.text();
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw forbidden(`Shopify rejected the client credentials (${res.status}).`);
      }
      throw upstream(`Shopify token exchange failed (${res.status}): ${text.slice(0, 400)}`);
    }
    const data = JSON.parse(text);
    this.token = data.access_token;
    this.expiresAt = Date.now() + Number(data.expires_in || 86400) * 1000;
    this.#scheduleRefresh();
    return this.token;
  }

  #scheduleRefresh() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const delay = Math.max(this.expiresAt - Date.now() - REFRESH_MARGIN_MS, 0);
    this.refreshTimer = setTimeout(async () => {
      try {
        await this.#fetchToken();
      } catch {
        this.#scheduleRefresh();
      }
    }, delay);
    if (typeof this.refreshTimer.unref === 'function') this.refreshTimer.unref();
  }

  destroy() {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    this.refreshTimer = null;
  }

  // --------------------------------------------------------------- graphql

  /**
   * Execute a GraphQL document.
   * @param {string} query
   * @param {object} [variables]
   */
  async graphql(query, variables = {}) {
    const token = await this.accessToken();
    let res;
    try {
      res = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': token,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (err) {
      throw upstream(`Could not reach Shopify: ${err.message}`);
    }

    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw upstream(`Shopify returned a non JSON response (${res.status}).`);
    }

    if (!res.ok) {
      if (res.status === 401 || res.status === 403) {
        throw forbidden(`Shopify refused the credentials (${res.status}). ${payload.errors?.[0]?.message || ''}`.trim());
      }
      if (res.status === 429) {
        throw new AppError(ErrorCode.CONFLICT, 'Shopify rate limited the request. Retry in a moment.');
      }
      throw upstream(`Shopify error ${res.status}: ${payload.errors?.[0]?.message || text.slice(0, 400)}`);
    }

    if (payload.errors?.length) {
      const first = payload.errors[0];
      const message = first?.message || 'Unknown GraphQL error';
      throw new AppError(ErrorCode.UPSTREAM, `Shopify rejected the request: ${message}`, {
        graphqlErrors: payload.errors.map((e) => e.message),
      });
    }

    return payload.data;
  }

  /**
   * Execute a mutation and turn `userErrors` into a thrown AppError.
   * @param {string} query
   * @param {object} variables
   * @param {string} payloadKey key of the mutation payload in the response
   */
  async mutate(query, variables, payloadKey) {
    const data = await this.graphql(query, variables);
    const payload = data[payloadKey];
    if (!payload) throw upstream(`Shopify returned no payload for ${payloadKey}.`);
    if (payload.userErrors?.length) {
      const first = payload.userErrors[0];
      throw new AppError(
        ErrorCode.INVALID_INPUT,
        `Shopify rejected the change: ${first.message}`,
        { userErrors: payload.userErrors },
      );
    }
    return payload;
  }

  // ------------------------------------------------------------------ store

  async storeInfo() {
    const data = await this.graphql(`
      query StoreInfo {
        shop {
          name
          myshopifyDomain
          currencyCode
          primaryDomain { url }
        }
        locations(first: 1) { nodes { id } }
      }
    `);
    const shop = data.shop || {};
    return {
      mode: this.mode,
      shop: shop.name,
      domain: shop.myshopifyDomain || this.domain,
      primaryDomain: shop.primaryDomain?.url || null,
      apiVersion: this.apiVersion,
      currency: shop.currencyCode || null,
      live: true,
    };
  }

  async listLocations({ limit = 20 } = {}) {
    const data = await this.graphql(
      `
      query Locations($first: Int!) {
        locations(first: $first, query: "active:true") {
          nodes {
            id
            name
            address { address1 city provinceCode countryCode zip }
          }
        }
      }
    `,
      { first: limit },
    );
    return (data.locations?.nodes || []).map((location) => ({
      id: location.id,
      name: location.name,
      address: location.address,
    }));
  }

  // --------------------------------------------------------------- products

  async searchProducts({ query, status, limit = 20, cursor } = {}) {
    const search = [query, status ? `status:${status.toLowerCase()}` : null]
      .filter(Boolean)
      .join(' ');
    const data = await this.graphql(
      `
      query SearchProducts($first: Int!, $after: String, $query: String) {
        products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
          nodes { ...ProductFields }
          pageInfo { hasNextPage endCursor }
        }
      }
      ${PRODUCT_FIELDS}
    `,
      { first: limit, after: cursor || null, query: search || null },
    );
    const connection = data.products || {};
    return {
      products: (connection.nodes || []).map(productView),
      pageInfo: {
        hasNextPage: Boolean(connection.pageInfo?.hasNextPage),
        endCursor: connection.pageInfo?.endCursor || null,
      },
    };
  }

  async getProduct({ id }) {
    const data = await this.graphql(
      `
      query GetProduct($id: ID!) {
        product(id: $id) { ...ProductFields }
      }
      ${PRODUCT_FIELDS}
    `,
      { id },
    );
    return data.product ? productView(data.product) : null;
  }

  async createProduct(input) {
    const product = {
      title: input.title,
      status: input.status || 'DRAFT',
    };
    if (input.descriptionHtml !== undefined) product.descriptionHtml = input.descriptionHtml;
    if (input.handle !== undefined) product.handle = input.handle;
    if (input.vendor !== undefined) product.vendor = input.vendor;
    if (input.productType !== undefined) product.productType = input.productType;
    if (input.tags !== undefined) product.tags = input.tags;
    if (input.seo !== undefined) product.seo = input.seo;
    if (input.collectionsToJoin?.length) product.collectionsToJoin = input.collectionsToJoin;
    if (input.productOptions?.length) {
      product.productOptions = input.productOptions.map((option) => ({
        name: option.name,
        ...(option.position !== undefined ? { position: option.position } : {}),
        ...(option.values?.length ? { values: option.values.map((v) => ({ name: v.name })) } : {}),
      }));
    }

    const payload = await this.mutate(
      `
      mutation ProductCreate($product: ProductCreateInput!) {
        productCreate(product: $product) {
          product { ...ProductFields }
          userErrors { field message }
        }
      }
      ${PRODUCT_FIELDS}
    `,
      { product },
      'productCreate',
    );
    const created = productView(payload.product);
    if (input.metafields?.length) {
      await this.#setMetafields(created.id, input.metafields);
      const refreshed = await this.getProduct({ id: created.id });
      return refreshed || created;
    }
    return created;
  }

  async updateProduct(input) {
    const product = { id: input.id };
    for (const field of ['title', 'descriptionHtml', 'handle', 'vendor', 'productType', 'status', 'tags', 'seo']) {
      if (input[field] !== undefined) product[field] = input[field];
    }
    if (input.collectionsToJoin?.length) product.collectionsToJoin = input.collectionsToJoin;
    if (input.collectionsToLeave?.length) product.collectionsToLeave = input.collectionsToLeave;
    if (input.redirectNewHandle !== undefined) product.redirectNewHandle = input.redirectNewHandle;

    const payload = await this.mutate(
      `
      mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { ...ProductFields }
          userErrors { field message }
        }
      }
      ${PRODUCT_FIELDS}
    `,
      { product },
      'productUpdate',
    );
    const updated = productView(payload.product);
    if (input.metafields?.length) {
      await this.#setMetafields(updated.id, input.metafields);
      const refreshed = await this.getProduct({ id: updated.id });
      return refreshed || updated;
    }
    return updated;
  }

  async deleteProduct({ id }) {
    const payload = await this.mutate(
      `
      mutation ProductDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }
    `,
      { input: { id } },
      'productDelete',
    );
    return { deletedProductId: payload.deletedProductId };
  }

  async manageVariants(input) {
    const action = input.action || 'update';
    if (action === 'create') {
      const variants = input.variants.map((variant) => {
        const out = {};
        if (variant.price !== undefined) out.price = moneyValue(variant.price);
        if (variant.compareAtPrice !== undefined) out.compareAtPrice = moneyValue(variant.compareAtPrice);
        if (variant.sku !== undefined) out.sku = variant.sku;
        if (variant.barcode !== undefined) out.barcode = variant.barcode;
        if (variant.taxable !== undefined) out.taxable = variant.taxable;
        if (variant.optionValues?.length) {
          out.optionValues = variant.optionValues.map((o) => ({ optionName: o.optionName, name: o.name }));
        }
        return out;
      });
      const payload = await this.mutate(
        `
        mutation ProductVariantsBulkCreate($productId: ID!, $strategy: ProductVariantsBulkCreateStrategy, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkCreate(productId: $productId, strategy: $strategy, variants: $variants) {
            product { ...ProductFields }
            userErrors { field message }
          }
        }
        ${PRODUCT_FIELDS}
      `,
        {
          productId: input.productId,
          strategy: input.strategy || 'DEFAULT',
          variants,
        },
        'productVariantsBulkCreate',
      );
      return { product: productView(payload.product) };
    }

    const variants = input.variants.map((variant) => {
      const out = { id: variant.id };
      if (variant.price !== undefined) out.price = moneyValue(variant.price);
      if (variant.compareAtPrice !== undefined) out.compareAtPrice = moneyValue(variant.compareAtPrice);
      if (variant.sku !== undefined) out.sku = variant.sku;
      if (variant.barcode !== undefined) out.barcode = variant.barcode;
      if (variant.taxable !== undefined) out.taxable = variant.taxable;
      if (variant.optionValues?.length) {
        out.optionValues = variant.optionValues.map((o) => ({ optionName: o.optionName, name: o.name }));
      }
      return out;
    });
    const payload = await this.mutate(
      `
      mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          product { ...ProductFields }
          userErrors { field message }
        }
      }
      ${PRODUCT_FIELDS}
    `,
      { productId: input.productId, variants },
      'productVariantsBulkUpdate',
    );
    return { product: productView(payload.product) };
  }

  async deleteVariants({ productId, variantIds }) {
    if (!variantIds?.length) throw invalidInput('No variant ids given.');
    const payload = await this.mutate(
      `
      mutation ProductVariantsBulkDelete($productId: ID!, $variantsIds: [ID!]!) {
        productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) {
          product { ...ProductFields }
          userErrors { field message }
        }
      }
      ${PRODUCT_FIELDS}
    `,
      { productId, variantsIds: variantIds },
      'productVariantsBulkDelete',
    );
    return { product: productView(payload.product), deletedCount: variantIds.length };
  }

  async manageOptions(input) {
    const action = input.action;

    if (action === 'create') {
      const options = (input.options || []).map((option) => ({
        name: option.name,
        ...(option.position !== undefined ? { position: option.position } : {}),
        ...(option.values?.length ? { values: option.values.map((v) => ({ name: v })) } : {}),
      }));
      if (!options.length) throw invalidInput('action "create" needs at least one option.');
      const payload = await this.mutate(
        `
        mutation ProductOptionsCreate($productId: ID!, $options: [OptionCreateInput!]!, $variantStrategy: ProductOptionCreateVariantStrategy) {
          productOptionsCreate(productId: $productId, options: $options, variantStrategy: $variantStrategy) {
            product { ...ProductFields }
            userErrors { field message }
          }
        }
        ${PRODUCT_FIELDS}
      `,
        { productId: input.productId, options, variantStrategy: 'LEAVE_AS_IS' },
        'productOptionsCreate',
      );
      return { product: productView(payload.product) };
    }

    if (action === 'update') {
      const option = {};
      if (input.optionId) option.id = input.optionId;
      if (input.name !== undefined) option.name = input.name;
      if (input.position !== undefined) option.position = input.position;
      const payload = await this.mutate(
        `
        mutation ProductOptionUpdate($productId: ID!, $option: OptionUpdateInput!, $optionValuesToAdd: [OptionValueCreateInput!], $optionValuesToDelete: [ID!], $variantStrategy: ProductOptionUpdateVariantStrategy) {
          productOptionUpdate(productId: $productId, option: $option, optionValuesToAdd: $optionValuesToAdd, optionValuesToDelete: $optionValuesToDelete, variantStrategy: $variantStrategy) {
            product { ...ProductFields }
            userErrors { field message }
          }
        }
        ${PRODUCT_FIELDS}
      `,
        {
          productId: input.productId,
          option,
          optionValuesToAdd: input.valuesToAdd?.length
            ? input.valuesToAdd.map((name) => ({ name }))
            : null,
          optionValuesToDelete: input.valuesToDelete?.length ? input.valuesToDelete : null,
          variantStrategy: input.valuesToAdd?.length || input.valuesToDelete?.length ? 'MANAGE' : 'LEAVE_AS_IS',
        },
        'productOptionUpdate',
      );
      return { product: productView(payload.product) };
    }

    const options = input.optionIds || [];
    if (!options.length) throw invalidInput('action "delete" needs optionIds.');
    const payload = await this.mutate(
      `
      mutation ProductOptionsDelete($productId: ID!, $options: [ID!]!, $strategy: ProductOptionDeleteStrategy) {
        productOptionsDelete(productId: $productId, options: $options, strategy: $strategy) {
          deletedOptionsIds
          product { ...ProductFields }
          userErrors { field message }
        }
      }
      ${PRODUCT_FIELDS}
    `,
      { productId: input.productId, options, strategy: 'DEFAULT' },
      'productOptionsDelete',
    );
    return {
      product: productView(payload.product),
      deletedOptionsIds: payload.deletedOptionsIds || [],
    };
  }

  // -------------------------------------------------------------- inventory

  async updateInventory(input) {
    const inventoryItemId = input.inventoryItemId || (await this.#inventoryItemId(input.variantId));
    if (!inventoryItemId) throw notFound('No variant or inventory item matched the given id.');

    const current = await this.#availableQuantity(inventoryItemId, input.locationId);
    const delta = input.delta !== undefined ? input.delta : input.quantity - current;

    const change = {
      delta,
      inventoryItemId,
      locationId: input.locationId,
    };
    if (this.versionAtLeast('2026-01')) change.changeFromQuantity = current;

    const input_ = {
      reason: input.reason || 'correction',
      name: 'available',
      changes: [change],
    };

    const supportsIdempotency = this.versionAtLeast('2026-01');
    const query = supportsIdempotency
      ? `
      mutation InventoryAdjust($input: InventoryAdjustQuantitiesInput!, $idempotencyKey: String!) @idempotent(key: $idempotencyKey) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            createdAt
            reason
            changes { name delta quantityAfterChange }
          }
          userErrors { field message code }
        }
      }
    `
      : `
      mutation InventoryAdjust($input: InventoryAdjustQuantitiesInput!) {
        inventoryAdjustQuantities(input: $input) {
          inventoryAdjustmentGroup {
            createdAt
            reason
            changes { name delta quantityAfterChange }
          }
          userErrors { field message code }
        }
      }
    `;

    const variables = supportsIdempotency
      ? { input: input_, idempotencyKey: crypto.randomUUID() }
      : { input: input_ };

    const payload = await this.mutate(query, variables, 'inventoryAdjustQuantities');
    const group = payload.inventoryAdjustmentGroup || {};
    return {
      changes: (group.changes || []).map((change_) => ({
        name: change_.name,
        delta: change_.delta,
        quantityAfterChange: change_.quantityAfterChange,
        inventoryItemId,
        locationId: input.locationId,
        quantityBefore: current,
      })),
    };
  }

  async #inventoryItemId(variantId) {
    if (!variantId) return null;
    const data = await this.graphql(
      `
      query VariantInventoryItem($id: ID!) {
        productVariant(id: $id) {
          id
          inventoryItem { id }
        }
      }
    `,
      { id: variantId },
    );
    return data.productVariant?.inventoryItem?.id || null;
  }

  async #availableQuantity(inventoryItemId, locationId) {
    const data = await this.graphql(
      `
      query InventoryLevels($id: ID!) {
        inventoryItem(id: $id) {
          inventoryLevels(first: 50) {
            nodes {
              location { id }
              quantities(names: ["available"]) { name quantity }
            }
          }
        }
      }
    `,
      { id: inventoryItemId },
    );
    const levels = data.inventoryItem?.inventoryLevels?.nodes || [];
    const level = levels.find((l) => l.location?.id === locationId);
    if (!level) return 0;
    const available = (level.quantities || []).find((q) => q.name === 'available');
    return available?.quantity ?? 0;
  }

  // ----------------------------------------------------------------- orders

  async createOrder(input) {
    const lineItems = (input.lineItems || []).map((line) => ({
      variantId: line.variantId,
      quantity: line.quantity ?? 1,
    }));
    // Free lines, for services that have no variant in the catalogue.
    for (const line of input.lines || []) {
      lineItems.push({
        title: line.title,
        price: Number(line.unitPrice ?? 0),
        quantity: line.quantity ?? 1,
      });
    }
    if (!lineItems.length) throw invalidInput('An order needs at least one line item.');

    // A discount means the lines no longer match the catalogue price, so the
    // order is created with explicit prices instead of variant ids.
    if (input.discount && input.discount.value) {
      const resolved = [];
      for (const line of lineItems) {
        if (line.variantId) {
          const variant = await this.#variantPrice(line.variantId);
          if (!variant) throw notFound(`No variant with id ${line.variantId}`);
          resolved.push({
            title: variant.title,
            price: variant.price,
            quantity: line.quantity,
          });
        } else {
          resolved.push(line);
        }
      }
      lineItems.length = 0;
      for (const line of discountLines(resolved, input.discount)) {
        lineItems.push({ title: line.title, price: Number(line.unitPrice), quantity: line.quantity });
      }
    }

    const draft = {
      lineItems,
      ...(input.customer?.email ? { customer: input.customer } : {}),
      ...(input.shippingAddress ? { shippingAddress: input.shippingAddress } : {}),
      ...(input.note ? { note: input.note } : {}),
      ...(input.tags?.length ? { tags: input.tags } : {}),
      ...(input.financialStatus && input.financialStatus !== 'PENDING'
        ? { paymentTerms: { paymentPending: true } }
        : {}),
    };

    const created = await this.mutate(
      `
      mutation DraftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder { id }
          userErrors { field message }
        }
      }
    `,
      { input: draft },
      'draftOrderCreate',
    );

    const draftId = created.draftOrder?.id;
    if (!draftId) throw upstream('Shopify did not return the draft order id.');

    const completed = await this.mutate(
      `
      mutation DraftOrderComplete($id: ID!, $paymentPending: Boolean!) {
        draftOrderComplete(id: $id, paymentPending: $paymentPending) {
          order { ...OrderFields }
          userErrors { field message }
        }
      }
      ${ORDER_FIELDS}
    `,
      { id: draftId, paymentPending: true },
      'draftOrderComplete',
    );

    return orderView(completed.order);
  }

  // --------------------------------------------------------------- ofertas
  // La oferta se guarda en nuestro store (es una propuesta comercial, no un
  // pedido). Al aceptarla se convierte en un pedido real de Shopify.

  async #variantPrice(variantId) {
    const data = await this.graphql(
      `
      query VariantPrice($id: ID!) {
        productVariant(id: $id) { id title price product { title } }
      }
    `,
      { id: variantId },
    );
    const variant = data.productVariant;
    if (!variant) return null;
    return { title: variant.product?.title || variant.title, price: Number(variant.price) };
  }

  async createQuote(input) {
    if (!this.store) throw conflict('No local store configured for quotes.');
    const lines = input.lines || [];
    if (!lines.length) throw invalidInput('A quote needs at least one line.');

    const enriched = [];
    for (const line of lines) {
      if (line.variantId && line.unitPrice === undefined) {
        const variant = await this.#variantPrice(line.variantId);
        if (!variant) throw notFound(`No variant with id ${line.variantId}`);
        enriched.push({ ...line, title: line.title || variant.title, unitPrice: variant.price });
      } else {
        enriched.push(line);
      }
    }

    const discount = input.discount || null;
    const totals = computeQuote({
      lines: enriched,
      discount,
      taxRate: this.taxRate,
      currency: this.settings.currency || 'EUR',
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
    if (!this.store) throw conflict('No local store configured for quotes.');
    let items = this.store.listQuotes();
    if (status) items = items.filter((q) => q.status === status);
    if (customerEmail) {
      const term = String(customerEmail).toLowerCase();
      items = items.filter((q) => (q.customer?.email || '').toLowerCase().includes(term));
    }
    const offset = decodeCursor(cursor);
    const slice = items.slice(offset, offset + limit);
    const nextOffset = offset + slice.length;
    return {
      quotes: slice.map(quoteView),
      pageInfo: {
        hasNextPage: nextOffset < items.length,
        endCursor: nextOffset < items.length ? encodeCursor(nextOffset) : null,
      },
    };
  }

  async getQuote({ id }) {
    if (!this.store) throw conflict('No local store configured for quotes.');
    const quote = this.store.findQuote(id);
    return quote ? quoteView(quote) : null;
  }

  async updateQuote(input) {
    if (!this.store) throw conflict('No local store configured for quotes.');
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
      const totals = computeQuote({
        lines: input.lines || quote.lines,
        discount: input.discount !== undefined ? input.discount : quote.discount,
        taxRate: quote.taxRate ?? this.taxRate,
        currency: quote.currency || this.settings.currency || 'EUR',
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
    if (!this.store) throw conflict('No local store configured for quotes.');
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
    if (!this.store) throw conflict('No local store configured for quotes.');
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

  async searchOrders({ status = 'any', query, limit = 20, cursor } = {}) {
    const search = [query, status && status !== 'any' ? `status:${status}` : null]
      .filter(Boolean)
      .join(' ');
    const data = await this.graphql(
      `
      query SearchOrders($first: Int!, $after: String, $query: String) {
        orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
          nodes { ...OrderFields }
          pageInfo { hasNextPage endCursor }
        }
      }
      ${ORDER_FIELDS}
    `,
      { first: limit, after: cursor || null, query: search || null },
    );
    const connection = data.orders || {};
    return {
      orders: (connection.nodes || []).map(orderView),
      pageInfo: {
        hasNextPage: Boolean(connection.pageInfo?.hasNextPage),
        endCursor: connection.pageInfo?.endCursor || null,
      },
    };
  }

  async getOrder({ id }) {
    const data = await this.graphql(
      `
      query GetOrder($id: ID!) {
        order(id: $id) { ...OrderFields }
      }
      ${ORDER_FIELDS}
    `,
      { id },
    );
    return data.order ? orderView(data.order) : null;
  }

  async updateOrder(input) {
    const order = { id: input.id };
    for (const field of ['tags', 'email', 'note']) {
      if (input[field] !== undefined) order[field] = input[field];
    }
    if (input.shippingAddress !== undefined) order.shippingAddress = input.shippingAddress;

    if (input.financialStatus === 'PAID') {
      await this.mutate(
        `
        mutation OrderMarkAsPaid($id: ID!) {
          orderMarkAsPaid(input: { id: $id }) {
            order { ...OrderFields }
            userErrors { field message }
          }
        }
        ${ORDER_FIELDS}
      `,
        { id: input.id },
        'orderMarkAsPaid',
      );
    } else {
      await this.mutate(
        `
        mutation OrderUpdate($input: OrderUpdateInput!) {
          orderUpdate(input: $input) {
            order { ...OrderFields }
            userErrors { field message }
          }
        }
        ${ORDER_FIELDS}
      `,
        { input: order },
        'orderUpdate',
      );
    }

    let refreshed = await this.getOrder({ id: input.id });
    if (input.metafields?.length) {
      await this.#setMetafields(input.id, input.metafields);
      refreshed = await this.getOrder({ id: input.id });
    }
    if (!refreshed) throw upstream('Shopify did not return the updated order.');
    return refreshed;
  }

  async fulfillOrder(input) {
    const orderId = input.orderId;
    const data = await this.graphql(
      `
      query OrderFulfillmentOrders($id: ID!) {
        order(id: $id) {
          id
          fulfillmentOrders(first: 20) {
            nodes {
              id
              status
              lineItems(first: 100) {
                nodes {
                  id
                  quantity
                  remainingQuantity
                  lineItem { id title }
                }
              }
            }
          }
        }
      }
    `,
      { id: orderId },
    );

    const order = data.order;
    if (!order) throw notFound(`No order with id ${orderId}`);
    const fulfillmentOrders = order.fulfillmentOrders?.nodes || [];
    if (!fulfillmentOrders.length) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'This order has no fulfillment orders, so there is nothing to ship. It may already be fulfilled.',
      );
    }

    const requested = new Map(
      (input.lineItems || []).map((item) => [item.lineItemId, item.quantity ?? 1]),
    );

    const byFulfillmentOrder = new Map();
    for (const fulfillmentOrder of fulfillmentOrders) {
      const items = [];
      for (const line of fulfillmentOrder.lineItems?.nodes || []) {
        const orderLineItemId = line.lineItem?.id;
        if (!orderLineItemId) continue;
        const remaining = line.remainingQuantity ?? line.quantity;
        if (remaining <= 0) continue;
        const wanted = requested.has(orderLineItemId) ? requested.get(orderLineItemId) : remaining;
        const quantity = Math.min(wanted, remaining);
        if (quantity <= 0) continue;
        items.push({ id: line.id, quantity });
      }
      if (items.length) {
        byFulfillmentOrder.set(fulfillmentOrder.id, items);
      }
    }

    if (!byFulfillmentOrder.size) {
      throw new AppError(
        ErrorCode.CONFLICT,
        'Nothing left to fulfill on this order. Every line is already shipped.',
      );
    }

    const fulfillment = {
      lineItemsByFulfillmentOrder: [...byFulfillmentOrder.entries()].map(
        ([fulfillmentOrderId, fulfillmentOrderLineItems]) => ({
          fulfillmentOrderId,
          fulfillmentOrderLineItems,
        }),
      ),
      notifyCustomer: input.notifyCustomer !== false,
    };
    if (input.trackingInfo) fulfillment.trackingInfo = input.trackingInfo;

    const payload = await this.mutate(
      `
      mutation FulfillmentCreate($fulfillment: FulfillmentInput!, $message: String) {
        fulfillmentCreate(fulfillment: $fulfillment, message: $message) {
          fulfillment {
            id
            status
            trackingInfo(first: 10) { company number url }
          }
          userErrors { field message }
        }
      }
    `,
      { fulfillment, message: input.message || null },
      'fulfillmentCreate',
    );

    return {
      fulfillment: {
        id: payload.fulfillment?.id,
        status: payload.fulfillment?.status,
        orderId,
        trackingInfo: payload.fulfillment?.trackingInfo || null,
        notifyCustomer: fulfillment.notifyCustomer,
        message: input.message || null,
      },
    };
  }

  // -------------------------------------------------------------- customers

  async searchCustomers({ query, limit = 20, cursor } = {}) {
    const data = await this.graphql(
      `
      query SearchCustomers($first: Int!, $after: String, $query: String) {
        customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
          nodes { ...CustomerFields }
          pageInfo { hasNextPage endCursor }
        }
      }
      ${CUSTOMER_FIELDS}
    `,
      { first: limit, after: cursor || null, query: query || null },
    );
    const connection = data.customers || {};
    return {
      customers: (connection.nodes || []).map(customerView),
      pageInfo: {
        hasNextPage: Boolean(connection.pageInfo?.hasNextPage),
        endCursor: connection.pageInfo?.endCursor || null,
      },
    };
  }

  async getCustomer({ id }) {
    const data = await this.graphql(
      `
      query GetCustomer($id: ID!) {
        customer(id: $id) { ...CustomerFields }
      }
      ${CUSTOMER_FIELDS}
    `,
      { id },
    );
    return data.customer ? customerView(data.customer) : null;
  }

  async updateCustomer(input) {
    const customer = { id: input.id };
    for (const field of ['firstName', 'lastName', 'email', 'phone', 'tags', 'note', 'taxExempt']) {
      if (input[field] !== undefined) customer[field] = input[field];
    }
    const payload = await this.mutate(
      `
      mutation CustomerUpdate($input: CustomerUpdateInput!) {
        customerUpdate(input: $input) {
          customer { ...CustomerFields }
          userErrors { field message }
        }
      }
      ${CUSTOMER_FIELDS}
    `,
      { input: customer },
      'customerUpdate',
    );
    const updated = customerView(payload.customer);
    if (input.metafields?.length) {
      await this.#setMetafields(updated.id, input.metafields);
      const refreshed = await this.getCustomer({ id: updated.id });
      return refreshed || updated;
    }
    return updated;
  }

  // -------------------------------------------------------------- metafields

  async #setMetafields(ownerId, metafields) {
    const payload = await this.mutate(
      `
      mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields { id namespace key value type }
          userErrors { field message code }
        }
      }
    `,
      {
        metafields: metafields.map((field) => ({
          ownerId,
          namespace: field.namespace || 'custom',
          key: field.key || '',
          type: field.type || 'single_line_text_field',
          value: field.value,
        })),
      },
      'metafieldsSet',
    );
    return payload.metafields || [];
  }

  // --------------------------------------------------------------- versions

  /**
   * Is the configured Admin API version at least the given one?
   * @param {string} version e.g. "2026-01"
   */
  versionAtLeast(version) {
    const current = String(this.apiVersion).split('.').map(Number);
    const wanted = String(version).split('.').map(Number);
    for (let i = 0; i < Math.max(current.length, wanted.length); i += 1) {
      const a = current[i] || 0;
      const b = wanted[i] || 0;
      if (a !== b) return a > b;
    }
    return true;
  }
}

// ------------------------------------------------------------------ helpers

function moneyValue(value) {
  const number = typeof value === 'number' ? value : Number.parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(number)) throw invalidInput(`"${value}" is not a valid price.`);
  return number;
}

function moneySet(set) {
  const shopMoney = set?.shopMoney;
  if (!shopMoney) return null;
  return { amount: shopMoney.amount, currencyCode: shopMoney.currencyCode };
}

function productView(product) {
  const variants = (product.variants?.nodes || []).map((variant) => ({
    id: variant.id,
    title: variant.title,
    price: variant.price,
    compareAtPrice: variant.compareAtPrice,
    sku: variant.sku,
    barcode: variant.barcode,
    taxable: variant.taxable,
    tracked: variant.inventoryItem?.tracked ?? null,
    inventoryQuantity: variant.inventoryQuantity,
    inventoryItemId: variant.inventoryItem?.id || null,
    selectedOptions: variant.selectedOptions || [],
  }));

  const metafields = product.metafields?.nodes || [];
  const categoryId = metafields.find((m) => m.key === 'category')?.value || '';
  const imagesMeta = metafields.find((m) => m.key === 'images')?.value;
  const taxMeta = metafields.find((m) => m.key === 'tax_rate')?.value;
  let customImages = [];
  if (imagesMeta) {
    try {
      const parsed = JSON.parse(imagesMeta);
      if (Array.isArray(parsed)) customImages = parsed;
    } catch {
      customImages = [];
    }
  }

  return {
    id: product.id,
    title: product.title,
    descriptionHtml: product.descriptionHtml,
    handle: product.handle,
    status: product.status,
    vendor: product.vendor,
    productType: product.productType,
    category: categoryId ? { id: categoryId, name: categoryId, slug: categoryId } : null,
    tags: product.tags || [],
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    imageUrl: product.images?.nodes?.[0]?.url || null,
    images: customImages.length
      ? customImages
      : (product.images?.nodes || []).map((image) => ({ url: image.url, alt: image.altText || '' })),
    seo: product.seo || null,
    variants,
    collections: product.collections?.nodes || [],
    metafields,
    priceRange: {
      minPrice: moneySet(product.priceRangeV2 ? { shopMoney: product.priceRangeV2.minVariantPrice } : null),
      maxPrice: moneySet(product.priceRangeV2 ? { shopMoney: product.priceRangeV2.maxVariantPrice } : null),
    },
    totalInventory: product.totalInventory,
    taxRate: taxMeta !== undefined && taxMeta !== '' ? Number(taxMeta) : undefined,
  };
}

function orderView(order) {
  return {
    id: order.id,
    name: order.name,
    createdAt: order.createdAt,
    email: order.email || null,
    displayFinancialStatus: order.displayFinancialStatus,
    displayFulfillmentStatus: order.displayFulfillmentStatus,
    totalPrice: moneySet(order.totalPriceSet),
    subtotalPrice: moneySet(order.subtotalPriceSet),
    totalShippingPrice: moneySet(order.totalShippingPriceSet),
    totalTax: moneySet(order.totalTaxSet),
    customer: order.customer || null,
    shippingAddress: order.shippingAddress || null,
    lineItems: (order.lineItems?.nodes || []).map((line) => ({
      id: line.id,
      title: line.title,
      quantity: line.quantity,
      fulfilledQuantity: line.currentQuantity ?? 0,
      totalPrice: moneySet(line.originalTotalSet),
      variant: line.variant || null,
    })),
    tags: order.tags || [],
    note: order.note || null,
    metafields: order.metafields?.nodes || [],
  };
}

function customerView(customer) {
  return {
    id: customer.id,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    phone: customer.phone,
    createdAt: customer.createdAt,
    updatedAt: customer.updatedAt,
    tags: customer.tags || [],
    note: customer.note || null,
    taxExempt: customer.taxExempt ?? false,
    numberOfOrders: customer.numberOfOrders,
    amountSpent: customer.amountSpent
      ? { amount: customer.amountSpent.amount, currencyCode: customer.amountSpent.currencyCode }
      : null,
    addresses: customer.addresses || [],
    metafields: customer.metafields?.nodes || [],
  };
}
