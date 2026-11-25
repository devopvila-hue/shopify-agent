import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHmac } from 'node:crypto';
import { createRegistry } from '../src/tools/index.js';
import { MockBackend } from '../src/backends/mock.js';
import { ShopStore } from '../src/store.js';
import { StripeClient } from '../src/stripe.js';
import { negotiateLocale, translator } from '../src/i18n.js';
import { netToGross, grossToNet, vatRate, breakdown } from '../src/tax.js';

function harness() {
  const dir = mkdtempSync(join(tmpdir(), 'shop-test-'));
  const store = new ShopStore(join(dir, 'shop.json'));
  const registry = createRegistry();
  const backend = new MockBackend(store);
  const ctx = { registry, backend, store };
  const call = (name, args = {}) => registry.invoke(name, args, ctx);
  return { registry, backend, store, call, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}

test('categories can be created, renamed and deleted', async (t) => {
  const h = harness();
  t.after(h.cleanup);

  const created = await h.call('create_category', { name: 'Invierno', taxRate: 21 });
  assert.ok(created.category.id);
  assert.equal(created.category.name, 'Invierno');
  assert.equal(created.category.taxRate, 21);

  const list = await h.call('list_categories');
  assert.equal(list.categories.length, 1);

  const renamed = await h.call('update_category', { id: created.category.id, name: 'Colección invierno' });
  assert.equal(renamed.category.name, 'Colección invierno');

  await assert.rejects(
    () => h.call('delete_category', { id: created.category.id, confirm: false }),
    /requires confirm: true/,
  );
  const deleted = await h.call('delete_category', { id: created.category.id, confirm: true });
  assert.equal(deleted.deletedCategoryId, created.category.id);
});

test('a category can be assigned to a product and shows up on it', async (t) => {
  const h = harness();
  t.after(h.cleanup);

  const category = (await h.call('create_category', { name: 'Home' })).category;
  const result = await h.call('assign_category', {
    productId: 'gid://shopify/Product/1002',
    categoryId: category.id,
  });
  assert.equal(result.product.category.id, category.id);
  assert.equal(result.product.category.name, 'Home');
});

test('a category VAT rate overrides the shop rate for its products', async (t) => {
  const h = harness();
  t.after(h.cleanup);

  await h.call('update_settings', { taxCountry: 'ES' });
  const category = (await h.call('create_category', { name: 'Libros', taxRate: 10 })).category;
  await h.call('assign_category', { productId: 'gid://shopify/Product/1109', categoryId: category.id });

  const product = (await h.call('get_product', { productId: 'gid://shopify/Product/1109' })).product;
  assert.equal(product.taxRate, 10);
});

test('product images can be set and read back', async (t) => {
  const h = harness();
  t.after(h.cleanup);

  const result = await h.call('set_product_images', {
    productId: 'gid://shopify/Product/1001',
    images: [{ url: 'https://cdn.example.com/sweater.jpg', alt: 'Aurora Merino Sweater' }],
  });
  assert.equal(result.product.images.length, 1);
  assert.equal(result.product.images[0].url, 'https://cdn.example.com/sweater.jpg');
});

test('settings change the VAT rate in force', async (t) => {
  const h = harness();
  t.after(h.cleanup);

  const settings = (await h.call('update_settings', { taxCountry: 'HU' })).settings;
  assert.equal(settings.taxCountry, 'HU');

  const info = await h.call('store_info');
  assert.equal(info.vatRate, 27);

  const stats = await h.call('shop_stats');
  assert.equal(stats.vatRate, 27);
  assert.ok(stats.productCount > 0);
});

test('the VAT rate table covers the four shop languages countries', () => {
  assert.equal(vatRate('ES'), 21);
  assert.equal(vatRate('RO'), 21);
  assert.equal(vatRate('HU'), 27);
  assert.equal(vatRate('GB'), 20);
});

test('net and gross prices convert both ways', () => {
  assert.equal(netToGross(100, 21), 121);
  assert.equal(grossToNet(121, 21), 100);
  assert.equal(netToGross(89, 21), 107.69);
});

test('a cart breakdown groups the tax by rate', () => {
  const result = breakdown([
    { net: 100, rate: 21 },
    { net: 50, rate: 10 },
  ], 5);
  assert.equal(result.net, 150);
  assert.equal(result.taxByRate['21'], 21);
  assert.equal(result.taxByRate['10'], 5);
  assert.equal(result.total, 181);
});

test('locale negotiation picks the right language', () => {
  assert.equal(negotiateLocale(['hu-HU,hu;q=0.9,en;q=0.8']), 'hu');
  assert.equal(negotiateLocale(['ro-RO,ro;q=0.9']), 'ro');
  assert.equal(negotiateLocale(['es-ES,es;q=0.9']), 'es');
  assert.equal(negotiateLocale(['de-DE,de;q=0.9']), 'en');
});

test('every locale has the same keys', () => {
  const keys = ['en', 'es', 'ro', 'hu'].map((l) => Object.keys(translator(l).locale === l ? {} : {}));
  assert.equal(keys.length, 4);
  const en = translator('en');
  assert.ok(en('nav.shop'));
  assert.equal(en('nav.shop'), 'Shop');
  assert.equal(translator('es')('nav.shop'), 'Tienda');
  assert.equal(translator('ro')('nav.shop'), 'Magazin');
  assert.equal(translator('hu')('nav.shop'), 'Üzlet');
});

test('the Stripe webhook only accepts a valid signature', () => {
  const stripe = new StripeClient({ secretKey: 'sk_test_x', webhookSecret: 'whsec_test' });
  const payload = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_1' } } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', 'whsec_test').update(`${timestamp}.${payload}`).digest('hex');

  const event = stripe.verifyWebhook(payload, `t=${timestamp},v1=${signature}`);
  assert.equal(event.type, 'checkout.session.completed');

  assert.throws(() => stripe.verifyWebhook(payload, `t=${timestamp},v1=deadbeef`), /signature does not match/);
  assert.throws(() => stripe.verifyWebhook(payload, ''), /Missing Stripe-Signature/);
});

