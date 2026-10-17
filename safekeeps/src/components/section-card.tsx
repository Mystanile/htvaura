import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Artwork, PixelFrame } from '@/components/pixel-art';
import { Tones, type Tone } from '@/constants/theme';
import { SurfaceThemeContext } from '@/hooks/use-theme';

export function SectionCard({ children, tone = 'plain' }: PropsWithChildren<{ tone?: Tone }>) {
  const friends = tone === 'green';
  return (
    <SurfaceThemeContext value={Tones.light[tone]}>
      <View style={{ padding: 20, paddingTop: friends ? 22 : 34, paddingBottom: 24, gap: 16 }}>
        <PixelFrame sprite={friends ? Artwork.friends : Artwork.section} />
        {children}
      </View>
    </SurfaceThemeContext>
  );
}
