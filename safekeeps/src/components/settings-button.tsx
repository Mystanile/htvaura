import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Gear icon on iPhone. Other platforms have no SF Symbols, so they show the word.
export function SettingsButton() {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel="Settings"
      onPress={() => router.push('/settings')}
      style={({ pressed }) => ({
        minWidth: TouchTarget, height: TouchTarget, paddingHorizontal: Spacing.two, alignItems: 'center', justifyContent: 'center',
        borderRadius: Radius.round, flexShrink: 0, borderWidth: 1, borderColor: theme.border,
        backgroundColor: pressed ? theme.backgroundSelected : theme.backgroundElement,
      })}>
      <SymbolView name="gearshape" size={22} tintColor={theme.text}
        fallback={<ThemedText type="smallBold">Settings</ThemedText>} />
    </Pressable>
  );
}
