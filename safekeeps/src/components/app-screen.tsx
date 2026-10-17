import type { PropsWithChildren, ReactNode } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Every screen. The page color and her leaf picture sit behind everything. In dark mode a scrim of the page color
// keeps the leaves as a faint pattern. Content stays inside the safe area (notch, home bar) and moves up for the keyboard.
export function AppScreen({ children, topInset = false, header }: PropsWithChildren<{ topInset?: boolean; header?: ReactNode }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dark = theme.scheme === 'dark';
  const side = Spacing.three + Math.max(insets.left, insets.right);
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <Image
        source={require('@/assets/images/leaf-background.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        accessible={false}
        pointerEvents="none"
      />
      {dark && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: theme.background, opacity: 0.96 }]} />}
      {header && (
        <View style={{ paddingTop: insets.top + Spacing.two, paddingBottom: Spacing.two,
          paddingHorizontal: side, backgroundColor: theme.background, zIndex: 1 }}>
          <View style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}>{header}</View>
        </View>
      )}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior={header ? 'never' : 'automatic'}
        contentContainerStyle={{
          paddingHorizontal: side, paddingBottom: Spacing.four + insets.bottom,
          paddingTop: Spacing.three + (topInset ? insets.top : 0),
          gap: Spacing.three, width: '100%', maxWidth: 640, alignSelf: 'center',
        }}>
        {children}
      </ScrollView>
    </View>
  );
}
