import { createContext, use, useEffect, useState, type PropsWithChildren } from 'react';

export type Friend = {
  id: string;
  name: string;
  lastCheckIn: number | null;
  proximity: 'Out of range' | 'Nearby' | '30+ meters';
  requestedAt: number | null;
  alertedAt: number | null;
};

const initialFriends: Friend[] = [
  { id: 'emily', name: 'Emily', lastCheckIn: null, proximity: 'Out of range', requestedAt: null, alertedAt: null },
  { id: 'john', name: 'John', lastCheckIn: null, proximity: '30+ meters', requestedAt: null, alertedAt: null },
  { id: 'qinghua', name: 'QingHua', lastCheckIn: null, proximity: 'Nearby', requestedAt: null, alertedAt: null },
];

function useSafekeepsState() {
  const [friends, setFriends] = useState(initialFriends);
  const [lastCheckIn, setLastCheckIn] = useState<number | null>(null);
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [intervalMinutes, setIntervalMinutes] = useState(60);
  const [startedAt] = useState(Date.now);
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const minutesRemaining = Math.max(0, Math.ceil(
    ((lastCheckIn ?? startedAt) + intervalMinutes * 60_000 - now) / 60_000,
  ));

  function recordCheckIn() {
    const timestamp = Date.now();
    setLastCheckIn(timestamp);
    setNow(timestamp);
  }

  // Local demo events. Replace with a messaging service when a backend is connected.
  function requestCheckIn(id: string) {
    setFriends(current => current.map(friend =>
      friend.id === id ? { ...friend, requestedAt: Date.now() } : friend));
  }

  function recordDemoAlert(id: string) {
    setFriends(current => current.map(friend =>
      friend.id === id ? { ...friend, alertedAt: Date.now() } : friend));
  }

  return {
    friends, lastCheckIn, remindersEnabled, setRemindersEnabled,
    intervalMinutes, setIntervalMinutes, minutesRemaining,
    recordCheckIn, requestCheckIn, recordDemoAlert,
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
  return timestamp === null ? 'No check-ins yet' : new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit',
  });
}