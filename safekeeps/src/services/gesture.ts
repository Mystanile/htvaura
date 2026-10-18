// Decodes the KAZE check-in gestures on the phone. One short tap is ok. The band asks for 3 taps instead,
// because its button is easy to press by accident (Hardware/kaze_band/HARDWARE.md). Duress is the same on both.
// Pure state machine. Feed it press-in and press-out times (ms) and call tick() now and then.
// Every call returns 'ok', 'duress' or null (nothing yet). It never reads the clock or sets timers.
export type GestureResult = 'ok' | 'duress' | null;

export const HOLD_MS = 1000; // a press this long (or longer) is a hold, not a tap
export const DURESS_WINDOW_MS = 2500; // time after a hold for the two duress taps (or for "nothing" = ok)

export function createGestureDecoder() {
  let pressedAt: number | null = null;
  let armedUntil: number | null = null; // set after a hold
  let duressTaps = 0;

  function clear() {
    pressedAt = null; armedUntil = null; duressTaps = 0;
  }
  function finish(result: 'ok' | 'duress') {
    clear();
    return result;
  }
  // A hold with no follow-up taps becomes ok.
  function expire(t: number): GestureResult {
    if (armedUntil !== null && t > armedUntil) { armedUntil = null; duressTaps = 0; return 'ok'; }
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
      if (held >= HOLD_MS) { armedUntil = t + DURESS_WINDOW_MS; duressTaps = 0; return late; }
      if (armedUntil !== null) return ++duressTaps >= 2 ? finish('duress') : late;
      return late ?? finish('ok');
    },
    // Call at (or after) nextCheckAt(). Returns 'ok' when a hold timed out.
    tick(t: number): GestureResult {
      return expire(t);
    },
    // The time tick() will next have something to do, or null. Lets the UI set one timeout.
    nextCheckAt(): number | null {
      return armedUntil !== null ? armedUntil + 1 : null;
    },
    reset: clear,
  };
}
