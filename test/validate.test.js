import test from 'node:test';
import assert from 'node:assert/strict';
import { validate, validateArgs } from '../src/validate.js';

test('validate rejects a wrong type', () => {
  assert.throws(() => validate('nope', { type: 'number' }), /expected number/);
});

test('validate accepts a correct type', () => {
  assert.equal(validate(3, { type: 'number' }), 3);
});

test('validate applies defaults', () => {
  assert.equal(validate(undefined, { type: 'integer', default: 20 }), 20);
});

test('validate enforces enum', () => {
  assert.throws(() => validate('X', { type: 'string', enum: ['a', 'b'] }), /must be one of/);
});

test('validate enforces minimum and maximum', () => {
  assert.throws(() => validate(0, { type: 'integer', minimum: 1 }), /must be >= 1/);
  assert.throws(() => validate(500, { type: 'integer', maximum: 100 }), /must be <= 100/);
});

test('validate rejects unknown properties when additionalProperties is false', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'string' } },
    additionalProperties: false,
  };
  assert.throws(() => validateArgs({ a: 'x', b: 1 }, schema), /unknown property/);
});

test('validate reports the required property', () => {
  const schema = {
    type: 'object',
    properties: { a: { type: 'string' } },
    required: ['a'],
    additionalProperties: false,
  };
  assert.throws(() => validateArgs({}, schema), /is required/);
});

test('validate checks nested arrays and objects', () => {
  const schema = {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: { qty: { type: 'integer', minimum: 1 } },
          required: ['qty'],
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  };
  assert.throws(() => validateArgs({ items: [{ qty: 0 }] }, schema), /items\[0\].qty/);
  assert.deepEqual(validateArgs({ items: [{ qty: 2 }] }, schema), { items: [{ qty: 2 }] });
});

test('validate checks email format', () => {
  assert.throws(() => validate('nope', { type: 'string', format: 'email' }), /valid email/);
  assert.equal(validate('a@b.co', { type: 'string', format: 'email' }), 'a@b.co');
});

test('validate keeps extra properties when allowed', () => {
  const schema = { type: 'object', properties: { a: { type: 'string' } } };
  assert.deepEqual(validateArgs({ a: 'x', b: 2 }, schema), { a: 'x', b: 2 });
});
