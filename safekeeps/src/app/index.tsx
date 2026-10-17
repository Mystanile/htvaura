import { Button, Column, Host, TextInput, useNativeState, type TextInputRef } from '@expo/ui';
import { useRef } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { SectionCard } from '@/components/section-card';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { AppFont, ButtonSeed, Spacing } from '@/constants/theme';
import { Artwork, PixelArt } from '@/components/pixel-art';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

function FriendRequest({ request }: { request: { id: string; name: string } }) {
  const state = useSafekeeps();
  const name = useNativeState('');

  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="name">{request.name} wants to add you</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">Choose a name for them. Only you will see it.</ThemedText>
      <Host colorScheme="light" matchContents seedColor={ButtonSeed} style={{ width: '100%' }}>
        <Column spacing={8}>
          <TextInput style={{ width: '100%', backgroundColor: '#EAE3CB', borderColor: '#8A7857', borderWidth: 1, borderRadius: 2, padding: 12 }} textStyle={{ fontFamily: AppFont, color: '#5C5439' }} value={name} placeholder="Name (optional)"
            autoCapitalize="words" editable={!state.busy} maxLength={40} />
          <Button label="Accept" disabled={state.busy}
            onPress={() => { void state.acceptFriend(request.id, name.value); }} />
          <Button label="Decline" disabled={state.busy}
            onPress={() => { void state.declineFriend(request.id); }} />
        </Column>
      </Host>
    </View>
  );
}

