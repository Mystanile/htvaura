// "Location updated N min ago" for a server time. Run the tests with: node --test src/services/age.test.ts

// at and now are server Unix seconds. null when there is no time to show.
export function locationAgeText(at: number | null | undefined, now: number): string | null {
  if (at == null) return null;
  const minutes = Math.floor((now - at) / 60);
  return minutes < 1 ? 'Location updated just now' : `Location updated ${minutes} min ago`;
}
