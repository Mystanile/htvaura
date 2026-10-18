// Run with: node --test src/services/band.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { askKey, decodeEvent, encodeByte, keepPending, median, nextNear, noNight, shouldPingBand, type Sample } from './band.ts';

const b64 = (byte: number) => Buffer.from([byte]).toString('base64');
const at = (t: number, rssi: number): Sample => ({ t, rssi });

test('event bytes decode: 0x01 ok, 0x02 duress, 0x03 heartbeat', () => {
  assert.equal(decodeEvent(b64(1)), 'ConfirmOk');
  assert.equal(decodeEvent(b64(2)), 'Duress');
  assert.equal(decodeEvent(b64(3)), 'heartbeat');
});

test('0x00, unknown bytes, empty and bad input decode to null', () => {
  for (const byte of [0, 4, 0x10, 0x81, 0xff]) assert.equal(decodeEvent(b64(byte)), null);
  assert.equal(decodeEvent(''), null);
  assert.equal(decodeEvent(null), null);
  assert.equal(decodeEvent(undefined), null);
  assert.equal(decodeEvent('!!=='), null);
});

test('encodeByte matches real base64 for every byte', () => {
  assert.equal(encodeByte(1), 'AQ==');
  for (let byte = 0; byte < 256; byte++) {
    assert.equal(encodeByte(byte), b64(byte));
    assert.equal(decodeEvent(encodeByte(byte)) !== null, byte >= 1 && byte <= 3);
  }
});

test('askKey is set while asking and waiting, null in every other state', () => {
  assert.notEqual(askKey({ state: 'asking', deadline: 1700 }), null);
  assert.notEqual(askKey({ state: 'waiting', deadline: 1715 }), null);
  for (const state of ['armed', 'escalating', 'acknowledged', 'ended'] as const) {
    assert.equal(askKey({ state, deadline: 1700 }), null);
  }
  assert.equal(askKey({ state: 'asking', deadline: null }), null);
  assert.equal(askKey({ state: 'waiting', deadline: null }), null);
});

test('askKey: the waiting stage is a new key, so the band asks again', () => {
  assert.notEqual(askKey({ state: 'asking', deadline: 1700 }), askKey({ state: 'waiting', deadline: 1700 }));
  assert.notEqual(askKey({ state: 'asking', deadline: 1700 }), askKey({ state: 'waiting', deadline: 1715 }));
  assert.equal(askKey({ state: 'waiting', deadline: 1715 }), askKey({ state: 'waiting', deadline: 1715 }));
});

test('keepPending: ok and duress both last 60 s, so a late delivery cannot tell them apart', () => {
  const at = 1_000_000;
  for (const age of [0, 60_001, 120_000, 3_600_000, 3_600_001]) {
    assert.equal(keepPending({ type: 'ConfirmOk', at }, at + age), keepPending({ type: 'Duress', at }, at + age), `age ${age}`);
  }
  assert.equal(keepPending({ type: 'ConfirmOk', at }, at + 60_000), true);
  assert.equal(keepPending({ type: 'ConfirmOk', at }, at + 60_001), false);
});

test('shouldPingBand: new and recent only', () => {
  assert.equal(shouldPingBand(null, null, 1000), false);
  assert.equal(shouldPingBand(undefined, null, 1000), false);
  assert.equal(shouldPingBand(990, null, 1000), true); // first ping seen, 10 s old
  assert.equal(shouldPingBand(990, 990, 1000), false); // already handled
  assert.equal(shouldPingBand(990, 995, 1000), false); // older than the handled one
  assert.equal(shouldPingBand(995, 990, 1000), true); // newer than the handled one
  assert.equal(shouldPingBand(970, null, 1000), true); // exactly 30 s old
  assert.equal(shouldPingBand(969, null, 1000), false); // stale: never after app start
});

