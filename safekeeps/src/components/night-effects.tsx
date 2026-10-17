import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, Platform, StyleSheet, Vibration, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { api } from '@/services/demo-api';
import { forgetCheckNow, REMINDER } from '@/services/check-now';
import { distanceMetres } from '@/services/geo';
import { wantedReminders } from '@/services/reminders';
import { useSafekeeps } from '@/state/safekeeps';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SEND_EVERY_MS = 30_000;
const SEND_AFTER_METRES = 25;
const RING_MS = 5000;

// Mounted once in the root layout. Does three things and shows nothing until a ping arrives.
export function NightEffects() {
  useLocationSender();
  useReminders();
  return <PingOverlay />;
}

// Decision 10: while a night runs and the app is open, send the position about every 30 s or after
// about 25 m. It uses api() directly and not mutate(), so it never takes the busy lock the gestures need.
function useLocationSender() {
  const { session, night } = useSafekeeps();
  const running = night?.view != null && night.view.state !== 'ended';
  const [foreground, setForeground] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => setForeground(status === 'active'));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!session || !running || !foreground) return;
    let stopped = false;
    let watcher: Location.LocationSubscription | undefined;
    let latest: { lat: number; lng: number } | null = null;
    let sent: { lat: number; lng: number } | null = null;
    const send = (point: { lat: number; lng: number }) => {
      sent = point;
      api(session.url, '/night/events', session.token, { type: 'LocationUpdate', ...point }).catch(() => {}); // the next send retries
    };
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Permission can arrive after the night starts (a slow answer to the prompt), so keep checking.
    const start = () => Location.getForegroundPermissionsAsync().then(async permission => {
      if (stopped) return;
      if (!permission.granted) { retry = setTimeout(start, 5000); return; }
      const next = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, distanceInterval: SEND_AFTER_METRES },
        position => {
          latest = { lat: position.coords.latitude, lng: position.coords.longitude };
          if (!sent || distanceMetres(sent, latest) >= SEND_AFTER_METRES) send(latest);
        },
      );
      if (stopped) next.remove(); else watcher = next;
    }).catch(() => {}); // no location available: the night still runs
    void start();
    const timer = setInterval(() => { if (latest) send(latest); }, SEND_EVERY_MS);
    return () => { stopped = true; watcher?.remove(); clearInterval(timer); clearTimeout(retry); };
  }, [session, running, foreground]);
}

// Local notifications, so the user's own checks reach a phone in a pocket. No push server: the phone
// schedules them itself from the user's own view. Every one has the same text, so a watcher who reads the
// lock screen learns nothing (no "Are you okay?", no buttons: a one-tap answer would skip the gesture).
const MOVED_MS = 5000; // the clock offset jitters a little with every poll: ignore small moves

// In the foreground the screen already asks, so show nothing there.
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: false, shouldPlaySound: false, shouldSetBadge: false }),
  });
}

function useReminders() {
  const { session, night, serverOffset, now } = useSafekeeps();
  const view = night?.view ?? null;
  const running = view != null && view.state !== 'ended';
  const [active, setActive] = useState(AppState.currentState === 'active');
  const scheduled = useRef(new Map<string, number>()); // id -> phone ms it is scheduled for
  const seenRunning = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve()); // one change at a time
  const run = (job: () => Promise<unknown>) => { queue.current = queue.current.then(job).catch(() => {}); }; // notifications are best effort
  useEffect(() => {
    const subscription = AppState.addEventListener('change', status => setActive(status === 'active'));
    return () => subscription.remove();
  }, []);

  // Ask for permission when a night starts, not at app launch.
  useEffect(() => {
    if (Platform.OS === 'web' || !session || !running) return;
    run(() => Notifications.requestPermissionsAsync());
  }, [session, running]);

  // Cancel everything when the night ends, the user leaves or logs out. Not while the app is still loading
  // (night is null then): a launch in the background must keep what is scheduled.
  const loaded = night !== null;
  useEffect(() => {
    if (session && running) { seenRunning.current = true; return; }
    if (Platform.OS === 'web' || !(loaded || seenRunning.current)) return;
    seenRunning.current = false;
    scheduled.current.clear();
    forgetCheckNow();
    run(async () => { await Notifications.cancelAllScheduledNotificationsAsync(); await Notifications.dismissAllNotificationsAsync(); });
  }, [session, running, loaded]);

  // The person opened the app: clear what is still on the lock screen.
  useEffect(() => {
    if (Platform.OS === 'web' || !active || !running) return;
    run(() => Notifications.dismissAllNotificationsAsync());
  }, [active, running]);

  // Keep the next check and the home-by time scheduled. Only change what moved (the view is polled every 2.5 s).
  const wanted = wantedReminders(view, serverOffset, now);
  const key = wanted.map(r => r.id + ':' + Math.round(r.at / MOVED_MS)).join();
  useEffect(() => {
    if (Platform.OS === 'web' || !session || !running) return;
    const have = scheduled.current;
    for (const id of [...have.keys()]) {
      if (!wanted.some(r => r.id === id)) { have.delete(id); run(() => Notifications.cancelScheduledNotificationAsync(id)); }
    }
    for (const { id, at } of wanted) {
      const before = have.get(id);
      if (before !== undefined && Math.abs(before - at) <= MOVED_MS) continue;
      have.set(id, at);
      run(async () => {
        await Notifications.cancelScheduledNotificationAsync(id);
        await Notifications.scheduleNotificationAsync({
          identifier: id, content: REMINDER, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
        });
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key stands for wanted
  }, [session, running, key]);
}

// Rings only when the user's own view.ping_at is newer than the last one seen. The first value after
// app start is only remembered, so an old ping never rings again.
function PingOverlay() {
  const { night } = useSafekeeps();
  const theme = useTheme();
  const player = useAudioPlayer(require('@/assets/sounds/ping.wav'));
  const seen = useRef<number | null | undefined>(undefined); // undefined: nothing seen yet
  const [ringing, setRinging] = useState(false);
  const [lit, setLit] = useState(true);
  const [calm, setCalm] = useState(false); // the person asked their phone for reduced motion: no flashing
  const loaded = night !== null;
  const pingAt = night?.view?.ping_at ?? null;

  useEffect(() => {
    if (!loaded) return;
    const before = seen.current;
    seen.current = pingAt;
    if (before === undefined || pingAt === null || (before !== null && pingAt <= before)) return;
    setRinging(true);
  }, [loaded, pingAt]);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setCalm).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setCalm);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ringing) return;
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {}); // sound even on the silent switch
    const beep = () => { player.seekTo(0).catch(() => {}); player.play(); }; // the clip is 1.2 s, so replay it
    beep();
    const replay = setInterval(beep, 1200);
    Vibration.vibrate([0, 500, 200, 500], true);
    const flash = calm ? undefined : setInterval(() => setLit(value => !value), 400); // under 3 flashes a second
    const stop = setTimeout(() => setRinging(false), RING_MS);
    return () => { clearInterval(flash); clearInterval(replay); clearTimeout(stop); player.pause(); Vibration.cancel(); };
  }, [ringing, player, calm]);

  if (!ringing) return null;
  return (
    <View pointerEvents="none" accessibilityRole="alert" style={[StyleSheet.absoluteFill, { zIndex: 100, alignItems: 'center', justifyContent: 'center',
      padding: Spacing.five, backgroundColor: lit || calm ? theme.primary : theme.primaryPressed }]}>
      <ThemedText type="title" announce style={{ fontSize: 40, lineHeight: 48, color: theme.onPrimary, textAlign: 'center' }}>A friend is looking for you</ThemedText>
    </View>
  );
}
