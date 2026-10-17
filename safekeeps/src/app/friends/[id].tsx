import { Button, Column, Host, TextInput, useNativeState } from '@expo/ui';
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
  'use no memo'; // @expo/ui web TextInput only redraws when this screen re-renders, the compiler would skip that
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const friend = state.friends.find(item => item.id === id);
  const newName = useNativeState(friend?.name ?? '');

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
      <Host matchContents seedColor={ButtonSeed}>
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
        <ThemedText type="heading">Rename</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Only you see this name. Leave it empty to use their own name.</ThemedText>
        <Host matchContents seedColor={ButtonSeed}>
          <Column spacing={12}>
            <TextInput value={newName} placeholder="Name" autoCapitalize="words" editable={!state.busy} maxLength={40} />
            <Button label={state.busy ? 'Saving...' : 'Save name'} disabled={state.busy}
              onPress={() => { void state.renameFriend(friend.id, newName.value); }} />
          </Column>
        </Host>
      </SectionCard>
      <SectionCard>
        {confirmRemoval && (
          <ThemedText>Remove {friend.name}? This removes the friendship and pending requests on both devices.</ThemedText>
        )}
        <Host matchContents seedColor={ButtonSeed}>
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
