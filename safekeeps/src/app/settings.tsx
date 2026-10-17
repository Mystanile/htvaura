import { ServerAddress } from '@/components/server-address';
import { ConnectionStatus } from '@/components/connection-status';
import { AppScreen } from '@/components/app-screen';
import { Choice, INTERVALS, SwitchRow } from '@/components/form';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';

export default function SettingsScreen() {
  const state = useSafekeeps();
  return (
    <AppScreen>
      <ConnectionStatus />
      <SectionCard>
        <ThemedText type="heading">Check-in reminders</ThemedText>
        <SwitchRow label="Show check-in countdown" value={state.remindersEnabled} onValueChange={state.setRemindersEnabled} />
        <Choice label="How often" options={INTERVALS} value={state.intervalMinutes} onChange={state.setIntervalMinutes}
          disabled={!state.remindersEnabled} />
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Bluetooth device</ThemedText>
        <ThemedText themeColor="textSecondary">No device connected.</ThemedText>
      </SectionCard>
      <SectionCard>
        <ThemedText type="heading">Emergency contacts</ThemedText>
        <ThemedText themeColor="textSecondary">No contacts configured.</ThemedText>
      </SectionCard>
      <SectionCard><ServerAddress /></SectionCard>
    </AppScreen>
  );
}
