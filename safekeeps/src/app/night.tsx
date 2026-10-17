import { Column, Host, Picker, Switch, TextInput, useNativeState } from '@expo/ui';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { Artwork, PixelArt } from '@/components/pixel-art';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { AppFont, ButtonSeed } from '@/constants/theme';
import { useSafekeeps } from '@/state/safekeeps';

export default function NightScreen() {
  const state = useSafekeeps();
  const pin = useNativeState('');
  const [ranks, setRanks] = useState<Record<string, number>>({});
  const [silentContacts, setSilentContacts] = useState<Record<string, boolean>>({});
  const [started, setStarted] = useState(false);

  async function start() {
    const contacts = state.friends.filter(friend => (ranks[friend.id] ?? 0) > 0);
    const tiers = [...new Set(contacts.map(friend => ranks[friend.id]))].sort((a, b) => a - b)
      .map(rank => contacts.filter(friend => ranks[friend.id] === rank).map(friend => friend.id));
    const silent = state.friends.filter(friend => silentContacts[friend.id]).map(friend => friend.id);
    if (await state.startNight(pin.value, tiers, silent)) {
      pin.set('');
      setStarted(true);
    }
  }

  return (
    <AppScreen>
      <ConnectionStatus />
      {started ? (
        <SectionCard>
          <ThemedText type="heading" accessibilityLiveRegion="polite">Your night has started</ThemedText>
          <ThemedText>Your chosen contacts and check-in interval are saved for this night.</ThemedText>
          <Link href="/" asChild>
            <Pressable accessibilityRole="link" style={{ paddingVertical: 12 }}>
              <ThemedText type="name">Return to check in</ThemedText>
            </Pressable>
          </Link>
        </SectionCard>
      ) : (
        <>
          <SectionCard>
            <ThemedText type="heading">Start a night</ThemedText>
            <ThemedText>Choose a PIN you will remember. You need it to cancel an alert.</ThemedText>
            <Host colorScheme="light" matchContents seedColor={ButtonSeed}>
              <Column spacing={16}>
                <TextInput value={pin} placeholder="Your PIN" secureTextEntry editable={!state.busy}
                  autoCorrect={false} autoCapitalize="none"
                  style={{ backgroundColor: '#EAE3CB', borderColor: '#8A7857', borderWidth: 1, padding: 12 }}
                  textStyle={{ fontFamily: AppFont, color: '#5C5439' }} />
                <Switch label="Automatic check-ins" value={state.remindersEnabled}
                  onValueChange={state.setRemindersEnabled} disabled={state.busy} />
                <Picker selectedValue={state.intervalMinutes} onValueChange={state.setIntervalMinutes}
                  enabled={!state.busy && state.remindersEnabled}>
                  <Picker.Item label="Every 15 minutes" value={15} />
                  <Picker.Item label="Every 30 minutes" value={30} />
                  <Picker.Item label="Every hour" value={60} />
                  <Picker.Item label="Every 2 hours" value={120} />
                </Picker>
              </Column>
            </Host>
          </SectionCard>
          <SectionCard friends>
            <ThemedText type="heading">Your contacts</ThemedText>
            <ThemedText>Choose who is alerted first, second, or third if you miss a check-in. Select at least one contact and one silent-alert contact.</ThemedText>
            {state.friends.length === 0 && <ThemedText>Add an accepted friend before starting a night.</ThemedText>}
            {state.friends.map(friend => (
              <View key={friend.id} style={{ gap: 8 }}>
                <ThemedText type="name">{friend.name}</ThemedText>
                <Host colorScheme="light" matchContents seedColor={ButtonSeed}>
                  <Column spacing={8}>
                    <Picker selectedValue={ranks[friend.id] ?? 0} enabled={!state.busy}
                      onValueChange={rank => setRanks(previous => ({ ...previous, [friend.id]: rank }))}>
                      <Picker.Item label="No check-in alerts" value={0} />
                      <Picker.Item label="Alert first" value={1} />
                      <Picker.Item label="Alert second" value={2} />
                      <Picker.Item label="Alert third" value={3} />
                    </Picker>
                    <Switch label="Silent-alert contact" value={!!silentContacts[friend.id]} disabled={state.busy}
                      onValueChange={selected => setSilentContacts(previous => ({ ...previous, [friend.id]: selected }))} />
                  </Column>
                </Host>
              </View>
            ))}
          </SectionCard>
          <Pressable accessibilityRole="button" accessibilityLabel="Start a night"
            disabled={state.busy || state.friends.length === 0}
            accessibilityState={{ disabled: state.busy || state.friends.length === 0, busy: state.busy }}
            onPress={() => { void start(); }}
            style={({ pressed }) => ({ minHeight: 80, alignItems: 'center', justifyContent: 'center',
              opacity: state.busy || state.friends.length === 0 ? 0.5 : pressed ? 0.8 : 1 })}>
            <PixelArt source={Artwork.checkIn} />
            <ThemedText type="heading">{state.busy ? 'Starting...' : 'Start a night'}</ThemedText>
          </Pressable>
        </>
      )}
    </AppScreen>
  );
}
