/**
 * IVA / VAT.
 *
 * Los precios se guardan SIN impuestos (netos), como en Shopify. En la UE el
 * precio que se muestra al consumidor final lleva el IVA incluido, así que
 * aquí se convierte de neto a bruto y se desglosa en el carrito.
 *
 * Tipos estándar vigentes en 2026 (fuente: Your Europe / Tax Foundation).
 */

export const VAT_RATES = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21, DE: 19, DK: 25, EE: 24, EL: 24,
  ES: 21, FI: 25.5, FR: 20, HR: 25, HU: 27, IE: 23, IT: 22, LT: 21, LU: 17,
  LV: 21, MT: 18, NL: 21, PL: 23, PT: 23, RO: 21, SE: 25, SI: 22, SK: 23,
  GB: 20, CH: 8.1, NO: 25,
};

export const COUNTRY_NAMES = {
  AT: 'Austria', BE: 'Belgium', BG: 'Bulgaria', CY: 'Cyprus', CZ: 'Czechia',
  DE: 'Germany', DK: 'Denmark', EE: 'Estonia', EL: 'Greece', ES: 'Spain',
  FI: 'Finland', FR: 'France', HR: 'Croatia', HU: 'Hungary', IE: 'Ireland',
  IT: 'Italy', LT: 'Lithuania', LU: 'Luxembourg', LV: 'Latvia', MT: 'Malta',
  NL: 'Netherlands', PL: 'Poland', PT: 'Portugal', RO: 'Romania', SE: 'Sweden',
  SI: 'Slovenia', SK: 'Slovak Republic', GB: 'United Kingdom', CH: 'Switzerland',
  NO: 'Norway',
};

export const DEFAULT_TAX_COUNTRY = 'ES';

/**
 * @param {string} country ISO code
 * @returns {number} percentage
 */
export function vatRate(country) {
  return VAT_RATES[String(country || '').toUpperCase()] ?? VAT_RATES[DEFAULT_TAX_COUNTRY];
}

/**
 * Net -> gross.
 * @param {number|string} net
 * @param {number} rate percentage, e.g. 21
 * @returns {number}
 */
export function netToGross(net, rate) {
  const value = Number(net) || 0;
  return round2(value * (1 + rate / 100));
}

/**
 * Gross -> net.
 * @param {number|string} gross
 * @param {number} rate percentage
 * @returns {number}
 */
export function grossToNet(gross, rate) {
  const value = Number(gross) || 0;
  return round2(value / (1 + rate / 100));
}

/**
 * The amount of tax inside a gross figure.
 * @param {number|string} gross
 * @param {number} rate percentage
 */
export function taxFromGross(gross, rate) {
  return round2((Number(gross) || 0) - grossToNet(gross, rate));
}

export function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/**
 * Price breakdown for a cart.
 * @param {Array<{net: number, rate: number}>} lines
 * @param {number} shipping
 */
export function breakdown(lines, shipping = 0) {
  const groups = new Map();
  let net = 0;
  for (const line of lines) {
    const rate = line.rate ?? 0;
    net += Number(line.net) || 0;
    groups.set(rate, (groups.get(rate) || 0) + (Number(line.net) || 0));
  }
  const shippingNet = Number(shipping) || 0;
  const rates = [...groups.keys()].sort((a, b) => b - a);
  const taxByRate = {};
  let tax = 0;
  for (const rate of rates) {
    const amount = round2((groups.get(rate) * rate) / 100);
    taxByRate[rate] = amount;
    tax += amount;
  }
  const total = round2(net + shippingNet + tax);
  return {
    net: round2(net),
    shipping: round2(shippingNet),
    tax: round2(tax),
    taxByRate,
    gross: round2(net + shippingNet),
    total,
  };
}

/**
 * Format an amount for a locale.
 * @param {number} amount
 * @param {string} currency
 * @param {string} locale
 */
export function formatMoney(amount, currency = 'EUR', locale = 'en') {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(amount) || 0);
  } catch {
    return `${(Number(amount) || 0).toFixed(2)} ${currency}`;
  }
}