export default function HomeScreen() {
  const state = useSafekeeps();
  const code = useNativeState('');
  const name = useNativeState('');
  const codeInput = useRef<TextInputRef>(null);
  const nameInput = useRef<TextInputRef>(null);

  async function addFriend() {
    if (await state.addFriend(code.value, name.value)) {
      codeInput.current?.clear();
      nameInput.current?.clear();
    }
  }

  return (
    <AppScreen header={
      <View style={{ minHeight: 72, paddingHorizontal: 20, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <PixelArt source={Artwork.header} />
        <ThemedText type="heading" style={{ flex: 1, fontSize: 28 }}>HOMEBOUND</ThemedText>
        <SettingsButton />
      </View>
    }>
      <ConnectionStatus />
      <Link href="/night" asChild>
        <Pressable accessibilityRole="link" accessibilityLabel="Start a night"
          style={{ minHeight: 72, justifyContent: 'center', alignItems: 'center' }}>
          <PixelArt source={Artwork.checkIn} />
          <ThemedText type="heading">Start a night</ThemedText>
        </Pressable>
      </Link>
      <SectionCard dark>
        <View style={{ minHeight: 176, justifyContent: 'center', paddingHorizontal: 12 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="CHECK IN !!"
          accessibilityState={{ disabled: state.busy, busy: state.busy }}
          disabled={state.busy}
          onPress={() => { void state.recordCheckIn(); }}
          style={({ pressed }) => ({
            width: '100%', aspectRatio: 195 / 61, minHeight: 88,
            alignItems: 'center', justifyContent: 'center',
            opacity: state.busy ? 0.6 : pressed ? 0.8 : 1,
            transform: [{ translateY: pressed ? 2 : 0 }],
          })}>
          <PixelArt source={Artwork.checkIn} />
          <ThemedText style={{ fontSize: 30, lineHeight: 40 }}>
            {state.busy ? 'Saving...' : 'CHECK IN'}
          </ThemedText>
        </Pressable>
        </View>
        <ThemedText themeColor="textSecondary">
          {!state.remindersEnabled ? 'Reminders off' : state.minutesRemaining === 0
            ? 'Time to check in' : `Next check-in in ${state.minutesRemaining} min`}
        </ThemedText>
        {state.lastCheckIn !== null && (
          <ThemedText type="small" selectable>Last check-in: {formatCheckIn(state.lastCheckIn)}</ThemedText>
        )}
        {state.incoming.map(request => (
          <ThemedText key={request.id} accessibilityLiveRegion="polite">
            {request.name} asked you to check in at {formatCheckIn(request.requestedAt)}.
          </ThemedText>
        ))}
      </SectionCard>
      <SectionCard friends>
      {state.friendRequests.length > 0 && <ThemedText type="heading">Friend requests</ThemedText>}
      {state.friendRequests.map(request => (
        <FriendRequest key={request.id} request={request} />
      ))}
      {state.sentRequests.map(request => (
        <ThemedText key={request.id} accessibilityLiveRegion="polite">Request sent to {request.name} · Awaiting acceptance</ThemedText>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ThemedText type="heading">Friends</ThemedText>
        <ThemedText themeColor="textSecondary">{state.friends.length}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: Math.max(6, Math.ceil(state.friends.length / 2) * 2) }, (_, index) => {
          const friend = state.friends[index];
          if (!friend) return (
            <View key={`empty-${index}`} accessible accessibilityLabel="Empty friend slot"
              style={{ width: '48%', flexGrow: 1, aspectRatio: 100 / 36, minHeight: 70, alignItems: 'center', justifyContent: 'center' }}>
              <PixelArt source={Artwork.empty} />
              <ThemedText type="name" style={{ color: '#FFFCF0' }}>EMPTY</ThemedText>
            </View>
          );
          const pending = friend.requestedAt !== null && friend.resolvedAt === null;
          const recent = friend.lastCheckIn !== null && state.now - friend.lastCheckIn <= state.intervalMinutes * 60_000;
          const present = recent && !pending;
          const status = pending ? 'Awaiting reply' : present ? 'Checked in' : friend.lastCheckIn === null ? 'No check-in yet' : 'Check-in overdue';
          return (
            <View key={friend.id} style={{ width: '48%', flexGrow: 1 }}>
            <Link href={{ pathname: '/friends/[id]', params: { id: friend.id } }} asChild>
              <Pressable accessibilityRole="link" accessibilityLabel={`View ${friend.name}, ${status}`}
                style={{
                  width: '100%', minHeight: 70, aspectRatio: 100 / 36,
                  paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center',
                }}>
                <PixelArt source={present ? Artwork.present : Artwork.away} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ThemedText type="name" numberOfLines={1} style={{ flex: 1, fontSize: 17, lineHeight: 24, color: present ? '#52653B' : '#712F2D' }}>{friend.name}</ThemedText>
                  <ThemedText style={{ fontSize: 9, color: present ? '#52653B' : '#712F2D' }}>CHECK IN?</ThemedText>
                </View>
                <ThemedText numberOfLines={1} style={{ fontSize: 11, lineHeight: 16, color: present ? '#52653B' : '#712F2D' }}>{status}</ThemedText>
              </Pressable>
            </Link>
            </View>
          );
        })}
      </View>
      </SectionCard>
      <SectionCard dark>
        <ThemedText type="heading">Add a friend</ThemedText>
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">Your friend code</ThemedText>
          <ThemedText type="name" selectable>{state.me?.code}</ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">Enter their code to send a friend request. They will appear once they accept.</ThemedText>
        <Host colorScheme="light" matchContents seedColor={ButtonSeed} style={{ width: '100%' }}>
          <Column spacing={12} style={{ width: '100%' }}>
            <TextInput style={{ width: '100%', backgroundColor: '#EAE3CB', borderColor: '#8A7857', borderWidth: 1, borderRadius: 2, padding: 12 }} textStyle={{ fontFamily: AppFont, color: '#5C5439' }} ref={codeInput} value={code} placeholder="Friend code"
              autoCapitalize="characters" autoCorrect={false} editable={!state.busy} maxLength={32} />
            <TextInput style={{ width: '100%', backgroundColor: '#EAE3CB', borderColor: '#8A7857', borderWidth: 1, borderRadius: 2, padding: 12 }} textStyle={{ fontFamily: AppFont, color: '#5C5439' }} ref={nameInput} value={name} placeholder="Name (optional)"
              autoCapitalize="words" editable={!state.busy} maxLength={40} />
            <Button label={state.busy ? 'Sending...' : 'Send friend request'} disabled={state.busy}
              onPress={() => { void addFriend(); }} />
          </Column>
        </Host>
      </SectionCard>
    </AppScreen>
  );
}

