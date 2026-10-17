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
        source={require('@/assets/images/homebound/grass.png')}
        style={StyleSheet.absoluteFill}
        contentFit="cover"
        contentPosition="center"
        accessible={false}
        pointerEvents="none"
      />
      {header && (
        <View style={{ paddingTop: insets.top + 4, paddingBottom: 4,
          paddingHorizontal: 16, zIndex: 1 }}>
          <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center' }}>{header}</View>
        </View>
      )}
    <ScrollView
      style={{ flex: 1 }}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior={header ? 'never' : 'automatic'}
      contentContainerStyle={{
        padding: 16, paddingBottom: 24 + insets.bottom,
        paddingTop: 4 + (topInset ? insets.top : 0),
        gap: 16, width: '100%', maxWidth: 500, alignSelf: 'center',
      }}>
      {children}
    </ScrollView>
    </View>
  );
}
