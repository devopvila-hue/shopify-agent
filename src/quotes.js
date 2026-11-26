/**
 * Ofertas (presupuestos).
 *
 * Una oferta es una propuesta de venta: puede llevar productos del catálogo
 * o líneas libres, que es lo que necesita DEPARTIFY para presupuestar un
 * proyecto ("Automatización del proceso de altas, 3 semanas, 2.400 €").
 *
 * Los cálculos viven aquí para que el mock y la tienda real devuelvan
 * exactamente las mismas cifras.
 */

import { round2 } from './tax.js';

export const QUOTE_STATUS = ['DRAFT', 'SENT', 'ACCEPTED', 'DECLINED', 'EXPIRED'];

export const OPEN_STATUSES = ['DRAFT', 'SENT'];

/**
 * Normalise the lines and compute the totals.
 *
 * @param {object} input
 * @param {Array<{title?: string, variantId?: string, quantity?: number, unitPrice?: number|string}>} input.lines
 * @param {{type?: string, value?: number}} [input.discount]
 * @param {number} input.taxRate percentage
 * @param {string} input.currency
 * @returns {{lines: object[], subtotal: number, discountAmount: number, taxAmount: number, total: number}}
 */
export function computeQuote({ lines = [], discount, taxRate = 0, currency = 'EUR' }) {
  const normalised = lines.map((line) => {
    const quantity = Math.max(1, Number(line.quantity ?? 1));
    const unitPrice = round2(Number(line.unitPrice ?? 0));
    return {
      title: line.title || 'Línea',
      description: line.description || '',
      variantId: line.variantId || null,
      quantity,
      unitPrice: unitPrice.toFixed(2),
      total: round2(unitPrice * quantity),
    };
  });

  const subtotal = round2(normalised.reduce((sum, line) => sum + line.total, 0));

  let discountAmount = 0;
  if (discount && discount.value) {
    const value = Number(discount.value) || 0;
    discountAmount = discount.type === 'percent'
      ? round2((subtotal * value) / 100)
      : round2(value);
    discountAmount = Math.min(discountAmount, subtotal);
  }

  const taxable = round2(subtotal - discountAmount);
  const taxAmount = round2((taxable * (Number(taxRate) || 0)) / 100);

  return {
    lines: normalised,
    subtotal,
    discountAmount,
    taxAmount,
    total: round2(taxable + taxAmount),
    currency,
  };
}

/**
 * Public shape of a quote.
 * @param {object} quote
 */
export function quoteView(quote) {
  return {
    id: quote.id,
    number: quote.number,
    status: quote.status,
    customer: quote.customer || null,
    lines: quote.lines || [],
    discount: quote.discount || null,
    discountAmount: quote.discountAmount ?? 0,
    subtotal: quote.subtotal ?? 0,
    taxRate: quote.taxRate ?? 0,
    taxAmount: quote.taxAmount ?? 0,
    total: quote.total ?? 0,
    currency: quote.currency || 'EUR',
    validUntil: quote.validUntil || null,
    note: quote.note || '',
    tags: quote.tags || [],
    orderId: quote.orderId || null,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
  };
}

/**
 * Spread a discount over the lines so an order built from a quote adds up to
 * the same total the customer was quoted.
 *
 * A percentage scales every line. A fixed amount comes off the last line.
 *
 * @param {Array<object>} lines
 * @param {{type?: string, value?: number}} [discount]
 * @returns {Array<object>} new lines
 */
export function discountLines(lines, discount) {
  if (!discount || !discount.value) return lines;
  const value = Number(discount.value) || 0;
  if (!value) return lines;

  if (discount.type === 'percent') {
    const factor = 1 - value / 100;
    return lines.map((line) => {
      const unitPrice = round2(Number(line.unitPrice) * factor);
      return {
        ...line,
        unitPrice: unitPrice.toFixed(2),
        total: round2(unitPrice * line.quantity),
      };
    });
  }

  const out = lines.map((line) => ({ ...line }));
  const last = out[out.length - 1];
  if (!last) return out;
  const amount = Math.min(value, last.total);
  const unitPrice = round2((last.total - amount) / last.quantity);
  out[out.length - 1] = {
    ...last,
    unitPrice: unitPrice.toFixed(2),
    total: round2(unitPrice * last.quantity),
  };
  return out;
}
