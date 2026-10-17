// Run with: node --test src/services/home-by.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { clockText, nextAt, parseClock } from './home-by.ts';

test('parseClock accepts H:MM and HH:MM', () => {
  assert.deepEqual(parseClock('23:30'), { h: 23, m: 30 });
  assert.deepEqual(parseClock('9:05'), { h: 9, m: 5 });
  assert.deepEqual(parseClock('00:00'), { h: 0, m: 0 });
  assert.deepEqual(parseClock('23:59'), { h: 23, m: 59 });
  assert.deepEqual(parseClock(' 7:15 '), { h: 7, m: 15 });
});

test('parseClock rejects bad text', () => {
  for (const bad of ['24:00', '12:60', '', ' ', 'ab:cd', '1230', '12:5', '12:345', '-1:30', '12.30', '23:30pm']) {
    assert.equal(parseClock(bad), null, bad);
  }
});

const at = (h: number, m: number, day = 15) => new Date(2026, 5, day, h, m, 0, 0).getTime();

test('nextAt: today when the time is still ahead', () => {
  assert.equal(nextAt(23, 30, at(20, 0)), at(23, 30));
  assert.equal(nextAt(23, 30, at(23, 29)), at(23, 30));
});

test('nextAt: exactly now counts as tomorrow', () => {
  assert.equal(nextAt(23, 30, at(23, 30)), at(23, 30, 16));
  assert.equal(nextAt(23, 30, at(23, 30) + 1), at(23, 30, 16));
});

test('nextAt: past time is tomorrow, midnight rolls over', () => {
  assert.equal(nextAt(1, 0, at(23, 0)), at(1, 0, 16));
  assert.equal(nextAt(0, 0, at(0, 0)), at(0, 0, 16));
  assert.equal(nextAt(0, 0, at(23, 59)), at(0, 0, 16));
  assert.equal(nextAt(23, 59, at(0, 0)), at(23, 59));
});

test('nextAt: month end', () => {
  assert.equal(nextAt(1, 0, new Date(2026, 5, 30, 23, 0).getTime()), new Date(2026, 6, 1, 1, 0).getTime());
});

test('clockText pads to 24-hour HH:MM', () => {
  assert.equal(clockText(at(9, 5)), '09:05');
  assert.equal(clockText(at(23, 30)), '23:30');
});
