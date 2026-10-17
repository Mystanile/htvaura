import type { PropsWithChildren } from 'react';
import { View } from 'react-native';
import { Artwork, PixelArt } from '@/components/pixel-art';

export function SectionCard({ children, friends = false }: PropsWithChildren<{
  accent?: boolean; dark?: boolean; friends?: boolean;
}>) {
  return (
    <View style={{ padding: 20, paddingTop: friends ? 22 : 34, paddingBottom: 24, gap: 16 }}>
      <PixelArt source={friends ? Artwork.friends : Artwork.section} />
      {children}
    </View>
  );
}
