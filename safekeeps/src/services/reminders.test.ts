// Run with: node --test src/services/reminders.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { wantedReminders } from './reminders.ts';

const NOW = 1_000_000_000_000; // phone ms
const OFFSET = 5000; // the server clock is 5 s ahead
const server = (phoneMs: number) => (phoneMs + OFFSET) / 1000; // phone ms to server seconds

test('armed with next_check: one reminder at that time on the phone clock', () => {
  const view = { state: 'armed', next_check: server(NOW + 60_000) };
  assert.deepEqual(wantedReminders(view, OFFSET, NOW), [{ id: 'next-check', at: NOW + 60_000 }]);
});

test('home_by ahead is scheduled, home_by behind is not', () => {
  const ahead = { state: 'armed', next_check: null, home_by: server(NOW + 3_600_000) };
  assert.deepEqual(wantedReminders(ahead, OFFSET, NOW), [{ id: 'home-by', at: NOW + 3_600_000 }]);
  const behind = { state: 'armed', next_check: null, home_by: server(NOW - 1000) };
  assert.deepEqual(wantedReminders(behind, OFFSET, NOW), []);
});

test('both: next_check and home_by', () => {
  const view = { state: 'armed', next_check: server(NOW + 1000), home_by: server(NOW + 2000) };
  assert.deepEqual(wantedReminders(view, OFFSET, NOW).map(r => r.id), ['next-check', 'home-by']);
});

test('no night, no view, or no times: nothing', () => {
  assert.deepEqual(wantedReminders(null, OFFSET, NOW), []);
  assert.deepEqual(wantedReminders(undefined, OFFSET, NOW), []);
  assert.deepEqual(wantedReminders({ state: 'armed', next_check: null }, OFFSET, NOW), []);
  assert.deepEqual(wantedReminders({ state: 'ended', next_check: null }, OFFSET, NOW), []);
});

test('a check is running: no schedule, even with home_by ahead', () => {
  for (const state of ['asking', 'waiting', 'escalating', 'acknowledged']) {
    assert.deepEqual(wantedReminders({ state, next_check: null, home_by: server(NOW + 1000) }, OFFSET, NOW), [], state);
  }
});

test('identical for the ok and the duress follow-up view', () => {
  // The server gives the same view after both (twin tests). Same input, same output, with no other input.
  const afterOk = { state: 'armed', screen: 'thanks', deadline: null, ping_at: null, next_check: server(NOW + 900_000), home_by: server(NOW + 9e6) };
  const afterDuress = { ...afterOk };
  assert.deepEqual(wantedReminders(afterDuress, OFFSET, NOW), wantedReminders(afterOk, OFFSET, NOW));
  assert.equal(wantedReminders(afterOk, OFFSET, NOW).length, 2);
});
