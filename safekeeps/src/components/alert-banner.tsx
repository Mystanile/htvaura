import { useNameOf } from '@/components/alerts-section';
import { SectionCard } from '@/components/section-card';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { useSafekeeps } from '@/state/safekeeps';

// Same wording for every alert kind, so a duress alert never looks different from the outside.
export function AlertBanner() {
  const state = useSafekeeps();
  const theme = useTheme();
  const nameOf = useNameOf();
  const alerts = state.night?.alerts ?? [];
  if (alerts.length === 0) return null;
  const first = nameOf(alerts[0].user_id) ?? 'A friend';
  return (
    <SectionCard tone="danger">
      <ThemedText type="name" style={{ color: theme.danger }} accessibilityLiveRegion="polite">
        {alerts.length === 1 ? `${first} could use a hand` : `${first} and ${alerts.length - 1} more could use a hand`}
      </ThemedText>
    </SectionCard>
  );
}
