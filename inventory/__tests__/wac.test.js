'use strict';

// Pure unit tests — no DB required.  Run: npm run inv:test
const test = require('node:test');
const assert = require('node:assert/strict');

const { recomputeWacOnReceipt, valueOutMovement } = require('../services/wac');
const { qty, cost, money, num } = require('../services/money');

test('WAC: first receipt sets WAC to receipt cost', () => {
  const { newQty, newWac } = recomputeWacOnReceipt(0, 0, 100, 850);
  assert.equal(newQty, 100);
  assert.equal(newWac, 850);
});

test('WAC: blended average across two receipts', () => {
  // 100 @ 850, then 100 @ 950 => 200 @ 900
  let s = recomputeWacOnReceipt(0, 0, 100, 850);
  s = recomputeWacOnReceipt(s.newQty, s.newWac, 100, 950);
  assert.equal(s.newQty, 200);
  assert.equal(s.newWac, 900);
});

test('WAC: weighted (not arithmetic) average', () => {
  // 300 @ 10 + 100 @ 20 => 400 @ 12.5
  let s = recomputeWacOnReceipt(0, 0, 300, 10);
  s = recomputeWacOnReceipt(s.newQty, s.newWac, 100, 20);
  assert.equal(s.newWac, 12.5);
});

test('WAC: out-movements do not change WAC and value at current WAC', () => {
  const { unitCost, totalCost } = valueOutMovement(900, 8);
  assert.equal(unitCost, 900);
  assert.equal(totalCost, 7200);
});

test('WAC: receipt that brings qty to zero retains prior WAC', () => {
  // pathological negative receipt should not divide by zero / reset
  const { newQty, newWac } = recomputeWacOnReceipt(5, 850, -5, 0);
  assert.equal(newQty, 0);
  assert.equal(newWac, 850);
});

test('rounding helpers respect documented precision', () => {
  assert.equal(qty(1.23456), 1.235);
  assert.equal(cost(1.234567), 1.2346);
  assert.equal(money(1.235), 1.24);
  assert.equal(num('42.5'), 42.5);
  assert.equal(num(null), 0);
  assert.equal(num(''), 0);
});

test('WAC: 4-decimal cost precision preserved', () => {
  // 1 @ 0.3333, 2 @ 0.6667 => (0.3333 + 1.3334)/3 = 0.5556 (rounded 4dp)
  let s = recomputeWacOnReceipt(0, 0, 1, 0.3333);
  s = recomputeWacOnReceipt(s.newQty, s.newWac, 2, 0.6667);
  assert.equal(s.newQty, 3);
  assert.equal(s.newWac, cost((0.3333 + 2 * 0.6667) / 3));
});
