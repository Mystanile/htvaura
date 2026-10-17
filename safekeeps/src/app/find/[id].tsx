import * as Location from 'expo-location';
import { Link, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { useNameOf } from '@/components/alerts-section';
import { AppScreen } from '@/components/app-screen';
import { Button } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/demo-api';
import { arrowRotation, bearingDegrees, compassWord, distanceMetres, formatDistance, smoothAngle, type LatLng } from '@/services/geo';
import { useSafekeeps } from '@/state/safekeeps';

// Own position and compass heading. Heading is null on the web and until the first compass reading.
function useOwnPosition() {
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState(0); // metres, how far off our own GPS says it may be
  const [heading, setHeading] = useState<number | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    let stopped = false;
    const subscriptions: Location.LocationSubscription[] = [];
    const keep = (subscription: Location.LocationSubscription) => { if (stopped) subscription.remove(); else subscriptions.push(subscription); };
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (stopped) return;
      if (!permission.granted) return setDenied(true);
      keep(await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, distanceInterval: 1 },
        next => {
          setPosition({ lat: next.coords.latitude, lng: next.coords.longitude });
          setAccuracy(next.coords.accuracy ?? 0);
        }));
      if (Platform.OS === 'web') return; // browsers have no compass here
      keep(await Location.watchHeadingAsync(next => {
        const value = next.trueHeading >= 0 ? next.trueHeading : next.magHeading;
        setHeading(previous => previous === null ? value : smoothAngle(previous, value, 0.2));
      }));
    })().catch(() => setDenied(true));
    return () => { stopped = true; subscriptions.forEach(subscription => subscription.remove()); };
  }, []);
  return { position, accuracy, heading, denied };
}

const DIAL = 224; // the arrow turns inside this circle, tall enough for its longest side

function Arrow({ degrees }: { degrees: number }) {
  const theme = useTheme();
  return (
    <View style={{ width: DIAL, height: DIAL, borderRadius: Radius.round, backgroundColor: theme.backgroundSelected,
      alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ alignItems: 'center', transform: [{ rotate: `${degrees}deg` }] }} accessibilityLabel="Arrow pointing to your friend">
        <View style={{ borderLeftWidth: 50, borderRightWidth: 50, borderBottomWidth: 80, borderLeftColor: 'transparent',
          borderRightColor: 'transparent', borderBottomColor: theme.accent }} />
        <View style={{ width: 36, height: 56, backgroundColor: theme.accent, borderBottomLeftRadius: Radius.inner, borderBottomRightRadius: Radius.inner }} />
      </View>
    </View>
  );
}

export default function FindScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const nameOf = useNameOf();
  const theme = useTheme();
  const own = useOwnPosition();
  const [ping, setPing] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const alert = state.night?.alerts.find(item => item.user_id === id);
  const name = nameOf(id) ?? 'your friend';

  if (!alert || alert.location === null) return (
    <AppScreen>
      <Stack.Screen options={{ title: 'Find them' }} />
      <SectionCard>
        <ThemedText>{state.night === null ? 'Loading...' : 'No location to follow right now. The alert may have ended.'}</ThemedText>
        <Link href="/"><ThemedText type="link">Back to home</ThemedText></Link>
      </SectionCard>
    </AppScreen>
  );

  const target = { lat: alert.location[0], lng: alert.location[1] };
  const bearing = own.position ? bearingDegrees(own.position, target) : null;
  const heading = own.heading;
  const metres = own.position ? distanceMetres(own.position, target) : 0;
  // Indoor GPS is off by 20 to 50 m, so a short distance is mostly noise. Do not point the arrow at noise.
  const tooClose = metres < 30 || metres < own.accuracy + 20;

  async function sendPing() {
    if (!state.session) return;
    setPing('sending');
    setProblem(null);
    try {
      await api(state.session.url, '/alerts/' + encodeURIComponent(id) + '/ping', state.session.token, {});
      setPing('sent');
    } catch (e) {
      setPing('idle');
      setProblem((e as Error).message);
    }
  }

  return (
    <AppScreen>
      <Stack.Screen options={{ title: 'Find them' }} />
      <SectionCard>
        <ThemedText type="heading">{name}</ThemedText>
        {own.denied ? (
          <ThemedText>Allow location in your settings to see how far away {name} is.</ThemedText>
        ) : own.position === null || bearing === null ? (
          <ThemedText themeColor="textSecondary">Finding your position...</ThemedText>
        ) : tooClose ? (
          <ThemedText type="name" style={{ textAlign: 'center' }}>{"You're close. GPS can't point closer than this. Use Ping."}</ThemedText>
        ) : (
          <View style={{ alignItems: 'center', gap: Spacing.three }}>
            {heading !== null && <Arrow degrees={arrowRotation(bearing, heading)} />}
            <ThemedText type="title" style={{ textAlign: 'center' }}>About {formatDistance(metres)} away</ThemedText>
            <ThemedText type="name" style={{ textAlign: 'center' }}>Head {compassWord(bearing)}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary" style={{ textAlign: 'center' }}>GPS is rough indoors.</ThemedText>
            {heading === null && (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                {Platform.OS === 'web' ? 'The arrow needs a phone with a compass.' : 'Waiting for your compass.'}
              </ThemedText>
            )}
          </View>
        )}
      </SectionCard>
      {alert.kind === 'duress' ? (
        <ThemedText type="small" themeColor="textSecondary">Pinging is off for silent alerts.</ThemedText>
      ) : alert.acknowledged_by !== null && alert.acknowledged_by !== state.me?.id ? (
        <ThemedText type="small" themeColor="textSecondary">Another friend is already on it, so pinging is off.</ThemedText>
      ) : (
        <Button label={ping === 'sending' ? 'Pinging...' : 'Ping'} disabled={ping === 'sending'} onPress={() => { void sendPing(); }} />
      )}
      {ping === 'sent' && <ThemedText accessibilityLiveRegion="polite">Ping sent. If it counts, their phone rings.</ThemedText>}
      {problem && <ThemedText style={{ color: theme.danger }} accessibilityLiveRegion="polite">{problem}</ThemedText>}
    </AppScreen>
  );
}
