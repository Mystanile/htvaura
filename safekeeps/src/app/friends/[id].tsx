import { Button, Column, Host } from '@expo/ui';
import { Link, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { ThemedText } from '@/components/themed-text';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const friend = state.friends.find(item => item.id === id);

  if (!friend) return (
    <AppScreen>
      <ThemedText>Friend not found.</ThemedText>
      <Link href="/">Return to friends</Link>
    </AppScreen>
  );

  return (
    <AppScreen>
      <Stack.Screen options={{ title: friend.name }} />
      <ConnectionStatus />
      <ThemedText selectable>Last check-in: {formatCheckIn(friend.lastCheckIn)}</ThemedText>
      <ThemedText>Bluetooth not connected</ThemedText>
      <Host matchContents seedColor="#ffdedf">
        <Column spacing={16}>
          <Button label={state.busy ? 'Sending...' : 'Request check-in'} disabled={state.busy}
            onPress={() => { void state.requestCheckIn(friend.id); }} />
          <Button label="Alert emergency contacts" variant="outlined" disabled />
        </Column>
      </Host>
      {friend.requestedAt !== null && (
        <ThemedText accessibilityLiveRegion="polite">
          {friend.resolvedAt === null
            ? `Check-in requested at ${formatCheckIn(friend.requestedAt)}.`
            : `Request answered at ${formatCheckIn(friend.resolvedAt)}.`}
        </ThemedText>
      )}
    </AppScreen>
  );
}
