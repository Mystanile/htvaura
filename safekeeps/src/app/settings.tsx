import { useState } from 'react';

import { AppButton } from '@/components/app-button';
import { ServerAddress } from '@/components/server-address';
import { ConnectionStatus } from '@/components/connection-status';
import { AppScreen } from '@/components/app-screen';
import { Choice, INTERVALS, SwitchRow } from '@/components/form';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { useBand } from '@/hooks/use-band';
import { forgetBand, pairBand } from '@/services/band-relay';
import { useSafekeeps } from '@/state/safekeeps';

// Only shown when this build has Bluetooth (not in Expo Go or on the web).
function BandSection() {
  const band = useBand();
  const [pairing, setPairing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function pair() {
    setPairing(true);
    setProblem(null);
    try {
      await pairBand();
    } catch (e) {
      setProblem((e as Error).message);
    }
    setPairing(false);
  }

  return (
    <SectionCard>
      <ThemedText type="heading">Band</ThemedText>
      {band.paired ? (
        <>
          <ThemedText themeColor="textSecondary">{band.connected ? 'Connected' : 'Not connected'}</ThemedText>
          <AppButton label="Forget band" variant="danger" onPress={() => { void forgetBand(); }} />
        </>
      ) : (
        <>
          <ThemedText themeColor="textSecondary">Not connected. Turn your KAZE band on and hold it close.</ThemedText>
          <AppButton label={pairing ? 'Looking for band...' : 'Pair band'} disabled={pairing} onPress={() => { void pair(); }} />
        </>
      )}
      {problem && <ThemedText accessibilityLiveRegion="polite" themeColor="danger">{problem}</ThemedText>}
    </SectionCard>
  );
}

export default function SettingsScreen() {
  const state = useSafekeeps();
  const band = useBand();
  return (
    <AppScreen>
      <ConnectionStatus />
      <SectionCard>
        <ThemedText type="heading">Check-in reminders</ThemedText>
        <SwitchRow label="Show check-in countdown" value={state.remindersEnabled} onValueChange={state.setRemindersEnabled} />
        <Choice label="How often" options={INTERVALS} value={state.intervalMinutes} onChange={state.setIntervalMinutes}
          disabled={!state.remindersEnabled} />
      </SectionCard>
      {band.available ? <BandSection /> : (
        <SectionCard>
          <ThemedText type="heading">Bluetooth device</ThemedText>
          <ThemedText themeColor="textSecondary">No device connected.</ThemedText>
        </SectionCard>
      )}
      <SectionCard>
        <ThemedText type="heading">Emergency contacts</ThemedText>
        <ThemedText themeColor="textSecondary">No contacts configured.</ThemedText>
      </SectionCard>
      <SectionCard><ServerAddress /></SectionCard>
    </AppScreen>
  );
}
