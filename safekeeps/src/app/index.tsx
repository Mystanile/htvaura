import { useState } from 'react';
import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';

import { AlertBanner } from '@/components/alert-banner';
import { AlertsSection } from '@/components/alerts-section';
import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { CheckInCard } from '@/components/check-in-card';
import { ConnectionStatus } from '@/components/connection-status';
import { Field } from '@/components/form';
import { NightEntry } from '@/components/night-entry';
import { SectionCard } from '@/components/section-card';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Friend } from '@/services/demo-api';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

// A friend row. It sits inside the green card, so useTheme() here already gives the green card colors.
function FriendRow({ friend: { id, name, lastCheckIn, requestedAt, resolvedAt } }: { friend: Friend }) {
  const theme = useTheme();
  return (
    <Link href={{ pathname: '/friends/[id]', params: { id } }} asChild>
      <Pressable accessibilityRole="link" accessibilityLabel={`View ${name}`}>
        {/* the look is on an inner View: Link asChild cannot pass a style function to the Pressable */}
        {({ pressed }) => (
          <View style={{
            padding: Spacing.three, gap: Spacing.three, borderRadius: Radius.control, minHeight: TouchTarget + 28,
            borderCurve: 'continuous', backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
            borderWidth: 1.5, borderColor: theme.accent, flexDirection: 'row', alignItems: 'center',
          }}>
            <View style={{
              width: 48, height: 48, borderRadius: Radius.control, backgroundColor: theme.accentSoft,
              alignItems: 'center', justifyContent: 'center',
            }}>
              <ThemedText type="name" themeColor="text">{name.charAt(0).toUpperCase()}</ThemedText>
            </View>
            <View style={{ flex: 1, gap: Spacing.half }}>
              <ThemedText type="name">{name}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">{formatCheckIn(lastCheckIn)}</ThemedText>
              {requestedAt !== null && (
                <ThemedText type="smallBold">
                  {resolvedAt === null ? 'Check-in requested' : 'Request answered'}
                </ThemedText>
              )}
            </View>
            <ThemedText style={{ fontSize: 26, lineHeight: 30 }} themeColor="textSecondary" accessible={false}>›</ThemedText>
          </View>
        )}
      </Pressable>
    </Link>
  );
}

export default function HomeScreen() {
  const state = useSafekeeps();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');

  async function addFriend() {
    if (await state.addFriend(code, name)) {
      setCode('');
      setName('');
    }
  }

  return (
    <AppScreen header={
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <ThemedText type="heading" accessibilityRole="header" style={{ flex: 1 }}>SAFEKEEPS</ThemedText>
        <SettingsButton />
      </View>
    }>
      <AlertBanner />
      <ConnectionStatus />
      <AlertsSection />
      <SectionCard tone="ink">
        <ThemedText type="smallBold" themeColor="accent">Safekeeping check in :3</ThemedText>
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
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">Your friend code</ThemedText>
          <ThemedText type="name" selectable>{state.me?.code}</ThemedText>
        </View>
      </SectionCard>
      <SectionCard tone="green">
        {state.friendRequests.length > 0 && <ThemedText type="heading">Friend requests</ThemedText>}
        {state.friendRequests.map(request => (
          <View key={request.id} style={{ gap: Spacing.two }}>
            <ThemedText type="name">{request.name} wants to add you</ThemedText>
            <View style={{ flexDirection: 'row', gap: Spacing.two }}>
              <AppButton flex label="Accept" disabled={state.busy} onPress={() => { void state.acceptFriend(request.id); }} />
              <AppButton flex label="Decline" variant="secondary" disabled={state.busy} onPress={() => { void state.declineFriend(request.id); }} />
            </View>
          </View>
        ))}
        {state.sentRequests.map(request => (
          <ThemedText key={request.id} accessibilityLiveRegion="polite">Request sent to {request.name} · Awaiting acceptance</ThemedText>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ThemedText type="heading" accessibilityRole="header">Friends</ThemedText>
          <ThemedText type="smallBold">{state.friends.length}</ThemedText>
        </View>
        {state.friends.length === 0 && <ThemedText>Add your friends to stay safe together!</ThemedText>}
        {state.friends.map(friend => <FriendRow key={friend.id} friend={friend} />)}
      </SectionCard>
      <SectionCard tone="ink">
        <ThemedText type="heading" accessibilityRole="header">Add a friend</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">Enter their code to send a friend request. They will appear once they accept.</ThemedText>
        <Field label="Friend code" value={code} onChangeText={setCode} placeholder="Their code"
          autoCapitalize="characters" autoCorrect={false} editable={!state.busy} maxLength={32} />
        <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="What you call them"
          autoCapitalize="words" editable={!state.busy} maxLength={40} />
        <AppButton label={state.busy ? 'Sending...' : 'Send friend request'} disabled={state.busy}
          onPress={() => { void addFriend(); }} />
      </SectionCard>
    </AppScreen>
  );
}
