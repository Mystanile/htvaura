import { AppScreen } from '@/components/app-screen';
import { ConnectionStatus } from '@/components/connection-status';
import { Segmented, SwitchRow } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ServerAddress } from '@/components/server-address';
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
        <Segmented value={state.intervalMinutes} onChange={state.setIntervalMinutes} disabled={!state.remindersEnabled} options={[
          { label: '15 min', value: 15 }, { label: '30 min', value: 30 }, { label: '1 hour', value: 60 }, { label: '2 hours', value: 120 },
        ]} />
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
