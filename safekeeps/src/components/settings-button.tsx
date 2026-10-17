import { router } from 'expo-router';
import { Pressable, View } from 'react-native';

import { Radius, Tones } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

// Her ink square with three lines. It is the same ink card color as the check-in card, so it matches in both modes.
export function SettingsButton() {
  const ink = Tones[useColorScheme() === 'dark' ? 'dark' : 'light'].ink;
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings and device"
      onPress={() => router.push('/settings')}
      hitSlop={4} style={({ pressed }) => ({
        width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
        borderRadius: Radius.control, borderCurve: 'continuous', flexShrink: 0,
        backgroundColor: pressed ? ink.backgroundSelected : ink.backgroundElement,
        borderWidth: 1, borderColor: ink.border,
      })}>
      <View pointerEvents="none" style={{ width: 22, gap: 5, flexDirection: 'column' }}>
        {[0, 1, 2].map(line => (
          <View key={line} style={{ width: 22, height: 3, flexShrink: 0, borderRadius: 2, backgroundColor: ink.text }} />
        ))}
      </View>
    </Pressable>
  );
}
