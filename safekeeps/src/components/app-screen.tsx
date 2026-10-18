import type { PropsWithChildren, ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { Easing, FadeInUp, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import { Artwork, PixelSprite } from '@/components/pixel-art';
import { ScreenParticles } from '@/components/pixel-particles';

const headerEntrance = FadeInUp.duration(280)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .withInitialValues({ opacity: 0, transform: [{ translateY: -16 }] });
// grass.png (736 x 1308) repeats every 392 rows. The grass moves at half the scroll speed and jumps back by one
// repeat when it has moved that far, so it looks the same and its edge never shows, on a screen of any length.
const GRASS = { width: 736, height: 1308, repeat: 392 };
const PARALLAX = 0.5;
// On a phone the cards cover most of the grass, so a few flowers and stones sit in the side gutters. They repeat
// with the grass (at = how far down one repeat), so the jump back stays invisible.
const DECOR = [
  { sprite: Artwork.flowerWhite, left: true, at: 0.08 },
  { sprite: Artwork.stone, left: false, at: 0.33 },
  { sprite: Artwork.flowerRed, left: true, at: 0.58 },
  { sprite: Artwork.flowerWhite, left: false, at: 0.83 },
];

export function AppScreen({ children, topInset = false, header }: PropsWithChildren<{ topInset?: boolean; header?: ReactNode }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const window = useWindowDimensions();
  // Big enough to cover the screen with one repeat to spare below it.
  const scale = Math.max(window.width / GRASS.width, window.height / (GRASS.height - GRASS.repeat));
  const repeat = GRASS.repeat * scale;
  const backgroundOffset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    backgroundOffset.set(reducedMotion ? 0 : -((Math.max(0, event.contentOffset.y) * PARALLAX) % repeat));
  });
  const backgroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: backgroundOffset.get() }],
  }));
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.background }}>
      <Animated.View pointerEvents="none" style={[
        { position: 'absolute', top: 0, left: (window.width - GRASS.width * scale) / 2,
          width: GRASS.width * scale, height: GRASS.height * scale }, backgroundStyle,
      ]}>
      <Image
        source={require('@/assets/images/homebound/grass.png')}
        style={StyleSheet.absoluteFill}
        contentFit="fill"
        accessible={false}
        pointerEvents="none"
      />
      {Array.from({ length: Math.ceil(GRASS.height / GRASS.repeat) }, (_, k) => DECOR.map((d, i) => (
        <View key={`${k}-${i}`} style={{ position: 'absolute', top: (k + d.at) * repeat,
          [d.left ? 'left' : 'right']: (GRASS.width * scale - window.width) / 2 + 3 }}>
          <PixelSprite sprite={d.sprite} />
        </View>
      )))}
      </Animated.View>
      <ScreenParticles />
      {header && (
        <Animated.View entering={reducedMotion ? undefined : headerEntrance}
          style={{ paddingTop: insets.top + 4, paddingBottom: 4,
          paddingHorizontal: 16, zIndex: 1 }}>
          <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>{header}</View>
        </Animated.View>
      )}
    <Animated.ScrollView
      style={{ flex: 1 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      automaticallyAdjustKeyboardInsets
      contentInsetAdjustmentBehavior={header ? 'never' : 'automatic'}
      contentContainerStyle={{
        padding: 16, paddingBottom: 24 + insets.bottom,
        paddingTop: 4 + (topInset ? insets.top : 0),
        gap: 16, width: '100%', maxWidth: 500, alignSelf: 'center',
      }}>
      {children}
    </Animated.ScrollView>
    </View>
  );
}
