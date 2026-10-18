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

test('one short tap -> ok', () => {
  const d = createGestureDecoder();
  assert.equal(press(d, 0), 'ok');
  assert.equal(d.nextCheckAt(), null);
});

test('every tap is its own ok', () => {
  const d = createGestureDecoder();
  assert.deepEqual(results(press(d, 0), press(d, 200), press(d, 400)), ['ok', 'ok', 'ok']);
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

test('hold just under 1 s is a short tap', () => {
  const d = createGestureDecoder();
  assert.equal(press(d, 0, 999), 'ok');
});

test('hold of exactly 1 s is a hold', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000);
  assert.equal(d.nextCheckAt(), 1000 + 2500 + 1);
});

test('a third duress tap cannot happen: duress ends the gesture and the next tap is a fresh ok', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000);
  press(d, 1200);
  assert.equal(press(d, 1500), 'duress');
  assert.equal(press(d, 1800), 'ok');
});

test('a second hold re-arms the duress window', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000); // window to 3500
  press(d, 3000, 1000); // released at 4000, window to 6500
  press(d, 4200);
  assert.equal(press(d, 4600), 'duress');
});

test('a press after an unanswered hold gives the late ok, then its own (a press could start a new hold)', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000); // window ends at 3500
  assert.equal(d.pressIn(5000), 'ok');
  assert.equal(d.pressOut(5080), 'ok');
});

test('a hold that runs out while the next tap is down gives one ok', () => {
  const d = createGestureDecoder();
  press(d, 0, 1000); // window ends at 3500
  assert.equal(d.pressIn(3400), null);
  assert.equal(d.pressOut(3600), 'ok');
  assert.equal(d.nextCheckAt(), null);
});

test('a release with no press-in is ignored; reset clears everything', () => {
  const d = createGestureDecoder();
  assert.equal(d.pressOut(100), null);
  press(d, 200, 1000);
  d.reset();
  assert.equal(d.nextCheckAt(), null);
  assert.equal(press(d, 1400), 'ok');
});

