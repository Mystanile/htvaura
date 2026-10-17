// Run with: node --test src/services/band.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { askKey, decodeEvent, encodeByte, median, shouldPingBand, trend, zone, type Sample } from './band.ts';

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

test('askKey is the deadline while asking, null in every other state', () => {
  assert.equal(askKey({ state: 'asking', deadline: 1700 }), 1700);
  for (const state of ['armed', 'waiting', 'escalating', 'acknowledged', 'ended'] as const) {
    assert.equal(askKey({ state, deadline: 1700 }), null);
  }
  assert.equal(askKey({ state: 'asking', deadline: null }), null);
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

test('zone boundaries: -55 and -80 are close', () => {
  assert.equal(zone(-41), 'here');
  assert.equal(zone(-54), 'here');
  assert.equal(zone(-55), 'close');
  assert.equal(zone(-75), 'close');
  assert.equal(zone(-80), 'close');
  assert.equal(zone(-81), 'range');
  assert.equal(zone(-88), 'range');
});

test('trend: warmer, colder, steady', () => {
  const now = 10_000;
  const rising = [at(6500, -80), at(7500, -80), at(8500, -70), at(9500, -70)];
  assert.equal(trend(rising, now), 'warmer');
  assert.equal(trend(rising.map(s => at(s.t, -s.rssi - 150)), now), 'colder'); // mirrored: -70 then -80
});

test('trend: 3 dB dead band, 4 dB moves', () => {
  const now = 10_000;
  const step = (from: number, to: number) => [at(7000, from), at(9000, to)];
  assert.equal(trend(step(-70, -67), now), 'steady'); // +3
  assert.equal(trend(step(-70, -73), now), 'steady'); // -3
  assert.equal(trend(step(-70, -66), now), 'warmer'); // +4
  assert.equal(trend(step(-70, -74), now), 'colder'); // -4
});

test('trend: steady when either half is empty', () => {
  assert.equal(trend([], 10_000), 'steady');
  assert.equal(trend([at(9000, -50)], 10_000), 'steady'); // nothing before
  assert.equal(trend([at(7000, -50)], 10_000), 'steady'); // nothing recent
  assert.equal(trend([at(5000, -50), at(9000, -40)], 10_000), 'steady'); // before is older than 4 s
});
