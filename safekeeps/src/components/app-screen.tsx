import type { PropsWithChildren, ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, FadeInUp, useAnimatedScrollHandler, useAnimatedStyle, useReducedMotion, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

const headerEntrance = FadeInUp.duration(280)
  .easing(Easing.bezier(0.23, 1, 0.32, 1))
  .withInitialValues({ opacity: 0, transform: [{ translateY: -16 }] });
const BACKGROUND_TRAVEL = 160;

export function AppScreen({ children, topInset = false, header }: PropsWithChildren<{ topInset?: boolean; header?: ReactNode }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const reducedMotion = useReducedMotion();
  const backgroundOffset = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler(event => {
    const range = Math.max(0, event.contentSize.height - event.layoutMeasurement.height);
    const progress = range > 0 ? Math.min(1, Math.max(0, event.contentOffset.y / range)) : 0;
    // Move throughout the scroll without exposing the edge of the grass on long screens.
    backgroundOffset.set(reducedMotion ? 0 : -progress * Math.min(range * 0.2, BACKGROUND_TRAVEL));
  });
  const backgroundStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: backgroundOffset.get() }],
  }));
  return (
    <View style={{ flex: 1, overflow: 'hidden', backgroundColor: theme.background }}>
      <Animated.View pointerEvents="none" style={[
        { position: 'absolute', top: 0, left: 0, right: 0, bottom: -BACKGROUND_TRAVEL }, backgroundStyle,
      ]}>
      <Image
        source={require('@/assets/images/homebound/grass.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        accessible={false}
        pointerEvents="none"
      />
      </Animated.View>
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
