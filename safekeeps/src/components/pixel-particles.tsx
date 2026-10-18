import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

const sparks = [
  { left: '8%', x: -12, y: -20 }, { left: '22%', x: -8, y: -28 },
  { left: '38%', x: -4, y: -18 }, { left: '62%', x: 4, y: -24 },
  { left: '78%', x: 8, y: -28 }, { left: '92%', x: 12, y: -18 },
] as const;

function Spark({ index, progress }: { index: number; progress: SharedValue<number> }) {
  const theme = useTheme();
  const spark = sparks[index];
  const style = useAnimatedStyle(() => {
    const t = progress.get();
    return {
      opacity: (1 - t) * 0.9,
      transform: [{ translateX: spark.x * t }, { translateY: spark.y * t + 8 * t * t }],
    };
  });
  return <Animated.View style={[{
    position: 'absolute', left: spark.left, top: 2, width: index % 2 ? 3 : 4, height: index % 2 ? 3 : 4,
    backgroundColor: index % 2 ? theme.onAccent : theme.primary,
  }, style]} />;
}

// One bounded burst per press; releasing the button lets the remaining pixels fade out.
export function ButtonParticles({ active }: { active: boolean }) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(1);
  useEffect(() => {
    if (active && !reducedMotion) {
      progress.set(0);
      progress.set(withTiming(1, { duration: 420 }));
    }
  }, [active, reducedMotion, progress]);
  useEffect(() => () => cancelAnimation(progress), [progress]);
  if (reducedMotion) return null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={StyleSheet.absoluteFill}>
    {sparks.map((_, index) => <Spark key={index} index={index} progress={progress} />)}
  </View>;
}

const drift = {
  '0%': { opacity: 0, transform: [{ translateY: 12 }, { translateX: 0 }] },
  '25%': { opacity: 0.5 },
  '100%': { opacity: 0, transform: [{ translateY: -64 }, { translateX: 14 }] },
};

// A brief entrance detail behind the content, with no perpetual background animation.
export function ScreenParticles() {
  const reducedMotion = useReducedMotion();
  const theme = useTheme();
  if (reducedMotion) return null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={StyleSheet.absoluteFill}>
    {sparks.map((spark, index) => <Animated.View key={index} style={{
      position: 'absolute', left: spark.left, top: `${20 + (index % 3) * 28}%`,
      width: 4, height: 4, backgroundColor: theme.onAccent, opacity: 0,
      animationName: drift, animationDuration: 3800, animationDelay: index * 220,
      animationTimingFunction: 'ease-out', animationFillMode: 'both', animationIterationCount: 1,
    }} />)}
  </View>;
}
