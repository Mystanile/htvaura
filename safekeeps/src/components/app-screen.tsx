import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenGutter, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Scrolling page with safe areas handled in one place.
 * - Screens under a native header (the stack) let iOS place the content below the header.
 * - Screens with no header (`header` or `topInset`) keep clear of the notch and status bar themselves.
 * - The bottom always keeps clear of the home bar, and the page lifts above the keyboard.
 */
export function AppScreen({ children, topInset = false, header }: PropsWithChildren<{ topInset?: boolean; header?: ReactNode }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const ownTop = Boolean(header) || topInset;
  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      {header && (
        <View style={{ paddingTop: insets.top + Spacing.two, paddingBottom: Spacing.two, paddingHorizontal: ScreenGutter }}>
          <View style={{ width: '100%', maxWidth: 640, alignSelf: 'center' }}>{header}</View>
        </View>
      )}
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentInsetAdjustmentBehavior={ownTop ? 'never' : 'automatic'}
        contentContainerStyle={{
          paddingHorizontal: ScreenGutter,
          paddingTop: header ? Spacing.two : ScreenGutter + (topInset ? insets.top : 0),
          paddingBottom: ScreenGutter + insets.bottom,
          gap: Spacing.three, width: '100%', maxWidth: 640, alignSelf: 'center',
        }}>
        {children}
      </ScrollView>
    </View>
  );
}
