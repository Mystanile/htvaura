import type { PropsWithChildren } from 'react';
import { ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';

export function AppScreen({ children }: PropsWithChildren) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.background }}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{
        padding: 20, paddingBottom: 20 + insets.bottom,
        gap: 20, width: '100%', maxWidth: 640, alignSelf: 'center',
      }}>
      {children}
    </ScrollView>
  );
}