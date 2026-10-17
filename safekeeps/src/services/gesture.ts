// Decodes the KAZE check-in gestures. Same rules as the band: Hardware/kaze_band/HARDWARE.md.
// Pure state machine. Feed it press-in and press-out times (ms) and call tick() now and then.
// Every call returns 'ok', 'duress' or null (nothing yet). It never reads the clock or sets timers.
export type GestureResult = 'ok' | 'duress' | null;

export const HOLD_MS = 1000; // a press this long (or longer) is a hold, not a tap
export const TAP_GAP_MS = 1500; // max time between ok taps before the count resets
export const DURESS_WINDOW_MS = 2500; // time after a hold for the two duress taps (or for "nothing" = ok)

export function createGestureDecoder() {
  let pressedAt: number | null = null;
  let okTaps = 0;
  let lastTapAt = 0;
  let armedUntil: number | null = null; // set after a hold
  let duressTaps = 0;

  function clear() {
    pressedAt = null; okTaps = 0; armedUntil = null; duressTaps = 0;
  }
  function finish(result: 'ok' | 'duress') {
    clear();
    return result;
  }
  // A hold with no follow-up taps becomes ok. Old ok taps are forgotten.
  function expire(t: number): GestureResult {
    if (armedUntil !== null && t > armedUntil) { armedUntil = null; duressTaps = 0; return 'ok'; }
    if (okTaps > 0 && t - lastTapAt > TAP_GAP_MS) okTaps = 0;
    return null;
  }

  return {
    pressIn(t: number): GestureResult {
      const late = expire(t);
      pressedAt = t;
      return late;
    },
    pressOut(t: number): GestureResult {
      const late = expire(t);
      if (pressedAt === null) return late;
      const held = t - pressedAt;
      pressedAt = null;
      if (held >= HOLD_MS) { armedUntil = t + DURESS_WINDOW_MS; duressTaps = 0; okTaps = 0; return late; }
      if (armedUntil !== null) return ++duressTaps >= 2 ? finish('duress') : late;
      lastTapAt = t;
      return ++okTaps >= 3 ? finish('ok') : late;
    },
    // Call at (or after) nextCheckAt(). Returns 'ok' when a hold timed out.
    tick(t: number): GestureResult {
      return expire(t);
    },
    // The time tick() will next have something to do, or null. Lets the UI set one timeout.
    nextCheckAt(): number | null {
      if (armedUntil !== null) return armedUntil + 1;
      return okTaps > 0 ? lastTapAt + TAP_GAP_MS + 1 : null;
    },
    reset: clear,
  };
}
