// Run with: node --test src/services/gesture.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGestureDecoder, type GestureResult } from './gesture.ts';

// Presses (down, up) at time t. Returns what the release gave.
function press(d: ReturnType<typeof createGestureDecoder>, t: number, length = 80) {
  const down = d.pressIn(t);
  assert.equal(down, null);
  return d.pressOut(t + length);
}
function results(...r: GestureResult[]) {
  return r;
}

test('3 short taps within 1.5 s -> ok (row 1)', () => {
  const d = createGestureDecoder();
  assert.deepEqual(results(press(d, 0), press(d, 300), press(d, 600)), [null, null, 'ok']);
});

test('3 taps can be slower than 1.5 s overall as long as each gap is under 1.5 s (same as the band)', () => {
  const d = createGestureDecoder();
  assert.deepEqual(results(press(d, 0), press(d, 1200), press(d, 2400)), [null, null, 'ok']);
});

test('hold 1 s then 2 short taps within 2.5 s -> duress (row 2)', () => {
  const d = createGestureDecoder();
  assert.equal(press(d, 0, 1000), null);
  assert.equal(press(d, 1400), null);
  assert.equal(press(d, 1900), 'duress');
  assert.equal(d.nextCheckAt(), null);
});

test('second duress tap right at the end of the window still counts', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000); // released at 1000, window ends at 3500
  press(d, 1500);
  assert.equal(press(d, 3420), 'duress'); // released at 3500
});

test('hold then nothing -> ok after 2.5 s, not before (row 3)', () => {
  const d = createGestureDecoder();
  assert.equal(press(d, 0, 1500), null); // released at 1500
  assert.equal(d.nextCheckAt(), 4001);
  assert.equal(d.tick(2000), null);
  assert.equal(d.tick(4000), null);
  assert.equal(d.tick(4001), 'ok');
  assert.equal(d.tick(5000), null); // only once
  assert.equal(d.nextCheckAt(), null);
});

test('hold then one tap then nothing -> ok after the window', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000);
  assert.equal(press(d, 1200), null);
  assert.equal(d.tick(3501), 'ok');
});

test('1 or 2 taps then nothing -> nothing, count resets after 1.5 s (row 4)', () => {
  const d = createGestureDecoder();
  press(d, 0);
  press(d, 300); // last release at 380
  assert.equal(d.nextCheckAt(), 380 + 1500 + 1);
  assert.equal(d.tick(1000), null);
  assert.equal(d.tick(2000), null);
  assert.equal(d.nextCheckAt(), null);
  // a late third tap is a fresh first tap, not a third
  assert.equal(press(d, 2100), null);
  assert.equal(press(d, 2400), null);
  assert.equal(press(d, 2700), 'ok');
});

test('a tap after the gap with no tick in between starts a new count', () => {
  const d = createGestureDecoder();
  press(d, 0);
  press(d, 300);
  assert.equal(press(d, 2000), null); // gap too long: this is tap 1
  assert.equal(press(d, 2300), null);
  assert.equal(press(d, 2600), 'ok');
});

test('taps too slow never make ok', () => {
  const d = createGestureDecoder();
  for (let i = 0; i < 6; i++) assert.equal(press(d, i * 2000), null);
  assert.equal(d.nextCheckAt(), 5 * 2000 + 80 + 1501);
});

test('hold just under 1 s is a short tap', () => {
  const d = createGestureDecoder();
  assert.equal(press(d, 0, 999), null);
  assert.equal(d.nextCheckAt(), 999 + 1501); // counted as a tap, not a hold
  assert.equal(press(d, 1100, 999), null);
  assert.equal(press(d, 2200, 999), 'ok');
});

test('hold of exactly 1 s is a hold', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000);
  assert.equal(d.nextCheckAt(), 1000 + 2500 + 1);
});

test('a third duress tap cannot happen: duress ends the gesture and the next tap starts fresh', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000);
  press(d, 1200);
  assert.equal(press(d, 1500), 'duress');
  assert.equal(press(d, 1800), null); // fresh tap 1
  assert.equal(d.nextCheckAt(), 1880 + 1501);
});

test('extra taps after ok start a new count', () => {
  const d = createGestureDecoder();
  press(d, 0);
  press(d, 200);
  assert.equal(press(d, 400), 'ok');
  assert.equal(press(d, 600), null);
  assert.equal(press(d, 800), null);
  assert.equal(press(d, 1000), 'ok');
});

test('4 quick taps give one ok, then 1 leftover tap', () => {
  const d = createGestureDecoder();
  assert.deepEqual(results(press(d, 0), press(d, 200), press(d, 400), press(d, 600)), [null, null, 'ok', null]);
});

test('a hold in the middle of ok taps drops the ok count', () => {
  const d = createGestureDecoder();
  press(d, 0);
  press(d, 200);
  press(d, 400, 1000); // hold
  assert.equal(press(d, 1800), null); // duress tap 1, not ok tap 3
});

test('a second hold re-arms the duress window', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000); // window to 3500
  press(d, 3000, 1000); // released at 4000, window to 6500
  press(d, 4200);
  assert.equal(press(d, 4600), 'duress');
});

test('a press after an unanswered hold gives ok once, and that press is a first tap', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000); // window ends at 3500
  assert.equal(d.pressIn(5000), 'ok');
  assert.equal(d.pressOut(5080), null);
  assert.equal(press(d, 5300), null);
  assert.equal(press(d, 5500), 'ok'); // taps 2 and 3 on top of the one at 5080
});

test('a release with no press-in is ignored; reset clears everything', () => {
  const d = createGestureDecoder();
  assert.equal(d.pressOut(100), null);
  press(d, 200);
  press(d, 400);
  d.reset();
  assert.equal(d.nextCheckAt(), null);
  assert.equal(press(d, 600), null);
});
