import type { PropsWithChildren, ReactNode } from 'react';
import { Image } from 'expo-image';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

export function AppScreen({ children, topInset = false, header }: PropsWithChildren<{ topInset?: boolean; header?: ReactNode }>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
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
      {header && (
        <View style={{ paddingTop: insets.top + 12, paddingBottom: 12,
          paddingHorizontal: 20, backgroundColor: theme.background, zIndex: 1 }}>
          <View style={{ width: '100%', maxWidth: 600, alignSelf: 'center' }}>{header}</View>
        </View>
      )}
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior={header ? 'never' : 'automatic'}
      contentContainerStyle={{
        padding: 20, paddingBottom: 20 + insets.bottom,
        paddingTop: 20 + (topInset ? insets.top : 0),
        gap: 20, width: '100%', maxWidth: 640, alignSelf: 'center',
      }}>
      {children}
    </ScrollView>
    </View>
  );
}
