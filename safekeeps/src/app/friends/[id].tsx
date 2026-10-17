import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Stack } from 'expo-router/stack';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { SectionCard } from '@/components/section-card';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function FriendScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const friend = state.friends.find(item => item.id === id);
  const [newName, setNewName] = useState(friend?.name ?? '');

  if (!friend) return (
    <AppScreen>
      <ThemedText>Friend not found.</ThemedText>
      <Link href="/" asChild><AppButton label="Return to friends" variant="secondary" /></Link>
    </AppScreen>
  );

  return (
    <AppScreen>
      <Stack.Screen options={{ title: friend.name }} />
      <ConnectionStatus />
      <SectionCard tone="soft">
        <ThemedText type="heading">Last check-in</ThemedText>
        <ThemedText selectable>{formatCheckIn(friend.lastCheckIn)}</ThemedText>
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Check on {friend.name}</ThemedText>
        <AppButton label={state.busy ? 'Sending...' : 'Request check-in'} disabled={state.busy}
          onPress={() => { void state.requestCheckIn(friend.id); }} />
        {friend.requestedAt !== null && (
          <ThemedText accessibilityLiveRegion="polite">
            {friend.resolvedAt === null
              ? `Check-in requested at ${formatCheckIn(friend.requestedAt)}.`
              : `Request answered at ${formatCheckIn(friend.resolvedAt)}.`}
          </ThemedText>
        )}
        <ThemedText type="small" themeColor="textSecondary">Bluetooth not connected</ThemedText>
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Rename</ThemedText>
        <Field label="Name" helper="Only you see this name. Leave it empty to use their own name."
          value={newName} onChangeText={setNewName} placeholder="Their name" autoCapitalize="words"
          editable={!state.busy} maxLength={40} />
        <AppButton label={state.busy ? 'Saving...' : 'Save name'} disabled={state.busy}
          onPress={() => { void state.renameFriend(friend.id, newName); }} />
      </SectionCard>
      <SectionCard>
        {confirmRemoval && (
          <ThemedText>Remove {friend.name}? This removes the friendship and pending requests on both devices.</ThemedText>
        )}
        <AppButton label={confirmRemoval ? 'Confirm removal' : 'Remove friend'} variant="danger" disabled={state.busy}
          onPress={() => {
            if (!confirmRemoval) { setConfirmRemoval(true); return; }
            void state.removeFriend(friend.id).then(removed => {
              if (removed) router.replace('/');
            });
          }} />
        {confirmRemoval && <AppButton label="Cancel" variant="secondary" disabled={state.busy} onPress={() => setConfirmRemoval(false)} />}
      </SectionCard>
    </AppScreen>
  );
}