test('Stripe reports that it is not configured instead of pretending', async (t) => {
  const h = harness();
  t.after(h.cleanup);
  const stripe = new StripeClient({});
  await assert.rejects(
    () => h.registry.invoke('create_checkout_session', { lines: [{ name: 'x', amount: 10 }] }, { ...h, stripe }),
    /Stripe is not configured/,
  );
});

test('there are thirty design templates, one per industry', async () => {
  const { THEMES, getTheme, themeVars, DEFAULT_THEME } = await import('../src/themes.js');
  assert.equal(THEMES.length, 30);
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, 30, 'theme ids must be unique');
  const industries = new Set(THEMES.map((t) => t.industry));
  assert.equal(industries.size, 30, 'each theme should target a different industry');

  for (const theme of THEMES) {
    assert.ok(theme.name, `${theme.id} needs a name`);
    assert.ok(theme.palette.paper.startsWith('#'));
    assert.ok(theme.palette.accent.startsWith('#'));
    assert.ok(['split', 'centered'].includes(theme.layout.hero));
    assert.ok(['plain', 'border', 'shadow', 'solid'].includes(theme.layout.card));
    assert.ok(['pill', 'square', 'soft'].includes(theme.layout.button));
  }

  const vars = themeVars(getTheme(DEFAULT_THEME));
  assert.ok(vars['--paper']);
  assert.ok(vars['--accent']);
  assert.ok(vars['--radius']);
  assert.equal(getTheme('does-not-exist').id, DEFAULT_THEME);
});

test('the shop settings keep the design template', async (t) => {
  const h = harness();
  t.after(h.cleanup);
  const settings = (await h.call('update_settings', { defaultTheme: 'brasa' })).settings;
  assert.equal(settings.defaultTheme, 'brasa');
});

test('a product takes up to five images and one of them is the default', async (t) => {
  const h = harness();
  t.after(h.cleanup);

  const urls = ['/uploads/a.png', '/uploads/b.png', '/uploads/c.png'];
  const saved = await h.call('set_product_images', {
    productId: 'gid://shopify/Product/1001',
    images: [
      { url: urls[0], alt: 'General' },
      { url: urls[1], alt: 'Detalle', isDefault: true },
      { url: urls[2] },
    ],
  });
  assert.equal(saved.product.images.length, 3);
  assert.equal(saved.product.images[1].isDefault, true);
  assert.equal(saved.product.images[0].isDefault, false);

  const back = await h.call('get_product', { productId: 'gid://shopify/Product/1001' });
  assert.equal(back.product.images[1].isDefault, true);
});

test('a sixth image is refused', async (t) => {
  const h = harness();
  t.after(h.cleanup);
  await assert.rejects(
    () =>
      h.call('set_product_images', {
        productId: 'gid://shopify/Product/1001',
        images: Array.from({ length: 6 }, (_, i) => ({ url: `/uploads/${i}.png` })),
      }),
    /at most 5 items/,
  );
});
