import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { CardColors, Radius, Spacing } from '@/constants/theme';
import { SurfaceThemeContext, useTheme } from '@/hooks/use-theme';

export function SectionCard({ children, accent = false, dark = false }: PropsWithChildren<{ accent?: boolean; dark?: boolean }>) {
  const theme = useTheme();
  const surface = dark ? { ...theme, ...CardColors } : theme;
  return (
    <SurfaceThemeContext value={surface}>
    <View style={{
      padding: Spacing.four, gap: Spacing.three, borderRadius: Radius.card,
      borderCurve: 'continuous', backgroundColor: dark ? surface.backgroundElement : accent ? theme.accentSoft : theme.backgroundElement,
      borderWidth: 1, borderColor: surface.border,
    }}>{children}</View>
    </SurfaceThemeContext>
  );
}

