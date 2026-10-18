import { View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

export function ConnectionStatus() {
  const state = useSafekeeps();
  const theme = useTheme();
  if (!state.error) return null;
  return (
    <View style={{
      padding: Spacing.three, gap: Spacing.two, borderRadius: Radius.control, borderCurve: 'continuous',
      borderWidth: 1.5, borderColor: theme.danger, backgroundColor: theme.backgroundElement,
    }}>
      <ThemedText selectable announce style={{ color: theme.danger }}>{state.error}</ThemedText>
      <AppButton variant="secondary" label="Retry connection" disabled={state.busy} onPress={() => { void state.refresh(); }} />
    </View>
  );
}
