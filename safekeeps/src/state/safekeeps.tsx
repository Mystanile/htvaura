import { createContext, use, useCallback, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState, Platform } from 'react-native';

import { onNight } from '@/services/band-relay';
import { api, fetchNight, fetchState, type Night, type NightConfig, type Snapshot } from '@/services/demo-api';
import { loadSession, saveSession, type DemoSession } from '@/services/demo-session';

function useSafekeepsState() {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [data, setData] = useState<Snapshot | null>(null);
  const [night, setNight] = useState<Night | null>(null);
  const [serverOffset, setServerOffset] = useState(0);
  const [hydrating, setHydrating] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const version = useRef(0);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(15);
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

  // serverOffset = server clock minus phone clock, so screens can show countdowns from view.deadline
  const applyNight = useCallback((next: Night) => {
    setNight(next);
    setServerOffset(next.now * 1000 - Date.now());
    onNight(next); // the band relay reuses this view instead of fetching again
  }, []);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!session || lock.current) return;
    const currentVersion = version.current;
    try {
      const [next, nextNight] = await Promise.all([fetchState(session, signal), fetchNight(session, signal)]);
      if (!signal?.aborted && currentVersion === version.current) {
        setData(next);
        applyNight(nextNight);
        setConnectionError(null);
      }
    } catch (e) {
      if (!signal?.aborted && currentVersion === version.current) setConnectionError((e as Error).message);
    }
  }, [session, applyNight]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Platform.OS === 'web' || AppState.currentState !== 'background') await refresh(controller.signal);
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

  // Night actions: send the request, then reload both /state and /night.
  async function postNight(path: string, body: object = {}) {
    return mutate(async () => {
      if (!session) throw new Error('Create a profile first.');
      await api<{ ok?: boolean }>(session.url, path, session.token, body);
      const [next, nextNight] = await Promise.all([fetchState(session), fetchNight(session)]);
      setData(next);
      applyNight(nextNight);
      setNow(Date.now());
    });
  }

  // A finished gesture is never dropped: if the send fails (busy lock, network), try again about every
  // 700 ms for about 10 s. Lives here so it keeps going if the screen is left.
  async function sendNightEventRetry(type: string) {
    const start = Date.now(); // a time budget, not a try count: a hanging request can take 8 s or more
    do {
      if (await postNight('/night/events', { type })) return true;
      await new Promise(resolve => setTimeout(resolve, 700));
    } while (Date.now() - start < 10_000);
    return false;
  }

  const lastCheckIn = data?.me.lastCheckIn ?? null;
  const minutesRemaining = Math.max(0, Math.ceil(((lastCheckIn ?? startedAt) + intervalMinutes * 60_000 - now) / 60_000));
  return {
    session, me: data?.me, friends: data?.friends ?? [], incoming: data?.incoming ?? [],
    friendRequests: data?.friendRequests ?? [], sentRequests: data?.sentRequests ?? [],
    hydrating, loading: !!session && !data, error: error ?? connectionError, busy, refresh, startGuest, reconnect,
    lastCheckIn, remindersEnabled, setRemindersEnabled, intervalMinutes, setIntervalMinutes, minutesRemaining,
    night, serverOffset, now,
    startNight: (config: NightConfig) => postNight('/night', config),
    sendNightEvent: (type: string, extra: object = {}) => postNight('/night/events', { type, ...extra }),
    sendNightEventRetry,
    ackAlert: (ownerId: string) => postNight('/alerts/' + encodeURIComponent(ownerId) + '/ack'),
    resolveAlert: (ownerId: string) => postNight('/alerts/' + encodeURIComponent(ownerId) + '/resolve'),
    recordCheckIn: () => post('/check-ins'),
    addFriend: (code: string, name = '') => post('/friends', { code, name }),
    acceptFriend: (id: string, name = '') => post('/friend-requests/' + encodeURIComponent(id) + '/accept', { name }),
    declineFriend: (id: string) => post('/friend-requests/' + encodeURIComponent(id) + '/decline'),
    renameFriend: (id: string, name: string) => post('/friends/' + encodeURIComponent(id) + '/name', { name }),
    removeFriend: (id: string) => post('/friends/' + encodeURIComponent(id) + '/remove'),
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
