// Run with: node --test src/services/age.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { locationAgeText } from './age.ts';

test('locationAgeText: null with no time', () => {
  assert.equal(locationAgeText(null, 1000), null);
  assert.equal(locationAgeText(undefined, 1000), null);
});

test('locationAgeText: just now under 1 min, then whole minutes', () => {
  assert.equal(locationAgeText(1000, 1000), 'Location updated just now');
  assert.equal(locationAgeText(1000, 1059.9), 'Location updated just now');
  assert.equal(locationAgeText(1000, 1060), 'Location updated 1 min ago');
  assert.equal(locationAgeText(1000, 1000 + 59 * 60 + 59), 'Location updated 59 min ago');
  assert.equal(locationAgeText(1000, 990), 'Location updated just now'); // clocks a little off
});
