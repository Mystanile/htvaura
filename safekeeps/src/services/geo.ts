// Pure map maths for "Find them". No clock, no sensors. Angles are in degrees, distances in metres.
export type LatLng = { lat: number; lng: number };

const EARTH_RADIUS_M = 6_371_000;
const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (radians: number) => (radians * 180) / Math.PI;

// Any angle to the range 0 up to (not including) 360.
export function normalize(angle: number) {
  return ((angle % 360) + 360) % 360;
}

// Straight-line distance over the ground (haversine).
export function distanceMetres(a: LatLng, b: LatLng) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Compass direction from a to b: 0 is north, 90 is east. Same point gives 0.
export function bearingDegrees(a: LatLng, b: LatLng) {
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dLng);
  return normalize(deg(Math.atan2(y, x)));
}

// How far to turn the arrow on screen. Up is straight ahead, so the arrow turns by (bearing - heading).
export function arrowRotation(bearing: number, heading: number) {
  return normalize(bearing - heading);
}

const WORDS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export function compassWord(bearing: number) {
  return WORDS[Math.round(normalize(bearing) / 45) % 8];
}

// Moves prev toward next by a fraction k (0 to 1) along the short way round, so 359 to 1 does not spin.
export function smoothAngle(prev: number, next: number, k: number) {
  const diff = ((next - prev + 540) % 360) - 180;
  return normalize(prev + diff * k);
}

export function formatDistance(metres: number) {
  const rounded = Math.round(metres);
  return rounded < 1000 ? `${rounded} m` : `${(metres / 1000).toFixed(1)} km`;
}
