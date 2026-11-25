/**
 * Stripe.
 *
 * Sin SDK: la API de Stripe se habla con `fetch` y el cuerpo en formato
 * `application/x-www-form-urlencoded`, que es lo que espera. El webhook se
 * verifica firmando el payload con HMAC-SHA256, como manda Stripe.
 *
 * Si no hay `STRIPE_SECRET_KEY`, la tienda funciona igual con el pago
 * simulado: el botón de tarjeta simply no aparece.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { AppError, ErrorCode, upstream, invalidInput } from './errors.js';

const API = 'https://api.stripe.com/v1';

export class StripeClient {
  /**
   * @param {object} options
   * @param {string} [options.secretKey]
   * @param {string} [options.webhookSecret]
   */
  constructor({ secretKey = '', webhookSecret = '' } = {}) {
    this.secretKey = secretKey || '';
    this.webhookSecret = webhookSecret || '';
  }

  isConfigured() {
    return Boolean(this.secretKey);
  }

  /**
   * Create a hosted Checkout Session.
   *
   * @param {object} options
   * @param {Array<{name: string, amount: number, currency: string, quantity: number}>} options.lines
   * @param {string} options.successUrl
   * @param {string} options.cancelUrl
   * @param {string} [options.customerEmail]
   * @param {object} [options.metadata]
   * @returns {Promise<{id: string, url: string}>}
   */
  async createCheckoutSession({ lines, successUrl, cancelUrl, customerEmail, metadata }) {
    if (!this.isConfigured()) {
      throw new AppError(ErrorCode.UNSUPPORTED, 'Stripe is not configured on this server.');
    }
    if (!lines?.length) throw invalidInput('A checkout session needs at least one line.');

    const form = new URLSearchParams();
    form.set('mode', 'payment');
    form.set('success_url', successUrl);
    form.set('cancel_url', cancelUrl);
    if (customerEmail) form.set('customer_email', customerEmail);
    if (metadata) {
      for (const [key, value] of Object.entries(metadata)) {
        form.set(`metadata[${key}]`, String(value));
      }
    }

    lines.forEach((line, index) => {
      const amount = Math.round(Number(line.amount) * 100);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw invalidInput(`Line ${index + 1} has an invalid amount.`);
      }
      form.set(`line_items[${index}][quantity]`, String(line.quantity ?? 1));
      form.set(`line_items[${index}][price_data][currency]`, String(line.currency || 'eur').toLowerCase());
      form.set(`line_items[${index}][price_data][unit_amount]`, String(amount));
      form.set(`line_items[${index}][price_data][product_data][name]`, String(line.name).slice(0, 200));
    });

    const session = await this.#post('checkout/sessions', form);
    return { id: session.id, url: session.url };
  }

  /**
   * Retrieve a session, e.g. to confirm the payment after the redirect.
   * @param {string} id
   */
  async retrieveSession(id) {
    const session = await this.#get(`checkout/sessions/${encodeURIComponent(id)}`);
    return {
      id: session.id,
      paymentStatus: session.payment_status,
      status: session.status,
      customerEmail: session.customer_email || session.customer_details?.email || null,
      amountTotal: session.amount_total,
      currency: session.currency,
      metadata: session.metadata || {},
    };
  }

  async #post(path, form) {
    const res = await fetch(`${API}/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form,
    });
    return this.#parse(res);
  }

  async #get(path) {
    const res = await fetch(`${API}/${path}`, {
      headers: { Authorization: `Bearer ${this.secretKey}` },
    });
    return this.#parse(res);
  }

  async #parse(res) {
    const text = await res.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      throw upstream('Stripe returned a non JSON response.');
    }
    if (!res.ok) {
      const message = payload.error?.message || `HTTP ${res.status}`;
      throw new AppError(ErrorCode.UPSTREAM, `Stripe rejected the request: ${message}`, {
        stripeCode: payload.error?.code || null,
        status: res.status,
      });
    }
    return payload;
  }

  /**
   * Verify a Stripe webhook signature.
   *
   * @param {string} rawBody the exact bytes Stripe sent
   * @param {string} header the `Stripe-Signature` header
   * @returns {object} the parsed event
   */
  verifyWebhook(rawBody, header) {
    if (!this.webhookSecret) {
      throw new AppError(ErrorCode.UNSUPPORTED, 'No webhook secret configured.');
    }
    if (!header) throw new AppError(ErrorCode.UNAUTHORIZED, 'Missing Stripe-Signature header.');

    let timestamp = null;
    const signatures = [];
    for (const part of String(header).split(',')) {
      const [key, value] = part.split('=');
      if (!value) continue;
      if (key === 't') timestamp = value;
      if (key === 'v1') signatures.push(value);
    }
    if (!timestamp || !signatures.length) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Malformed Stripe-Signature header.');
    }

    // Stripe tolerates 5 minutes of clock drift.
    const age = Math.abs(Date.now() / 1000 - Number(timestamp));
    if (Number.isFinite(age) && age > 300) {
      throw new AppError(ErrorCode.UNAUTHORIZED, 'Stripe signature is too old.');
    }

    const expected = createHmac('sha256', this.webhookSecret)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const ok = signatures.some((signature) => {
      const candidate = Buffer.from(signature, 'utf8');
      return candidate.length === expectedBuffer.length && timingSafeEqual(candidate, expectedBuffer);
    });
    if (!ok) throw new AppError(ErrorCode.UNAUTHORIZED, 'Stripe signature does not match.');

    try {
      return JSON.parse(rawBody);
    } catch {
      throw invalidInput('Webhook body is not valid JSON.');
    }
  }
}
