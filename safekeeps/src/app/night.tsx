import * as Location from 'expo-location';
import { Stack, router } from 'expo-router';
import { useState } from 'react';
import { Platform, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { Choice, Field, INTERVALS, SwitchRow } from '@/components/form';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

// 0 means "not a contact"
type Setup = { tier: number; duress: boolean };

const TIERS = [
  { label: 'Not a contact', short: 'None', value: 0 }, { label: 'Tier 1', value: 1 },
  { label: 'Tier 2', value: 2 }, { label: 'Tier 3', value: 3 },
];

export default function NightScreen() {
  const state = useSafekeeps();
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [pinAgain, setPinAgain] = useState('');
  const [interval, setInterval] = useState(state.intervalMinutes);
  const [setup, setSetup] = useState<Record<string, Setup>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const get = (id: string): Setup => setup[id] ?? { tier: 0, duress: false };
  const change = (id: string, patch: Partial<Setup>) => setSetup(prev => ({ ...prev, [id]: { ...get(id), ...patch } }));

  async function start() {
    const ids = state.friends.map(friend => friend.id);
    if (!/^\d{4}$/.test(pin)) return setProblem('Your PIN needs to be exactly 4 digits.');
    if (pin !== pinAgain) return setProblem('The two PINs do not match. Try typing them again.');
    // ranked list: Tier 1 first, empty tiers skipped
    const tiers = [1, 2, 3].map(tier => ids.filter(id => get(id).tier === tier)).filter(tier => tier.length > 0);
    if (tiers.length === 0) return setProblem('Pick at least one friend for Tier 1, 2 or 3 so someone can help.');
    const duress = ids.filter(id => get(id).duress);
    if (duress.length === 0) return setProblem('Pick at least one duress contact, someone who can be told silently.');
    setProblem(null);
    // A "no" is fine, the night still runs. A browser prompt can stay unanswered, so on the web we wait 3 s at most.
    const asked = Location.requestForegroundPermissionsAsync().catch(() => null);
    await (Platform.OS === 'web' ? Promise.race([asked, new Promise(done => setTimeout(done, 3000))]) : asked);
    if (await state.startNight({ pin, tiers, duress_contacts: duress, check_every_minutes: interval })) {
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
        <Field label="4-digit PIN" value={pin} onChangeText={setPin} placeholder="4 digits" keyboardType="number-pad"
          secureTextEntry autoCorrect={false} editable={!state.busy} maxLength={4} />
        <Field label="Enter it again" value={pinAgain} onChangeText={setPinAgain} placeholder="Same 4 digits" keyboardType="number-pad"
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
        {state.friends.map(friend => (
          <View key={friend.id} style={{ gap: Spacing.two, paddingTop: Spacing.three, borderTopWidth: 1, borderTopColor: theme.border }}>
            <ThemedText type="name">{friend.name}</ThemedText>
            <Choice options={TIERS} value={get(friend.id).tier} onChange={tier => change(friend.id, { tier })} />
            <SwitchRow label="Duress contact" value={get(friend.id).duress} onValueChange={duress => change(friend.id, { duress })} />
          </View>
        ))}
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Check-ins</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">How often should we ask if you are okay?</ThemedText>
        <Choice label="How often" options={INTERVALS} value={interval} onChange={setInterval} />
        <ThemedText type="small" themeColor="textSecondary">
          While a night runs, this phone sends its location to the server. Your contacts only see it during an alert.
        </ThemedText>
      </SectionCard>
      {(problem ?? state.error) && (
        <ThemedText accessibilityLiveRegion="polite" themeColor="danger">{problem ?? state.error}</ThemedText>
      )}
      <AppButton label={state.busy ? 'Starting...' : 'Start the night'} disabled={state.busy}
        onPress={() => { void start(); }} />
    </AppScreen>
  );
}
