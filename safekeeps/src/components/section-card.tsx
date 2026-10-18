import { useMemo, type PropsWithChildren } from 'react';
import Animated, { Easing, FadeInUp, useReducedMotion } from 'react-native-reanimated';
import { Artwork, PixelFrame } from '@/components/pixel-art';
import { Tones, type Tone } from '@/constants/theme';
import { SurfaceThemeContext } from '@/hooks/use-theme';

export function SectionCard({ children, tone = 'plain', entranceDelay = 0 }: PropsWithChildren<{ tone?: Tone; entranceDelay?: number }>) {
  const friends = tone === 'green';
  const reducedMotion = useReducedMotion();
  const entrance = useMemo(() => FadeInUp.duration(280).delay(entranceDelay)
    .easing(Easing.bezier(0.23, 1, 0.32, 1))
    .withInitialValues({ opacity: 0, transform: [{ translateY: -20 }] }), [entranceDelay]);
  return (
    <SurfaceThemeContext value={Tones.light[tone]}>
      <Animated.View entering={reducedMotion ? undefined : entrance}
        style={{ padding: 20, paddingTop: friends ? 22 : 34, paddingBottom: 24, gap: 16 }}>
        <PixelFrame sprite={friends ? Artwork.friends : Artwork.section} />
        {children}
      </Animated.View>
    </SurfaceThemeContext>
  );
}
