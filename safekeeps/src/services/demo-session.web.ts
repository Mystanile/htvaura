export type DemoSession = { url: string; token: string };

export async function loadSession(): Promise<DemoSession | null> {
  const saved = sessionStorage.getItem('safekeeps-session');
  return saved ? JSON.parse(saved) : null;
}

export async function saveSession(session: DemoSession) {
  sessionStorage.setItem('safekeeps-session', JSON.stringify(session));
}
