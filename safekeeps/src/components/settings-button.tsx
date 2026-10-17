import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export function SettingsButton() {
  const theme = useTheme();
  return (
      <Pressable accessibilityRole="button" accessibilityLabel="Settings and device"
        onPress={() => router.push('/settings')}
        hitSlop={8} style={({ pressed }) => ({
          width: 48, height: 48, alignItems: 'center', justifyContent: 'center',
          borderRadius: 12, flexShrink: 0,
          backgroundColor: pressed ? '#243638' : '#162224',
        })}>
        <View pointerEvents="none" style={{ width: 24, gap: 5, flexDirection: 'column' }}>
          {[0, 1, 2].map(line => (
            <View key={line} style={{ width: 24, height: 3, flexShrink: 0,
              borderRadius: 1, backgroundColor: theme.background }} />
          ))}
        </View>
      </Pressable>
  );
}

