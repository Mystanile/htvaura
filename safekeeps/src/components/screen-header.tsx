import type { NativeStackHeaderProps } from 'expo-router';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Artwork, PixelFrame } from '@/components/pixel-art';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Our own header for pushed screens: the Home banner with a themed back button, so no system (glass) header shows.
export function ScreenHeader({ navigation, options, back }: NativeStackHeaderProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: theme.background, paddingTop: insets.top + 4, paddingBottom: 4, paddingHorizontal: 16 }}>
      <Image source={require('@/assets/images/homebound/grass.png')} style={StyleSheet.absoluteFill} contentFit="cover"
        accessible={false} pointerEvents="none" />
      <View style={{ width: '100%', maxWidth: Artwork.header.width, height: Artwork.header.height, alignSelf: 'center',
        paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: Spacing.two }}>
        <PixelFrame sprite={Artwork.header} />
        {back && (
          <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => navigation.goBack()}
            style={({ pressed }) => ({ width: 44, height: 44, flexShrink: 0, opacity: pressed ? 0.7 : 1,
              alignItems: 'center', justifyContent: 'center' })}>
            <ThemedText maxFontSizeMultiplier={1.2} style={{ fontSize: 30, lineHeight: 36 }}>{'<'}</ThemedText>
          </Pressable>
        )}
        <ThemedText type="heading" accessibilityRole="header" maxFontSizeMultiplier={1.2} numberOfLines={1}
          adjustsFontSizeToFit minimumFontScale={0.6} style={{ flex: 1, fontSize: 28 }}>
          {options.title ?? ''}
        </ThemedText>
      </View>
    </View>
  );
}
