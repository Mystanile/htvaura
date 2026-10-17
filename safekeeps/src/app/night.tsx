import { useNativeState } from '@expo/ui';
import * as Location from 'expo-location';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { Avatar, Button, Divider, Segmented, SwitchRow, TextField } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

// 0 means "not a contact"
type Setup = { tier: number; duress: boolean };

export default function NightScreen() {
  'use no memo'; // @expo/ui web TextInput only redraws when this screen re-renders, the compiler would skip that
  const state = useSafekeeps();
  const theme = useTheme();
  const pin = useNativeState('');
  const pinAgain = useNativeState('');
  const [interval, setInterval] = useState(state.intervalMinutes);
  const [setup, setSetup] = useState<Record<string, Setup>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const get = (id: string): Setup => setup[id] ?? { tier: 0, duress: false };
  const change = (id: string, patch: Partial<Setup>) => setSetup(prev => ({ ...prev, [id]: { ...get(id), ...patch } }));

  async function start() {
    const ids = state.friends.map(friend => friend.id);
    if (!/^\d{4}$/.test(pin.value)) return setProblem('Your PIN needs to be exactly 4 digits.');
    if (pin.value !== pinAgain.value) return setProblem('The two PINs do not match. Try typing them again.');
    // ranked list: Tier 1 first, empty tiers skipped
    const tiers = [1, 2, 3].map(tier => ids.filter(id => get(id).tier === tier)).filter(tier => tier.length > 0);
    if (tiers.length === 0) return setProblem('Pick at least one friend for Tier 1, 2 or 3 so someone can help.');
    const duress = ids.filter(id => get(id).duress);
    if (duress.length === 0) return setProblem('Pick at least one duress contact, someone who can be told silently.');
    setProblem(null);
    // A "no" is fine, the night still runs. A browser prompt can stay unanswered, so on the web we wait 3 s at most.
    const asked = Location.requestForegroundPermissionsAsync().catch(() => null);
    await (Platform.OS === 'web' ? Promise.race([asked, new Promise(done => setTimeout(done, 3000))]) : asked);
    if (await state.startNight({ pin: pin.value, tiers, duress_contacts: duress, check_every_minutes: interval })) {
      state.setIntervalMinutes(interval); // so her "Next check-in in X min" line follows the night
      router.back();
    }
  }

  return (
    <AppScreen>
      <Stack.Screen options={{ title: 'Start a night' }} />
      <ConnectionStatus />
      <SectionCard>
        <ThemedText type="heading">Your PIN</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Your PIN cancels an alert. Enter it twice so we know it is right.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          If someone is watching, a wrong PIN shows a fake &quot;Alert ended&quot; with an outlined check, but help keeps coming.
          The correct PIN shows a filled check and really ends the alert.
        </ThemedText>
        <TextField label="PIN" value={pin} placeholder="4 digits" keyboardType="number-pad"
          secureTextEntry autoCorrect={false} editable={!state.busy} maxLength={4} />
        <TextField label="Enter it again" value={pinAgain} placeholder="4 digits" keyboardType="number-pad"
          secureTextEntry autoCorrect={false} editable={!state.busy} maxLength={4} />
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Who helps</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Tier 1 is asked first. If nobody in a tier says &quot;I&apos;m on it&quot;, the next tier is asked.
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Duress contacts are told silently when you use the secret signal. Nobody else in the group is ever told, and only you can see this list.
        </ThemedText>
        {state.friends.length === 0 && <ThemedText themeColor="textSecondary">Add your friends first to pick who helps.</ThemedText>}
        {state.friends.map((friend, index) => (
          <View key={friend.id} style={{ gap: Spacing.three }}>
            {index > 0 && <Divider />}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
              <Avatar name={friend.name} />
              <ThemedText type="name" style={{ flex: 1 }}>{friend.name}</ThemedText>
            </View>
            <Segmented value={get(friend.id).tier} onChange={tier => change(friend.id, { tier })} options={[
              { label: 'None', value: 0 }, { label: 'Tier 1', value: 1 }, { label: 'Tier 2', value: 2 }, { label: 'Tier 3', value: 3 },
            ]} />
            <SwitchRow label="Duress contact" value={get(friend.id).duress} onValueChange={duress => change(friend.id, { duress })} />
          </View>
        ))}
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Check-ins</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">How often should we ask if you are okay?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          While a night runs, this phone sends its location to the server. Your contacts only see it during an alert.
        </ThemedText>
        <Segmented value={interval} onChange={setInterval} options={[
          { label: '15 min', value: 15 }, { label: '30 min', value: 30 }, { label: '1 hour', value: 60 }, { label: '2 hours', value: 120 },
        ]} />
        <Button label={state.busy ? 'Starting...' : 'Start the night'} disabled={state.busy}
          onPress={() => { void start(); }} />
        {(problem ?? state.error) && (
          <ThemedText style={{ color: theme.danger }} accessibilityLiveRegion="polite">{problem ?? state.error}</ThemedText>
        )}
      </SectionCard>
    </AppScreen>
  );
}
