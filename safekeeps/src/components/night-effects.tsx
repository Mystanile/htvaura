import { useAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, Vibration, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { api } from '@/services/demo-api';
import { distanceMetres } from '@/services/geo';
import { useSafekeeps } from '@/state/safekeeps';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const SEND_EVERY_MS = 30_000;
const SEND_AFTER_METRES = 25;
const RING_MS = 5000;

// Mounted once in the root layout. Does two things and shows nothing until a ping arrives.
export function NightEffects() {
  useLocationSender();
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
      <ThemedText type="title" style={{ fontSize: 40, lineHeight: 48, color: theme.onPrimary, textAlign: 'center' }}>A friend is looking for you</ThemedText>
    </View>
  );
}
