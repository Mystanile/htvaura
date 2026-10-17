// Pure: which local notifications the user's own phone should have scheduled. Run the tests with:
// node --test src/services/reminders.test.ts
// Only the user's own view goes in. It is the same after duress and after ok, so the result is too.

export type Reminder = { id: 'next-check' | 'home-by'; at: number }; // at: phone clock, ms

type OwnView = { state: string; next_check?: number | null; home_by?: number } | null | undefined;

// serverOffset = server clock minus phone clock, in ms (see check-in-card). Times in the past are left out.
export function wantedReminders(view: OwnView, serverOffset: number, nowMs: number): Reminder[] {
  if (!view || view.state !== 'armed') return []; // a check is running (the screen asks) or the night is over
  const list: Reminder[] = [];
  if (view.next_check != null) list.push({ id: 'next-check', at: view.next_check * 1000 - serverOffset });
  if (view.home_by != null) list.push({ id: 'home-by', at: view.home_by * 1000 - serverOffset });
  return list.filter(r => r.at > nowMs);
}
