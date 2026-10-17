import { Button } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

export function ConnectionStatus() {
  const state = useSafekeeps();
  const theme = useTheme();
  if (!state.error) return null;
  return (
    <SectionCard tone="danger">
      <ThemedText selectable style={{ color: theme.danger }} accessibilityLiveRegion="polite">{state.error}</ThemedText>
      <Button label="Retry connection" variant="outline" disabled={state.busy} onPress={() => { void state.refresh(); }} />
    </SectionCard>
  );
}
