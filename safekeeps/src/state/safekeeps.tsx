import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { api, fetchState, type Snapshot } from '@/services/demo-api';
import { loadSession, saveSession, type DemoSession } from '@/services/demo-session';

function useSafekeepsState() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const version = useRef(0);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [startedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    let active = true;
    loadSession().then(saved => { if (active) setSession(saved); })
      .catch(() => { if (active) setError('Could not restore your profile. Reopen the app to retry.'); })
      .finally(() => { if (active) setHydrating(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!session || lock.current) return;
    const currentVersion = version.current;
    try {
      const next = await fetchState(session, signal);
      if (!signal?.aborted && currentVersion === version.current) {
        setData(next);
        setConnectionError(null);
      }
    } catch (e) {
      if (!signal?.aborted && currentVersion === version.current) setConnectionError((e as Error).message);
    }
  }, [session]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (AppState.currentState !== 'background') await refresh(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(poll, 2500);
    };
    void poll();
    const subscription = AppState.addEventListener('change', status => {
      if (status === 'active') void refresh(controller.signal);
    });
    return () => { controller.abort(); clearTimeout(timer); subscription.remove(); };
  }, [session, refresh]);

  async function mutate(action: () => Promise<void>) {
    if (lock.current) return false;
    lock.current = true;
    version.current++;
    setBusy(true);
    setError(null);
    try {
      await action();
      setConnectionError(null);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      version.current++;
      lock.current = false;
      setBusy(false);
    }
  }

  async function startGuest(url: string) {
    return mutate(async () => {
      const base = url.trim().replace(/\/+$/, '');
      if (!/^https?:\/\/[^/]+/.test(base)) throw new Error('Enter a server address starting with http:// or https://.');

      const result = await api<{ token: string; snapshot: Snapshot }>(base, '/guests', undefined, {});
      const next = { url: base, token: result.token };
      await saveSession(next);
      setData(result.snapshot);
      setSession(next);
    });
  }

  async function reconnect(url: string) {
    return mutate(async () => {
      if (!session) throw new Error('Create a profile first.');
      const base = url.trim().replace(/\/+$/, '');
      if (!/^https?:\/\/[^/]+/.test(base)) throw new Error('Enter a server address starting with http:// or https://.');
      const next = { ...session, url: base };
      const snapshot = await fetchState(next);
      await saveSession(next);
      setData(snapshot);
      setSession(next);
    });
  }

  async function post(path: string, body: object = {}) {
    return mutate(async () => {
      if (!session) throw new Error('Create a profile first.');
      setData(await api<Snapshot>(session.url, path, session.token, body));
      setNow(Date.now());
    });
  }

  const lastCheckIn = data?.me.lastCheckIn ?? null;
  const minutesRemaining = Math.max(0, Math.ceil(((lastCheckIn ?? startedAt) + intervalMinutes * 60_000 - now) / 60_000));
  return {
    session, me: data?.me, friends: data?.friends ?? [], incoming: data?.incoming ?? [],
    hydrating, loading: !!session && !data, error: error ?? connectionError, busy, refresh, startGuest, reconnect,
    lastCheckIn, remindersEnabled, setRemindersEnabled, intervalMinutes, setIntervalMinutes, minutesRemaining,
    recordCheckIn: () => post('/check-ins'),
    addFriend: (code: string) => post('/friends', { code }),
    requestCheckIn: (id: string) => post('/friends/' + encodeURIComponent(id) + '/requests'),
  };
}

const SafekeepsContext = createContext<ReturnType<typeof useSafekeepsState> | null>(null);
export function SafekeepsProvider({ children }: PropsWithChildren) {
  const state = useSafekeepsState();
  return <SafekeepsContext value={state}>{children}</SafekeepsContext>;
}
export function useSafekeeps() {
  const state = use(SafekeepsContext);
  if (!state) throw new Error('useSafekeeps requires SafekeepsProvider');
  return state;
}
export function formatCheckIn(timestamp: number | null) {
  return timestamp === null ? 'No check-ins yet' : new Date(timestamp).toLocaleString([], {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