test('median: empty input is null, odd and even counts, last 4 s only', () => {
  assert.equal(median([], 10_000), null);
  assert.equal(median([at(9000, -60), at(9500, -90), at(9900, -70)], 10_000), -70);
  assert.equal(median([at(9000, -60), at(9500, -70)], 10_000), -65);
  // a spike does not move it, and a sample older than 4 s is ignored
  assert.equal(median([at(5000, -30), at(7000, -80), at(8000, -81), at(9000, -20), at(9500, -79)], 10_000), -79.5);
  assert.equal(median([at(6000, -50)], 10_000), null); // exactly 4 s old is out
  assert.equal(median([at(6001, -50)], 10_000), -50);
});

test('nextNear: enter only when stronger than -60', () => {
  assert.equal(nextNear(false, -41), true); // right beside, from the venue table
  assert.equal(nextNear(false, -59.5), true);
  assert.equal(nextNear(false, -60), false); // boundary: not stronger
  assert.equal(nextNear(false, -64), false); // in the gap, stays out
  assert.equal(nextNear(false, -75), false); // 1 m at the venue is noise
});

test('nextNear: once near, stay until weaker than -68', () => {
  assert.equal(nextNear(true, -50), true);
  assert.equal(nextNear(true, -64), true); // in the gap, stays in
  assert.equal(nextNear(true, -68), true); // boundary: not weaker
  assert.equal(nextNear(true, -68.5), false);
  assert.equal(nextNear(true, -82), false);
});

test('nextNear: fewer than 3 readings never enter, but do not throw out a near state', () => {
  assert.equal(nextNear(false, -55, 1), false); // one strong reading at a slow scan rate
  assert.equal(nextNear(false, -55, 2), false);
  assert.equal(nextNear(false, -55, 3), true);
  assert.equal(nextNear(true, -55, 1), true); // already near: a sparse window keeps it
});

test('nextNear: no reading resets it', () => {
  assert.equal(nextNear(true, null), false);
  assert.equal(nextNear(false, null), false);
});

test('nextNear on the median: a single strong spike does not enter, a jittery near signal does not leave', () => {
  const now = 10_000;
  let near = nextNear(false, median([at(7000, -80), at(8000, -78), at(9000, -40)], now)); // median -78
  assert.equal(near, false);
  near = nextNear(near, median([at(8000, -42), at(9000, -45), at(9500, -80)], now)); // median -45
  assert.equal(near, true);
  near = nextNear(near, median([at(8000, -66), at(9000, -50), at(9500, -67)], now)); // median -66, in the gap
  assert.equal(near, true);
  near = nextNear(near, median([at(8000, -75), at(9000, -79), at(9500, -50)], now)); // median -75
  assert.equal(near, false);
});

test('noNight: only 404 drops a band event, everything else is retried', () => {
  assert.equal(noNight(404), true);
  for (const status of [null, undefined, 400, 401, 409, 422, 500, 503]) assert.equal(noNight(status), false, String(status));
});

test('literal base64 strings the band sends', () => {
  assert.deepEqual(['AA==', 'AQ==', 'Ag==', 'Aw==', 'BA=='].map(decodeEvent), [null, 'ConfirmOk', 'Duress', 'heartbeat', null]);
  assert.equal(decodeEvent('AQ'), 'ConfirmOk'); // padding is not needed
});

test('short or garbage base64 never throws and gives null', () => {
  for (const bad of ['A', '=', '==', '=A', 'A=', ' ', 'éé', '-_', 'not base64 at all!']) {
    assert.equal(decodeEvent(bad), null, JSON.stringify(bad));
  }
});

test('askKey: a deadline of 0 is still a key, a new deadline is a new key', () => {
  assert.notEqual(askKey({ state: 'asking', deadline: 0 }), null);
  assert.notEqual(askKey({ state: 'asking', deadline: 1700 }), askKey({ state: 'asking', deadline: 1760 }));
});

test('shouldPingBand: a first ping at time 0 handled, then a repeat is ignored', () => {
  assert.equal(shouldPingBand(5, 0, 6), true);
  assert.equal(shouldPingBand(0, 0, 1), false);
});
