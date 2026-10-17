import { useNativeState } from '@expo/ui';
import { Link, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Stack } from 'expo-router/stack';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { Button, TextField } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function FriendScreen() {
  'use no memo'; // @expo/ui web TextInput only redraws when this screen re-renders, the compiler would skip that
  const { id } = useLocalSearchParams<{ id: string }>();
  const state = useSafekeeps();
  const theme = useTheme();
  const [confirmRemoval, setConfirmRemoval] = useState(false);
  const friend = state.friends.find(item => item.id === id);
  const newName = useNativeState(friend?.name ?? '');

  if (!friend) return (
    <AppScreen>
      <ThemedText>Friend not found.</ThemedText>
      <Link href="/"><ThemedText type="link">Return to friends</ThemedText></Link>
    </AppScreen>
  );

  return (
    <AppScreen>
      <Stack.Screen options={{ title: friend.name }} />
      <ConnectionStatus />
      <SectionCard tone="accent">
        <ThemedText type="smallBold" themeColor="accent">Last check-in</ThemedText>
        <ThemedText type="subtitle" selectable>{formatCheckIn(friend.lastCheckIn)}</ThemedText>
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Check on {friend.name}</ThemedText>
        <Button label={state.busy ? 'Sending...' : 'Request check-in'} disabled={state.busy}
          onPress={() => { void state.requestCheckIn(friend.id); }} />
        <Button label="Alert emergency contacts" variant="outline" disabled onPress={() => {}} />
        {friend.requestedAt !== null && (
          <ThemedText accessibilityLiveRegion="polite">
            {friend.resolvedAt === null
              ? `Check-in requested at ${formatCheckIn(friend.requestedAt)}.`
              : `Request answered at ${formatCheckIn(friend.resolvedAt)}.`}
          </ThemedText>
        )}
        <ThemedText type="caption" themeColor="textSecondary">Bluetooth not connected</ThemedText>
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Rename</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Only you see this name. Leave it empty to use their own name.</ThemedText>
        <TextField label="Name" value={newName} placeholder="Name" autoCapitalize="words" editable={!state.busy} maxLength={40} />
        <Button label={state.busy ? 'Saving...' : 'Save name'} disabled={state.busy}
          onPress={() => { void state.renameFriend(friend.id, newName.value); }} />
      </SectionCard>
      <SectionCard>
        {confirmRemoval && (
          <ThemedText style={{ color: theme.danger }}>Remove {friend.name}? This removes the friendship and pending requests on both devices.</ThemedText>
        )}
        <Button label={confirmRemoval ? 'Confirm removal' : 'Remove friend'} variant={confirmRemoval ? 'danger' : 'outline'} disabled={state.busy}
          onPress={() => {
            if (!confirmRemoval) { setConfirmRemoval(true); return; }
            void state.removeFriend(friend.id).then(removed => {
              if (removed) router.replace('/');
            });
          }} />
        {confirmRemoval && <Button label="Cancel" variant="outline" disabled={state.busy} onPress={() => setConfirmRemoval(false)} />}
      </SectionCard>
    </AppScreen>
  );
}
