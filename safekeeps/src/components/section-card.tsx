import type { PropsWithChildren } from 'react';
import { View } from 'react-native';

import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// The one card in the app. `tone` tints it: accent for calm highlights, danger for alerts.
export function SectionCard({ children, tone = 'plain' }: PropsWithChildren<{ tone?: 'plain' | 'accent' | 'danger' }>) {
  const theme = useTheme();
  const look = {
    plain: { bg: theme.backgroundElement, border: theme.border },
    accent: { bg: theme.accentSoft, border: theme.accentSoft },
    danger: { bg: theme.dangerSoft, border: theme.danger },
  }[tone];
  return (
    <View style={{
      padding: Spacing.four, gap: Spacing.three, borderRadius: Radius.card,
      borderCurve: 'continuous', backgroundColor: look.bg, borderWidth: 1, borderColor: look.border,
    }}>{children}</View>
  );
}
