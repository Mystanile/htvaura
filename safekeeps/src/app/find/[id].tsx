import { Button, Column, Host } from '@expo/ui';
import * as Location from 'expo-location';
import { Link, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';

import { useNameOf } from '@/components/alerts-section';
import { AppScreen } from '@/components/app-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { ButtonSeed, Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/services/demo-api';
import { arrowRotation, bearingDegrees, compassWord, distanceMetres, formatDistance, smoothAngle, type LatLng } from '@/services/geo';
import { useSafekeeps } from '@/state/safekeeps';

// Own position and compass heading. Heading is null on the web and until the first compass reading.
function useOwnPosition() {
  const [position, setPosition] = useState<LatLng | null>(null);
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
        next => setPosition({ lat: next.coords.latitude, lng: next.coords.longitude })));
      if (Platform.OS === 'web') return; // browsers have no compass here
      keep(await Location.watchHeadingAsync(next => {
        const value = next.trueHeading >= 0 ? next.trueHeading : next.magHeading;
        setHeading(previous => previous === null ? value : smoothAngle(previous, value, 0.2));
      }));
    })().catch(() => setDenied(true));
    return () => { stopped = true; subscriptions.forEach(subscription => subscription.remove()); };
  }, []);
  return { position, heading, denied };
}

function Arrow({ degrees }: { degrees: number }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: 'center', transform: [{ rotate: `${degrees}deg` }] }} accessibilityLabel="Arrow pointing to your friend">
      <View style={{ borderLeftWidth: 50, borderRightWidth: 50, borderBottomWidth: 80, borderLeftColor: 'transparent',
        borderRightColor: 'transparent', borderBottomColor: theme.accent }} />
      <View style={{ width: 36, height: 70, backgroundColor: theme.accent, borderBottomLeftRadius: Radius.control, borderBottomRightRadius: Radius.control }} />
    </View>
  );
}

export default function FindScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const nameOf = useNameOf();
  const own = useOwnPosition();
  const [ping, setPing] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [problem, setProblem] = useState<string | null>(null);
  const alert = state.night?.alerts.find(item => item.user_id === id);
  const name = nameOf(id) ?? 'your friend';

  if (!alert || alert.location === null) return (
    <AppScreen>
      <Stack.Screen options={{ title: 'Find them' }} />
      <ThemedText>{state.night === null ? 'Loading...' : 'No location to follow right now. The alert may have ended.'}</ThemedText>
      <Link href="/">Back to home</Link>
    </AppScreen>
  );

  const target = { lat: alert.location[0], lng: alert.location[1] };
  const bearing = own.position ? bearingDegrees(own.position, target) : null;
  const heading = own.heading;

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
      <SectionCard dark>
        <ThemedText type="heading">{name}</ThemedText>
        {own.denied ? (
          <ThemedText>Allow location in your settings to see how far away {name} is.</ThemedText>
        ) : own.position === null || bearing === null ? (
          <ThemedText>Finding your position...</ThemedText>
        ) : (
          <>
            {heading !== null && <View style={{ alignItems: 'center', paddingVertical: 24 }}><Arrow degrees={arrowRotation(bearing, heading)} /></View>}
            <ThemedText style={{ fontSize: 40, lineHeight: 48, textAlign: 'center' }}>{formatDistance(distanceMetres(own.position, target))}</ThemedText>
            <ThemedText type="name" style={{ textAlign: 'center' }}>Head {compassWord(bearing)}</ThemedText>
            {heading === null && (
              <ThemedText type="small" themeColor="textSecondary">
                {Platform.OS === 'web' ? 'The arrow needs a phone with a compass.' : 'Waiting for your compass.'}
              </ThemedText>
            )}
          </>
        )}
      </SectionCard>
      {alert.kind === 'duress' ? (
        <ThemedText type="small" themeColor="textSecondary">Pinging is off for silent alerts.</ThemedText>
      ) : alert.acknowledged_by !== null && alert.acknowledged_by !== state.me?.id ? (
        <ThemedText type="small" themeColor="textSecondary">Another friend is already on it, so pinging is off.</ThemedText>
      ) : (
        <Host matchContents seedColor={ButtonSeed}>
          <Column spacing={8}>
            <Button label={ping === 'sending' ? 'Pinging...' : 'Ping'} disabled={ping === 'sending'} onPress={() => { void sendPing(); }} />
          </Column>
        </Host>
      )}
      {ping === 'sent' && <ThemedText accessibilityLiveRegion="polite">Ping sent. If it counts, their phone rings.</ThemedText>}
      {problem && <ThemedText accessibilityLiveRegion="polite">{problem}</ThemedText>}
    </AppScreen>
  );
}
