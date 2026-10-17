import { Button, Column, Host } from '@expo/ui';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Stack } from 'expo-router/stack';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { ThemedText } from '@/components/themed-text';
import { SectionCard } from '@/components/section-card';
import { ButtonSeed } from '@/constants/theme';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const [confirmRemoval, setConfirmRemoval] = useState(false);
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
      <SectionCard accent>
        <ThemedText type="heading">Last check-in</ThemedText>
        <ThemedText selectable>{formatCheckIn(friend.lastCheckIn)}</ThemedText>
      </SectionCard>
      <ThemedText type="heading">Check on {friend.name}</ThemedText>
      <Host colorScheme="light" matchContents seedColor={ButtonSeed}>
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
      <ThemedText type="small" themeColor="textSecondary">Bluetooth not connected</ThemedText>
      <SectionCard>
        {confirmRemoval && (
          <ThemedText>Remove {friend.name}? This removes the friendship and pending requests on both devices.</ThemedText>
        )}
        <Host colorScheme="light" matchContents seedColor={ButtonSeed}>
          <Column spacing={12}>
            <Button label={confirmRemoval ? 'Confirm removal' : 'Remove friend'} disabled={state.busy}
              onPress={() => {
                if (!confirmRemoval) { setConfirmRemoval(true); return; }
                void state.removeFriend(friend.id).then(removed => {
                  if (removed) router.replace('/');
                });
              }} />
            {confirmRemoval && <Button label="Cancel" disabled={state.busy} onPress={() => setConfirmRemoval(false)} />}
          </Column>
        </Host>
      </SectionCard>
    </AppScreen>
  );
}
