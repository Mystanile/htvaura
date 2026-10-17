import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Radius, Spacing, Tones, type Tone } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { SurfaceThemeContext } from '@/hooks/use-theme';

// The card sets its own colors for everything inside it (see Tones in constants/theme.ts).
export function SectionCard({ children, tone = 'plain' }: PropsWithChildren<{ tone?: Tone }>) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const surface = Tones[scheme][tone];
  return (
    <SurfaceThemeContext value={surface}>
      <View style={{
        padding: Spacing.card, gap: Spacing.three, borderRadius: Radius.card,
        borderCurve: 'continuous', backgroundColor: surface.backgroundElement,
        borderWidth: 1, borderColor: surface.border,
      }}>{children}</View>
    </SurfaceThemeContext>
  );
}
