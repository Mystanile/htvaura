import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export function NightEntry() {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Start a night"
      onPress={() => router.push('/night')}
      style={({ pressed }) => ({
        minHeight: 56, padding: Spacing.three, borderRadius: Radius.card,
        borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
        backgroundColor: pressed ? theme.primaryPressed : theme.primary,
      })}>
      <ThemedText type="name" style={{ color: theme.onPrimary }}>Start a night</ThemedText>
    </Pressable>
  );
}
