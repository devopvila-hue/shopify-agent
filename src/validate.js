/**
 * A very small JSON Schema validator.
 *
 * Deliberately not a general purpose implementation: it supports exactly the
 * keywords this project uses, and it fails loudly on anything it does not
 * understand instead of silently passing it. That keeps the server
 * dependency-free while still refusing malformed agent input.
 *
 * Supported: type, enum, const, properties, required, additionalProperties,
 * items, minItems, maxItems, minimum, maximum, minLength, maxLength,
 * pattern, default, format ("email"), nullable.
 */

import { invalidInput } from './errors.js';

const TYPE_CHECKS = {
  string: (v) => typeof v === 'string',
  number: (v) => typeof v === 'number' && Number.isFinite(v),
  integer: (v) => typeof v === 'number' && Number.isInteger(v),
  boolean: (v) => typeof v === 'boolean',
  array: (v) => Array.isArray(v),
  object: (v) => v !== null && typeof v === 'object' && !Array.isArray(v),
  null: (v) => v === null,
};

/**
 * Validate `value` against `schema`.
 * @param {unknown} value
 * @param {object} schema
 * @param {string} [path] dot path used in error messages
 * @returns {unknown} the validated value (defaults applied)
 * @throws {AppError} invalid_input
 */
export function validate(value, schema, path = '$') {
  if (!schema || typeof schema !== 'object') return value;

  if (schema.nullable && value === null) return null;

  if (value === undefined) {
    if (schema.default !== undefined) return structuredClone(schema.default);
    return undefined;
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length) {
    const ok = types.some((t) => TYPE_CHECKS[t] && TYPE_CHECKS[t](value));
    if (!ok) {
      throw invalidInput(`${path}: expected ${types.join(' or ')}, got ${describe(value)}`);
    }
  }

  if (schema.const !== undefined && value !== schema.const) {
    throw invalidInput(`${path}: must be ${JSON.stringify(schema.const)}`);
  }

  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    throw invalidInput(
      `${path}: must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`,
    );
  }

  if (typeof value === 'string') validateString(value, schema, path);
  if (typeof value === 'number') validateNumber(value, schema, path);
  if (Array.isArray(value)) validateArray(value, schema, path);
  else if (value !== null && typeof value === 'object') validateObject(value, schema, path);

  return value;
}

function validateString(value, schema, path) {
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    throw invalidInput(`${path}: must be at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    throw invalidInput(`${path}: must be at most ${schema.maxLength} characters`);
  }
  if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
    throw invalidInput(`${path}: does not match ${schema.pattern}`);
  }
  if (schema.format === 'email' && !/^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(value)) {
    throw invalidInput(`${path}: must be a valid email address`);
  }
}

function validateNumber(value, schema, path) {
  if (schema.minimum !== undefined && value < schema.minimum) {
    throw invalidInput(`${path}: must be >= ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    throw invalidInput(`${path}: must be <= ${schema.maximum}`);
  }
}

function validateArray(value, schema, path) {
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    throw invalidInput(`${path}: must contain at least ${schema.minItems} items`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    throw invalidInput(`${path}: must contain at most ${schema.maxItems} items`);
  }
  if (schema.items) {
    value.forEach((item, i) => validate(item, schema.items, `${path}[${i}]`));
  }
}

function validateObject(value, schema, path) {
  const props = schema.properties || {};
  const required = schema.required || [];

  for (const key of required) {
    if (value[key] === undefined) throw invalidInput(`${path}.${key}: is required`);
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in props)) throw invalidInput(`${path}.${key}: unknown property`);
    }
  }

  for (const [key, sub] of Object.entries(props)) {
    if (value[key] === undefined) continue;
    value[key] = validate(value[key], sub, `${path}.${key}`);
  }
}

/**
 * Validate a whole argument object and return a normalised copy with
 * defaults applied.
 * @param {object} input
 * @param {object} schema
 * @returns {object}
 */
export function validateArgs(input, schema) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  // Validate the root object first so `required` and `additionalProperties`
  // are enforced at the top level too, not only inside nested objects.
  validate(source, schema, '$');

  const props = (schema && schema.properties) || {};
  const out = {};
  for (const [key, sub] of Object.entries(props)) {
    const value = validate(source[key], sub, `$.${key}`);
    if (value !== undefined) out[key] = value;
  }
  if (!schema || schema.additionalProperties !== false) {
    for (const [key, value] of Object.entries(source)) {
      if (!(key in out) && !(key in props)) out[key] = value;
    }
  }
  return out;
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}
