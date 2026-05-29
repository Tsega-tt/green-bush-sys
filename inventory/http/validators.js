'use strict';

const { Errors } = require('../errors');

function requireFields(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || body[f] === '');
  if (missing.length) throw Errors.validation(`Missing required field(s): ${missing.join(', ')}`);
}

function toInt(v, name) {
  const n = parseInt(v, 10);
  if (!Number.isFinite(n)) throw Errors.validation(`${name} must be an integer`);
  return n;
}

function toNum(v, name) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!Number.isFinite(n)) throw Errors.validation(`${name} must be a number`);
  return n;
}

function positiveNum(v, name) {
  const n = toNum(v, name);
  if (n <= 0) throw Errors.validation(`${name} must be > 0`);
  return n;
}

function nonNegNum(v, name) {
  const n = toNum(v, name);
  if (n < 0) throw Errors.validation(`${name} must be >= 0`);
  return n;
}

function optBool(v, def = undefined) {
  if (v === undefined || v === null || v === '') return def;
  if (typeof v === 'boolean') return v;
  return String(v).toLowerCase() === 'true';
}

module.exports = { requireFields, toInt, toNum, positiveNum, nonNegNum, optBool };
