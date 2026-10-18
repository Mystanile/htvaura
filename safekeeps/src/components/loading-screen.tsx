import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { useTheme } from '@/hooks/use-theme';

// Shared with the startup gate so all three 600 ms frames can play before the menu opens.
export const LOADING_CYCLE_MS = 1800;

const frames = [
  require('@/assets/images/homebound/house3.png'),
  require('@/assets/images/homebound/house2.png'),
  require('@/assets/images/homebound/house1.png'),
];
const keyframes = [
  { '0%': { opacity: 1 }, '33.333%': { opacity: 0 }, '100%': { opacity: 0 } },
  { '0%': { opacity: 0 }, '33.333%': { opacity: 1 }, '66.667%': { opacity: 0 }, '100%': { opacity: 0 } },
  { '0%': { opacity: 0 }, '66.667%': { opacity: 1 }, '100%': { opacity: 1 } },
];

export function LoadingScreen() {
  const theme = useTheme();
  const reducedMotion = useReducedMotion();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel="Loading Homebound"
      accessibilityState={{ busy: true }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: theme.background }}>
      <Image source={require('@/assets/images/homebound/grass.png')} style={StyleSheet.absoluteFill}
        contentFit="cover" accessible={false} />
      <View style={{ width: 248, height: 200 }} accessible={false}>
        {frames.map((source, index) => (
          <Animated.View key={index} style={[StyleSheet.absoluteFill, reducedMotion
            ? { opacity: index === 0 ? 1 : 0 }
            : { animationName: keyframes[index], animationDuration: LOADING_CYCLE_MS,
              animationTimingFunction: 'step-end', animationIterationCount: 'infinite' }]}>
            <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain"
              accessible={false} transition={0} />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}
