// Run with: node --test src/services/geo.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { arrowRotation, bearingDegrees, compassWord, distanceMetres, formatDistance, smoothAngle } from './geo.ts';

const toronto = { lat: 43.6532, lng: -79.3832 };
const ottawa = { lat: 45.4215, lng: -75.6972 };
const london = { lat: 51.5074, lng: -0.1278 };
const paris = { lat: 48.8566, lng: 2.3522 };

test('distance: Toronto to Ottawa is about 351 km', () => {
  assert.ok(Math.abs(distanceMetres(toronto, ottawa) - 351_000) < 3_000);
});

test('distance: London to Paris is about 344 km, the same both ways', () => {
  const d = distanceMetres(london, paris);
  assert.ok(Math.abs(d - 344_000) < 3_000);
  assert.equal(d, distanceMetres(paris, london));
});

test('distance: the same point is 0', () => {
  assert.equal(distanceMetres(toronto, toronto), 0);
});

test('distance: 0.001 degrees of latitude is about 111 m', () => {
  const d = distanceMetres(toronto, { lat: toronto.lat + 0.001, lng: toronto.lng });
  assert.ok(Math.abs(d - 111.2) < 1);
});

test('bearing: due north, east, south, west', () => {
  const o = { lat: 0, lng: 0 };
  assert.equal(Math.round(bearingDegrees(o, { lat: 1, lng: 0 })), 0);
  assert.equal(Math.round(bearingDegrees(o, { lat: 0, lng: 1 })), 90);
  assert.equal(Math.round(bearingDegrees(o, { lat: -1, lng: 0 })), 180);
  assert.equal(Math.round(bearingDegrees(o, { lat: 0, lng: -1 })), 270);
});

test('bearing: known city pairs', () => {
  assert.ok(Math.abs(bearingDegrees(toronto, ottawa) - 54) < 3); // north-east
  assert.ok(Math.abs(bearingDegrees(london, paris) - 148) < 3); // south-east
  assert.ok(Math.abs(bearingDegrees(paris, london) - 328) < 3); // north-west
});

test('bearing: stays in 0 up to 360, and the same point gives 0', () => {
  const b = bearingDegrees({ lat: 10, lng: 10 }, { lat: 10, lng: 9.9999 });
  assert.ok(b >= 0 && b < 360);
  assert.equal(bearingDegrees(toronto, toronto), 0);
});

test('arrow: wraps around 0 and 360', () => {
  assert.equal(arrowRotation(10, 350), 20);
  assert.equal(arrowRotation(350, 10), 340);
  assert.equal(arrowRotation(0, 0), 0);
  assert.equal(arrowRotation(90, 90), 0);
  assert.equal(arrowRotation(0, 90), 270);
  assert.equal(arrowRotation(360, 0), 0);
});

test('compass words at the edges of each sector', () => {
  assert.equal(compassWord(0), 'N');
  assert.equal(compassWord(359), 'N');
  assert.equal(compassWord(22), 'N');
  assert.equal(compassWord(23), 'NE');
  assert.equal(compassWord(90), 'E');
  assert.equal(compassWord(180), 'S');
  assert.equal(compassWord(270), 'W');
  assert.equal(compassWord(315), 'NW');
  assert.equal(compassWord(337), 'NW');
  assert.equal(compassWord(338), 'N');
  assert.equal(compassWord(-45), 'NW');
});

test('smoothing takes the short way round 0/360', () => {
  assert.equal(smoothAngle(350, 10, 0.5), 0);
  assert.equal(smoothAngle(10, 350, 0.5), 0);
  assert.equal(smoothAngle(0, 90, 0.5), 45);
  assert.equal(smoothAngle(100, 100, 0.3), 100);
  assert.equal(smoothAngle(0, 90, 1), 90);
  assert.equal(smoothAngle(0, 90, 0), 0);
});

test('distance text', () => {
  assert.equal(formatDistance(0), '0 m');
  assert.equal(formatDistance(42.4), '42 m');
  assert.equal(formatDistance(999.4), '999 m');
  assert.equal(formatDistance(999.6), '1.0 km');
  assert.equal(formatDistance(1500), '1.5 km');
});
