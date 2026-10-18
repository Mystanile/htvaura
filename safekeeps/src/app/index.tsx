import { useState } from 'react';
import { Link } from 'expo-router';
import { PixelRatio, Pressable, View } from 'react-native';

import { AlertBanner } from '@/components/alert-banner';
import { AlertsSection } from '@/components/alerts-section';
import { AppButton } from '@/components/app-button';
import { Artwork, PixelFrame } from '@/components/pixel-art';
import { AppScreen } from '@/components/app-screen';
import { CheckInCard } from '@/components/check-in-card';
import { ConnectionStatus } from '@/components/connection-status';
import { Field } from '@/components/form';
import { NightEntry } from '@/components/night-entry';
import { SectionCard } from '@/components/section-card';
import { SettingsButton } from '@/components/settings-button';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useBand } from '@/hooks/use-band';
import { useTheme } from '@/hooks/use-theme';
import { formatCheckIn, useSafekeeps } from '@/state/safekeeps';

// A friend request (the teammate's card, with option A's labeled field and buttons). The name is private to me.
function FriendRequest({ request }: { request: { id: string; name: string } }) {
  const state = useSafekeeps();
  const [name, setName] = useState('');
  const stacked = PixelRatio.getFontScale() > 1.5; // the two labels do not fit side by side at very large text
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="name">{request.name} wants to add you</ThemedText>
      <Field label="Choose a name for them" helper="Only you will see it." value={name} onChangeText={setName}
        placeholder="Name (optional)" autoCapitalize="words" editable={!state.busy} maxLength={40} />
      <View style={{ flexDirection: stacked ? 'column' : 'row', gap: Spacing.two }}>
        <AppButton flex={!stacked} label="Accept" disabled={state.busy} onPress={() => { void state.acceptFriend(request.id, name); }} />
        <AppButton flex={!stacked} label="Decline" variant="secondary" disabled={state.busy} onPress={() => { void state.declineFriend(request.id); }} />
      </View>
    </View>
  );
}

// Dark red for text on the red 'away' friend frame (4.5:1 or better on its #D96F6F fill).
const AWAY_INK = '#421C1A';

export default function HomeScreen() {
  const state = useSafekeeps();
  const theme = useTheme();
  const band = useBand();
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
      <View style={{ width: '100%', maxWidth: Artwork.header.width, height: Artwork.header.height, alignSelf: 'center',
        paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
        <PixelFrame sprite={Artwork.header} />
        <ThemedText type="heading" maxFontSizeMultiplier={1.2} style={{ flex: 1, fontSize: 28 }}>HOMEBOUND</ThemedText>
        <SettingsButton />
      </View>
    }>
      <AlertBanner />
      <ConnectionStatus />
      <AlertsSection />
      <SectionCard tone="ink" entranceDelay={70}>
        <CheckInCard />
        {band.paired && (
          <ThemedText type="small" themeColor="textSecondary">
            {!band.connected ? 'Band not connected'
              : !state.night?.view || state.night.view.state === 'ended' ? 'Band connected. Start a night to use it.' : 'Band connected'}
          </ThemedText>
        )}
        {(!state.night?.view || state.night.view.state === 'ended') && <NightEntry />}
        {state.lastCheckIn !== null && (
          <ThemedText type="small" themeColor="textSecondary" selectable>Last check-in: {formatCheckIn(state.lastCheckIn)}</ThemedText>
        )}
        {state.incoming.map(request => (
          <ThemedText key={request.id} announce>
            {request.name} asked you to check in at {formatCheckIn(request.requestedAt)}.
          </ThemedText>
        ))}
        <View style={{ gap: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">Your friend code</ThemedText>
          <ThemedText type="name" selectable>{state.me?.code}</ThemedText>
        </View>
      </SectionCard>
      <SectionCard tone="green" entranceDelay={140}>
        {state.friendRequests.length > 0 && <ThemedText type="heading">Friend requests</ThemedText>}
        {state.friendRequests.map(request => <FriendRequest key={request.id} request={request} />)}
        {state.sentRequests.map(request => (
          <ThemedText key={request.id}>Request sent to {request.name} - Awaiting acceptance</ThemedText>
        ))}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <ThemedText type="heading" accessibilityRole="header">Friends</ThemedText>
          <ThemedText type="smallBold">{state.friends.length}</ThemedText>
        </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: Math.max(6, Math.ceil(state.friends.length / 2) * 2) }, (_, index) => {
          const friend = state.friends[index];
          if (!friend) return (
            <View key={`empty-${index}`} accessible accessibilityLabel="Empty friend slot"
              style={{ width: '48%', flexGrow: 1, minHeight: 70, alignItems: 'center', justifyContent: 'center' }}>
              <PixelFrame sprite={Artwork.empty} />
              <ThemedText type="name" themeColor="textSecondary">EMPTY</ThemedText>
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
                  width: '100%', minHeight: 70,
                  paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center',
                }}>
                <PixelFrame sprite={present ? Artwork.present : Artwork.away} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <ThemedText type="name" numberOfLines={2} style={{ flex: 1, fontSize: 17, lineHeight: 24, color: present ? theme.accent : AWAY_INK }}>{friend.name}</ThemedText>
                  <ThemedText maxFontSizeMultiplier={1.4} style={{ fontSize: 9, color: present ? theme.accent : AWAY_INK }}>CHECK IN?</ThemedText>
                </View>
                <ThemedText style={{ fontSize: 11, lineHeight: 16, color: present ? theme.accent : AWAY_INK }}>{status}</ThemedText>
              </Pressable>
            </Link>
            </View>
          );
        })}
      </View>
      </SectionCard>
      <SectionCard tone="ink" entranceDelay={210}>
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
