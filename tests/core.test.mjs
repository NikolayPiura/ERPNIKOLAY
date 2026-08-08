import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, duration, money, number, percent, sum } from '../src/core/format.js';

test('financial helpers preserve numeric meaning', () => {
  assert.equal(number('12 345,67'), 12345.67);
  assert.equal(sum([1, '2', '3,5']), 6.5);
  assert.match(money(1234, 'USD'), /1[\s ]?234/);
  assert.equal(percent(12.46, 1), '12,5%');
});

test('time helpers are deterministic', () => {
  assert.equal(duration(125), '2:05');
  assert.equal(dateKey(new Date('2026-08-08T12:00:00')), '2026-08-08');
});
