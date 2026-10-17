// Pure helpers for the "Be home by" field. Run the tests with: node --test src/services/home-by.test.ts

// "23:30" or "9:05" gives { h, m }. Anything else gives null.
export function parseClock(text: string): { h: number; m: number } | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  return h < 24 && m < 60 ? { h, m } : null;
}

// The next local time (ms) that shows h:m. Today if it is still ahead, else tomorrow. Exactly now counts as tomorrow.
export function nextAt(h: number, m: number, nowMs: number): number {
  const at = new Date(nowMs);
  at.setHours(h, m, 0, 0);
  if (at.getTime() <= nowMs) at.setDate(at.getDate() + 1);
  return at.getTime();
}

// A local time (ms) as "23:30".
export function clockText(ms: number): string {
  const at = new Date(Math.round(ms / 60_000) * 60_000); // the server time is a few ms off the clock time: round, never floor
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
}
