import { useNativeState, type TextInputRef } from '@expo/ui';
import { useRef } from 'react';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AlertBanner } from '@/components/alert-banner';
import { AlertsSection } from '@/components/alerts-section';
import { AppScreen } from '@/components/app-screen';
import { CheckInCard } from '@/components/check-in-card';
import { ConnectionStatus } from '@/components/connection-status';
import { Avatar, Button, Divider, TextField } from '@/components/controls';
import { NightEntry } from '@/components/night-entry';
import { SectionCard } from '@/components/section-card';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function HomeScreen() {
  'use no memo'; // @expo/ui web TextInput only redraws when this screen re-renders, the compiler would skip that
  const state = useSafekeeps();
  const theme = useTheme();
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
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <ThemedText type="title" accessibilityRole="header" style={{ flex: 1 }}>Safekeeps</ThemedText>
        <SettingsButton />
      </View>
    }>
      <AlertBanner />
      <ConnectionStatus />
      <AlertsSection />
      <SectionCard>
        <ThemedText type="heading">Check in</ThemedText>
        <CheckInCard />
        {(!state.night?.view || state.night.view.state === 'ended') && <NightEntry />}
        {state.lastCheckIn !== null && (
          <ThemedText type="small" themeColor="textSecondary" selectable>Last check-in: {formatCheckIn(state.lastCheckIn)}</ThemedText>
        )}
        {state.incoming.map(request => (
          <ThemedText key={request.id} accessibilityLiveRegion="polite">
            {request.name} asked you to check in at {formatCheckIn(request.requestedAt)}.
          </ThemedText>
        ))}
      </SectionCard>
      <SectionCard>
        {state.friendRequests.length > 0 && <ThemedText type="heading">Friend requests</ThemedText>}
        {state.friendRequests.map(request => (
          <View key={request.id} style={{ gap: Spacing.two }}>
            <ThemedText type="name">{request.name} wants to add you</ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <View style={{ flex: 1 }}>
                <Button label="Accept" disabled={state.busy} onPress={() => { void state.acceptFriend(request.id); }} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="Decline" variant="outline" disabled={state.busy} onPress={() => { void state.declineFriend(request.id); }} />
              </View>
            </View>
          </View>
        ))}
        {state.sentRequests.map(request => (
          <ThemedText key={request.id} themeColor="textSecondary" accessibilityLiveRegion="polite">
            Request sent to {request.name}. Waiting for them to accept.
          </ThemedText>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <ThemedText type="heading" accessibilityRole="header">Friends</ThemedText>
          <ThemedText type="smallBold" themeColor="textSecondary">{state.friends.length}</ThemedText>
        </View>
        {state.friends.length === 0 && <ThemedText themeColor="textSecondary">Add your friends to stay safe together.</ThemedText>}
        {state.friends.length > 0 && <View>{state.friends.map((friend, index) => (
          <View key={friend.id}>
            {index > 0 && <Divider />}
            <Pressable accessibilityRole="link" accessibilityLabel={`View ${friend.name}`}
              onPress={() => router.push({ pathname: '/friends/[id]', params: { id: friend.id } })}
              style={({ pressed }) => ({
                minHeight: 64, paddingVertical: Spacing.two, gap: Spacing.three, borderRadius: Radius.control, borderCurve: 'continuous',
                backgroundColor: pressed ? theme.backgroundSelected : 'transparent',
                flexDirection: 'row', alignItems: 'center',
              })}>
              <Avatar name={friend.name} size={48} />
              <View style={{ flex: 1, gap: Spacing.half }}>
                <ThemedText type="name">{friend.name}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">{formatCheckIn(friend.lastCheckIn)}</ThemedText>
                {friend.requestedAt !== null && (
                  <ThemedText type="smallBold" themeColor="accent">
                    {friend.resolvedAt === null ? 'Check-in requested' : 'Request answered'}
                  </ThemedText>
                )}
              </View>
              <ThemedText style={{ fontSize: 26, lineHeight: 30 }} themeColor="textSecondary" accessible={false}>›</ThemedText>
            </Pressable>
          </View>
        ))}</View>}
      </SectionCard>
      <SectionCard>
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="smallBold">Your friend code</ThemedText>
          <ThemedText type="subtitle" selectable>{state.me?.code}</ThemedText>
        </View>
        <Divider />
        <ThemedText type="heading">Add a friend</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Enter their code to send a friend request. They appear once they accept.</ThemedText>
        <TextField ref={codeInput} label="Friend code" value={code} placeholder="Their code"
          autoCapitalize="characters" autoCorrect={false} editable={!state.busy} maxLength={32} />
        <TextField ref={nameInput} label="Name (optional)" value={name} placeholder="How you want to see them"
          autoCapitalize="words" editable={!state.busy} maxLength={40} />
        <Button label={state.busy ? 'Sending...' : 'Send friend request'} disabled={state.busy}
          onPress={() => { void addFriend(); }} />
      </SectionCard>
    </AppScreen>
  );
}
