import { router } from 'expo-router';
import { useState } from 'react';
import { ActionSheetIOS, Linking, Platform, View } from 'react-native';

import { Button } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

export function useNameOf() {
  const state = useSafekeeps();
  return (id: string | null) => id === null ? null : id === state.me?.id ? 'You' : state.friends.find(friend => friend.id === id)?.name ?? null;
}

// Each maps app: its own link first, then a web link that works without the app installed.
const MAP_APPS = [
  { name: 'Apple Maps', app: (q: string) => `maps://?q=${q}`, web: (q: string) => `https://maps.apple.com/?q=${q}` },
  { name: 'Google Maps', app: (q: string) => `comgooglemaps://?q=${q}`, web: (q: string) => `https://www.google.com/maps/search/?api=1&query=${q}` },
  { name: 'Waze', app: (q: string) => `waze://?ll=${q}&navigate=yes`, web: (q: string) => `https://waze.com/ul?ll=${q}&navigate=yes` },
];

async function openMap([lat, lng]: [number, number], choice: number) {
  const q = `${lat},${lng}`;
  const maps = MAP_APPS[choice];
  if (Platform.OS !== 'web') {
    try { return await Linking.openURL(maps.app(q)); } catch { /* app not installed, use the web link */ }
  }
  await Linking.openURL(maps.web(q)).catch(() => {});
}

function List({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: Spacing.one }}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {items.map(item => <ThemedText key={item}>• {item}</ThemedText>)}
    </View>
  );
}

// Who has the alert. Accent when someone is on it, quiet grey when nobody is.
function Holder({ text, taken }: { text: string; taken: boolean }) {
  const theme = useTheme();
  return (
    <View style={{
      alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: Radius.round,
      backgroundColor: taken ? theme.accentSoft : theme.backgroundSelected,
    }}>
      <ThemedText type="smallBold" style={{ color: taken ? theme.accent : theme.textSecondary }}>{text}</ThemedText>
    </View>
  );
}

// Duress alerts use the exact same quiet card as every other alert, so nothing on screen looks louder.
export function AlertsSection() {
  const state = useSafekeeps();
  const nameOf = useNameOf();
  const [picking, setPicking] = useState<string | null>(null); // user_id of the alert whose map list is open (not iOS)
  const alerts = state.night?.alerts ?? [];
  if (alerts.length === 0) return null;
  return (
    <>
      {alerts.map(alert => {
        const holder = nameOf(alert.acknowledged_by);
        const canResolve = alert.acknowledged_by === state.me?.id || alert.kind === 'duress';
        return (
          <SectionCard key={alert.user_id}>
            <ThemedText type="heading">{nameOf(alert.user_id) ?? 'A friend'}</ThemedText>
            <ThemedText type="name">{alert.card.title}</ThemedText>
            <List title="Do" items={alert.card.do} />
            <List title="Don't" items={alert.card.dont} />
            <Holder taken={holder !== null} text={holder === null ? 'Nobody is on it yet' : `${holder} ${holder === 'You' ? 'are' : 'is'} on it`} />
            <View style={{ gap: Spacing.two }}>
              {alert.acknowledged_by === null && (
                <Button label="I'm on it" disabled={state.busy} onPress={() => { void state.ackAlert(alert.user_id); }} />
              )}
              {alert.location !== null && (
                <Button label="Find them" variant={alert.acknowledged_by === null ? 'tonal' : 'primary'}
                  onPress={() => { router.push({ pathname: '/find/[id]', params: { id: alert.user_id } }); }} />
              )}
              {alert.location !== null && (
                <Button label="Open in Maps" variant="tonal" onPress={() => {
                  const location = alert.location!;
                  if (Platform.OS !== 'ios') return setPicking(picking === alert.user_id ? null : alert.user_id);
                  ActionSheetIOS.showActionSheetWithOptions(
                    { options: [...MAP_APPS.map(maps => maps.name), 'Cancel'], cancelButtonIndex: MAP_APPS.length },
                    index => { if (index < MAP_APPS.length) void openMap(location, index); });
                }} />
              )}
              {alert.location !== null && picking === alert.user_id && MAP_APPS.map((maps, index) => (
                <Button key={maps.name} label={maps.name} variant="outline"
                  onPress={() => { setPicking(null); void openMap(alert.location!, index); }} />
              ))}
              {canResolve && <Button label="Resolve" variant="outline" disabled={state.busy} onPress={() => { void state.resolveAlert(alert.user_id); }} />}
            </View>
          </SectionCard>
        );
      })}
    </>
  );
}
