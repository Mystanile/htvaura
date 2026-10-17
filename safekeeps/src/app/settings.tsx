import { Column, Host, Picker, Switch } from '@expo/ui';

import { ServerAddress } from '@/components/server-address';
import { ConnectionStatus } from '@/components/connection-status';
import { AppScreen } from '@/components/app-screen';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { ButtonSeed } from '@/constants/theme';
import { useSafekeeps } from '@/state/safekeeps';

export default function SettingsScreen() {
  const state = useSafekeeps();
  return (
    <AppScreen>
      <ConnectionStatus />
      <SectionCard>
        <ThemedText type="heading">Check-in reminders</ThemedText>
        <Host colorScheme="light" matchContents seedColor={ButtonSeed}>
          <Column spacing={16}>
            <Switch label="Show check-in countdown" value={state.remindersEnabled} onValueChange={state.setRemindersEnabled} />
            <Picker selectedValue={state.intervalMinutes} onValueChange={state.setIntervalMinutes} enabled={state.remindersEnabled}>
              <Picker.Item label="Every 15 minutes" value={15} />
              <Picker.Item label="Every 30 minutes" value={30} />
              <Picker.Item label="Every hour" value={60} />
              <Picker.Item label="Every 2 hours" value={120} />
            </Picker>
          </Column>
        </Host>
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

