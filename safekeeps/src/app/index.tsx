import { Button, Column, Host, TextInput, useNativeState, type TextInputRef } from '@expo/ui';
import { useRef } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { SectionCard } from '@/components/section-card';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { ButtonSeed, FriendsColors, Radius, Spacing } from '@/constants/theme';
import { SurfaceThemeContext, useTheme } from '@/hooks/use-theme';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

export default function HomeScreen() {
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
        <ThemedText type="heading" style={{ flex: 1 }}>SAFEKEEPS</ThemedText>
        <SettingsButton />
      </View>
    }>
      <ConnectionStatus />
      <SectionCard dark>
        <ThemedText type="smallBold" themeColor="accent">Safekeeping check in :3</ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="CHECK IN !!"
          accessibilityState={{ disabled: state.busy, busy: state.busy }}
          disabled={state.busy}
          onPress={() => { void state.recordCheckIn(); }}
          style={({ pressed }) => ({
            minHeight: 112, padding: Spacing.four, borderRadius: Radius.card,
            borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
            backgroundColor: state.busy ? theme.primaryDisabled : pressed ? theme.primaryPressed : theme.primary,
          })}>
          <ThemedText style={{ fontSize: 32, lineHeight: 40, fontWeight: '700', color: theme.onPrimary }}>
            {state.busy ? 'Saving...' : 'Check In'}
          </ThemedText>
        </Pressable>
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
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">Your friend code</ThemedText>
          <ThemedText type="name" selectable>{state.me?.code}</ThemedText>
        </View>
      </SectionCard>
      <SurfaceThemeContext value={{ ...theme, ...FriendsColors }}>
      <SectionCard>
      {state.friendRequests.length > 0 && <ThemedText type="heading">Friend requests</ThemedText>}
      {state.friendRequests.map(request => (
        <View key={request.id} style={{ gap: Spacing.two }}>
          <ThemedText type="name">{request.name} wants to add you</ThemedText>
          <Host matchContents seedColor={ButtonSeed}>
            <Column spacing={8}>
              <Button label="Accept" disabled={state.busy} onPress={() => { void state.acceptFriend(request.id); }} />
              <Button label="Decline" disabled={state.busy} onPress={() => { void state.declineFriend(request.id); }} />
            </Column>
          </Host>
        </View>
      ))}
      {state.sentRequests.map(request => (
        <ThemedText key={request.id} accessibilityLiveRegion="polite">Request sent to {request.name} · Awaiting acceptance</ThemedText>
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <ThemedText type="heading">Friends</ThemedText>
        <ThemedText themeColor="textSecondary">{state.friends.length}</ThemedText>
      </View>
      {state.friends.length === 0 && <ThemedText themeColor="textSecondary">Add your friends to stay safe together !</ThemedText>}
      {state.friends.map(friend => (
        <Link key={friend.id} href={{ pathname: '/friends/[id]', params: { id: friend.id } }} asChild>
          <Pressable accessibilityRole="link" accessibilityLabel={`View ${friend.name}`}
            style={({ pressed }) => ({
              padding: Spacing.three, gap: Spacing.three, borderRadius: Radius.card,
              borderCurve: 'continuous', backgroundColor: pressed ? FriendsColors.backgroundSelected : FriendsColors.backgroundElement,
              borderWidth: 1, borderColor: FriendsColors.text, flexDirection: 'row', alignItems: 'center',
            })}>
            <View style={{
              width: 48, height: 48, borderRadius: Radius.avatar, backgroundColor: theme.accentSoft,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ThemedText type="name" style={{ color: theme.onPrimary }}>{friend.name.charAt(0).toUpperCase()}</ThemedText>
            </View>
            <View style={{ flex: 1, gap: Spacing.one }}>
              <ThemedText type="name">{friend.name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{formatCheckIn(friend.lastCheckIn)}</ThemedText>
              {friend.requestedAt !== null && (
                <ThemedText type="small" themeColor="accent">
                  {friend.resolvedAt === null ? 'Check-in requested' : 'Request answered'}
                </ThemedText>
              )}
            </View>
            <ThemedText style={{ fontSize: 26 }} themeColor="textSecondary">›</ThemedText>
          </Pressable>
        </Link>
      ))}
      </SectionCard>
      </SurfaceThemeContext>
      <SectionCard dark>
        <ThemedText type="heading">Add a friend</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Enter their code to send a friend request. They will appear once they accept.</ThemedText>
        <Host matchContents seedColor={ButtonSeed}>
          <Column spacing={12}>
            <TextInput ref={codeInput} value={code} placeholder="Friend code"
              autoCapitalize="characters" autoCorrect={false} editable={!state.busy} maxLength={32} />
            <TextInput ref={nameInput} value={name} placeholder="Name (optional)"
              autoCapitalize="words" editable={!state.busy} maxLength={40} />
            <Button label={state.busy ? 'Sending...' : 'Send friend request'} disabled={state.busy}
              onPress={() => { void addFriend(); }} />
          </Column>
        </Host>
      </SectionCard>
    </AppScreen>
  );
}

