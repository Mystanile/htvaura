import { router } from 'expo-router';
import { Pressable } from 'react-native';
import { Artwork, PixelSprite } from '@/components/pixel-art';

export function SettingsButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings and device"
      onPress={() => router.push('/settings')} hitSlop={8}
      style={({ pressed }) => ({ width: 48, height: 48, flexShrink: 0, opacity: pressed ? 0.7 : 1,
        alignItems: 'center', justifyContent: 'center' })}>
      <PixelSprite sprite={Artwork.settings} />
    </Pressable>
  );
}
