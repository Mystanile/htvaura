// Pure helpers for the KAZE band. Spec: Hardware/kaze_band/HARDWARE.md. No React, no Bluetooth, no clock reads.
import type { NightView } from './demo-api';

export const BAND_NAME = 'KAZE-Band';
export const SERVICE_UUID = '7f1a0001-6b4e-4c2a-9a7e-2d3c4b5a6f70';
export const EVENT_UUID = '7f1a0002-6b4e-4c2a-9a7e-2d3c4b5a6f70'; // band to phone, one byte per answer
export const PING_UUID = '7f1a0003-6b4e-4c2a-9a7e-2d3c4b5a6f70'; // phone to band, makes it beep
export const ASK_UUID = '7f1a0004-6b4e-4c2a-9a7e-2d3c4b5a6f70'; // phone to band, starts "are you okay?"

export type BandEvent = 'ConfirmOk' | 'Duress' | 'heartbeat';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// The first byte of a base64 string (all the band ever sends), as a number. null if it is not valid base64.
function firstByte(base64: string | null | undefined) {
  if (!base64 || base64.length < 2) return null;
  const a = ALPHABET.indexOf(base64[0]);
  const b = ALPHABET.indexOf(base64[1]);
  return a < 0 || b < 0 ? null : ((a << 2) | (b >> 4)) & 0xff;
}

// 0x00 (nothing yet) and any unknown byte give null.
export function decodeEvent(base64: string | null | undefined): BandEvent | null {
  const byte = firstByte(base64);
  return byte === 1 ? 'ConfirmOk' : byte === 2 ? 'Duress' : byte === 3 ? 'heartbeat' : null;
}

// One byte as base64, for writes to ask and ping. encodeByte(1) is 'AQ=='.
export function encodeByte(byte: number) {
  return ALPHABET[byte >> 2] + ALPHABET[(byte & 3) << 4] + '==';
}

// The ask is written once per key. The key is the state plus the deadline, so a new check gives a new key
// and the louder waiting stage asks the band again.
export function askKey(view: Pick<NightView, 'state' | 'deadline'>) {
  return (view.state === 'asking' || view.state === 'waiting') && view.deadline !== null ? `${view.state}:${view.deadline}` : null;
}

// A band answer the relay could not deliver, kept to try again. at is the phone time (ms) the band sent it.
export type PendingEvent = { type: 'ConfirmOk' | 'Duress'; at: number };
// Kept for 1 hour, the same for ok and duress: a delivered answer moves the friends' last check-in and can
// answer the check on screen, so a different time for each kind would tell them apart. The cost: a late ok can
// answer a newer check that is still asking.
const PENDING_MS = 60_000; // same for ok and duress; a late answer must never answer a newer check
export function keepPending(event: PendingEvent, nowMs: number) {
  return nowMs - event.at <= PENDING_MS;
}

const PING_FRESH_SECONDS = 30;
// All times are server Unix seconds. A ping is new when it is newer than the last one handled, and recent
// so that an old ping is never played after the app starts.
export function shouldPingBand(pingAt: number | null | undefined, lastHandled: number | null, now: number) {
  if (pingAt == null) return false;
  if (lastHandled !== null && pingAt <= lastHandled) return false;
  return now - pingAt <= PING_FRESH_SECONDS;
}

export type Sample = { t: number; rssi: number }; // t in ms
export type Zone = 'here' | 'close' | 'range';
export type Trend = 'warmer' | 'colder' | 'steady';

export const ZONE_TEXT: Record<Zone, string> = {
  here: "You're right next to them",
  close: 'Getting close',
  range: "They're somewhere nearby",
};

const WINDOW_MS = 4000;
const TREND_MS = 2000;
const DEAD_BAND_DB = 3;

function middle(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// Median RSSI of the samples in (from, to]. null if there are none.
function medianBetween(samples: Sample[], from: number, to: number) {
  return middle(samples.filter(s => s.t > from && s.t <= to).map(s => s.rssi));
}

// Median of the last 4 s, never a single reading.
export function median(samples: Sample[], now: number) {
  return medianBetween(samples, now - WINDOW_MS, now);
}

export function zone(rssi: number): Zone {
  return rssi > -55 ? 'here' : rssi >= -80 ? 'close' : 'range';
}

// Last 2 s against the 2 s before. A change of 3 dB or less counts as steady.
export function trend(samples: Sample[], now: number): Trend {
  const recent = medianBetween(samples, now - TREND_MS, now);
  const before = medianBetween(samples, now - 2 * TREND_MS, now - TREND_MS);
  if (recent === null || before === null) return 'steady';
  const change = recent - before;
  return change > DEAD_BAND_DB ? 'warmer' : change < -DEAD_BAND_DB ? 'colder' : 'steady';
}
