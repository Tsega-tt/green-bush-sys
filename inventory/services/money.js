'use strict';

/**
 * Numeric helpers. Quantities use 3 decimals, costs/WAC use 4, money values 2.
 * PostgreSQL NUMERIC is exact; JS does the arithmetic, so we round explicitly
 * at the documented precision to avoid float drift accumulating across writes.
 */

function round(value, dp) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = Math.pow(10, dp);
  // round-half-up on the absolute value to avoid -0 / banker's surprises
  return Math.sign(n) * Math.round(Math.abs(n) * f) / f;
}

const qty = (v) => round(v, 3);
const cost = (v) => round(v, 4);
const money = (v) => round(v, 2);

/** Parse a NUMERIC column (pg returns it as string) into a JS number. */
function num(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

module.exports = { round, qty, cost, money, num };
