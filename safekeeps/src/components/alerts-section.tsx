import { Button, Column, Host } from '@expo/ui';
import { router } from 'expo-router';
import { Linking, Platform, View } from 'react-native';

import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { ButtonSeed, FriendsColors, Spacing } from '@/constants/theme';
import { SurfaceThemeContext, useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

export function useNameOf() {
  const state = useSafekeeps();
  return (id: string | null) => id === null ? null : id === state.me?.id ? 'You' : state.friends.find(friend => friend.id === id)?.name ?? null;
}

function openMap([lat, lng]: [number, number]) {
  void Linking.openURL(Platform.OS === 'ios' ? `maps://?q=${lat},${lng}` : `https://maps.apple.com/?q=${lat},${lng}`);
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

// Duress alerts use the exact same quiet card as every other alert, so nothing on screen looks louder.
export function AlertsSection() {
  const state = useSafekeeps();
  const theme = useTheme();
  const nameOf = useNameOf();
  const alerts = state.night?.alerts ?? [];
  if (alerts.length === 0) return null;
  return (
    <SurfaceThemeContext value={{ ...theme, ...FriendsColors }}>
      {alerts.map(alert => {
        const holder = nameOf(alert.acknowledged_by);
        const canResolve = alert.acknowledged_by === state.me?.id || alert.kind === 'duress';
        return (
          <SectionCard key={alert.user_id}>
            <ThemedText type="heading">{nameOf(alert.user_id) ?? 'A friend'}</ThemedText>
            <ThemedText type="name">{alert.card.title}</ThemedText>
            <List title="Do" items={alert.card.do} />
            <List title="Don't" items={alert.card.dont} />
            <ThemedText type="small">{holder === null ? 'Nobody is on it yet' : `${holder} ${holder === 'You' ? 'are' : 'is'} on it`}</ThemedText>
            <Host matchContents seedColor={ButtonSeed}>
              <Column spacing={8}>
                {alert.location !== null && (
                  <Button label="Find them" onPress={() => { router.push({ pathname: '/find/[id]', params: { id: alert.user_id } }); }} />
                )}
                {alert.location !== null && <Button label="Open in Maps" onPress={() => { openMap(alert.location!); }} />}
                {alert.acknowledged_by === null && (
                  <Button label="I'm on it" disabled={state.busy} onPress={() => { void state.ackAlert(alert.user_id); }} />
                )}
                {canResolve && <Button label="Resolve" disabled={state.busy} onPress={() => { void state.resolveAlert(alert.user_id); }} />}
              </Column>
            </Host>
          </SectionCard>
        );
      })}
    </SurfaceThemeContext>
  );
}
