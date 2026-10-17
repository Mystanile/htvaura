import { Button, Host } from '@expo/ui';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';

import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function HomeScreen() {
  const state = useSafekeeps();


  return (
    <AppScreen>
      <View style={{ gap: 8 }}>
        <ThemedText type="smallBold">Your check-in</ThemedText>
        <ThemedText selectable>
          {state.lastCheckIn === null ? 'You have not checked in yet.' : `Last check-in: ${formatCheckIn(state.lastCheckIn)}`}
        </ThemedText>
        <ThemedText>
          {!state.remindersEnabled ? 'Reminders off' : state.minutesRemaining === 0
            ? 'Time to check in' : `Next check-in in ${state.minutesRemaining} min`}
        </ThemedText>
        <Host matchContents seedColor="#ffdedf">
          <Button label="Check-in" onPress={state.recordCheckIn} />
        </Host>
      </View>
      <ThemedText type="smallBold">Friends</ThemedText>
      {state.friends.length === 0 && <ThemedText>No friends added yet.</ThemedText>}
      {state.friends.map(friend => (
        <Link key={friend.id} href={{ pathname: '/friends/[id]', params: { id: friend.id } }} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`View ${friend.name}`}
            style={{ paddingVertical: 12, gap: 4 }}>
            <ThemedText type="smallBold">{friend.name}</ThemedText>
            <ThemedText>{friend.proximity}</ThemedText>
            <ThemedText type="small">{formatCheckIn(friend.lastCheckIn)}</ThemedText>
            {friend.requestedAt !== null && <ThemedText type="small">Check-in request recorded</ThemedText>}
          </Pressable>
        </Link>
      ))}
      <Link href="/settings" accessibilityRole="link">
        <ThemedText>Settings &amp; device</ThemedText>
      </Link>
    </AppScreen>
  );
}