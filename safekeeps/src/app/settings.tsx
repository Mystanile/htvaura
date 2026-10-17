import { Column, Host, Picker, Switch } from '@expo/ui';

import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';

export default function SettingsScreen() {
  const state = useSafekeeps();
  return (
    <AppScreen>
      <ThemedText type="smallBold">Check-in reminders</ThemedText>
      <Host matchContents>
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

      <ThemedText type="smallBold">Bluetooth device</ThemedText>
      <ThemedText>No device connected.</ThemedText>
      <ThemedText type="smallBold">Emergency contacts</ThemedText>
      <ThemedText>No contacts configured.</ThemedText>

    </AppScreen>
  );
}