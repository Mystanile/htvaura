import { Button, Column, Host } from '@expo/ui';
import { Link, useLocalSearchParams } from 'expo-router';
import { Stack } from 'expo-router/stack';

import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const friend = state.friends.find(item => item.id === id);

  if (!friend) {
    return (
      <AppScreen>
        <ThemedText>Friend not found.</ThemedText>
        <Link href="/">Return to friends</Link>
      </AppScreen>
    );
  }

  return (
    <AppScreen>
      <Stack.Screen options={{ title: friend.name }} />
      <ThemedText selectable>Last check-in: {formatCheckIn(friend.lastCheckIn)}</ThemedText>
      <ThemedText>Proximity: {friend.proximity}</ThemedText>

      <Host matchContents seedColor="#ffdedf">
        <Column spacing={16}>
          <Button label="Request check-in" onPress={() => state.requestCheckIn(friend.id)} />
          <Button label="Alert emergency contacts" variant="outlined" onPress={() => state.recordDemoAlert(friend.id)} />
        </Column>
      </Host>
      {friend.requestedAt !== null && (
        <ThemedText accessibilityLiveRegion="polite">Request recorded at {formatCheckIn(friend.requestedAt)}.</ThemedText>
      )}
      {friend.alertedAt !== null && (
        <ThemedText accessibilityLiveRegion="polite">Alert recorded at {formatCheckIn(friend.alertedAt)}.</ThemedText>
      )}

    </AppScreen>
  );
}