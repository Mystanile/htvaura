import * as SecureStore from 'expo-secure-store';

export type DemoSession = { url: string; token: string };

export async function loadSession(): Promise<DemoSession | null> {
  const saved = await SecureStore.getItemAsync('safekeeps-session');
  return saved ? JSON.parse(saved) : null;
}

export async function saveSession(session: DemoSession) {
  await SecureStore.setItemAsync('safekeeps-session', JSON.stringify(session));
}
