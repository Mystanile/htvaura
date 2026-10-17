import { Button, Column, Host, TextInput, useNativeState } from '@expo/ui';
import { useRef } from 'react';
import type { TextInputRef } from '@expo/ui';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function HomeScreen() {
  const state = useSafekeeps();
  const theme = useTheme();
  const code = useNativeState('');
  const codeInput = useRef<TextInputRef>(null);

  async function addFriend() {
    if (await state.addFriend(code.value)) codeInput.current?.clear();
  }

  return (
    <AppScreen>
      <ConnectionStatus />
      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold">{state.me?.name}</ThemedText>
        <ThemedText selectable>Your friend code: {state.me?.code}</ThemedText>
        <ThemedText selectable>
          {state.lastCheckIn === null ? 'You have not checked in yet.' : `Last check-in: ${formatCheckIn(state.lastCheckIn)}`}
        </ThemedText>
        <ThemedText>
          {!state.remindersEnabled ? 'Reminders off' : state.minutesRemaining === 0
            ? 'Time to check in' : `Next check-in in ${state.minutesRemaining} min`}
        </ThemedText>
        {state.incoming.map(request => (
          <ThemedText key={request.id} accessibilityLiveRegion="polite">
            {request.name} asked you to check in at {formatCheckIn(request.requestedAt)}.
          </ThemedText>
        ))}
        <Host matchContents seedColor="#ffdedf">
          <Button label={state.busy ? 'Saving...' : 'Check-in'} disabled={state.busy}
            onPress={() => { void state.recordCheckIn(); }} />
        </Host>
      </View>
      <ThemedText type="smallBold">Add a friend</ThemedText>
      <Host matchContents seedColor="#ffdedf">
        <Column spacing={12}>
          <TextInput ref={codeInput} value={code} placeholder="Friend code from the other phone"
            autoCapitalize="characters" autoCorrect={false} editable={!state.busy} />
          <Button label="Add friend" disabled={state.busy} onPress={() => { void addFriend(); }} />
        </Column>
      </Host>
      <ThemedText type="smallBold">Friends</ThemedText>
      {state.friends.length === 0 && <ThemedText>No friends yet. Enter a friend code above.</ThemedText>}
      {state.friends.map(friend => (
        <Link key={friend.id} href={{ pathname: '/friends/[id]', params: { id: friend.id } }} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${friend.name}`}
            style={({ pressed }) => ({
              padding: 20, gap: 6, borderRadius: 16, borderCurve: 'continuous',
              backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1,
            })}>
            <ThemedText type="smallBold">{friend.name}</ThemedText>
            <ThemedText type="small">{formatCheckIn(friend.lastCheckIn)}</ThemedText>
            {friend.requestedAt !== null && (
              <ThemedText type="small">
                {friend.resolvedAt === null ? 'Check-in requested' : 'Request answered'}
              </ThemedText>
            )}
            <ThemedText type="small">View friend</ThemedText>
          </Pressable>
        </Link>
      ))}
      <Link href="/settings" accessibilityRole="link">
        <ThemedText>Settings &amp; device</ThemedText>
      </Link>
    </AppScreen>
  );
}
