import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';

import { ConnectionGate } from '@/components/connection-gate';
import { SafekeepsProvider } from '@/state/safekeeps';
import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafekeepsProvider>
        <StatusBar style="auto" />
        <ConnectionGate><Stack>
          <Stack.Screen name="index" options={{ title: 'SAFEKEEPS' }} />
          <Stack.Screen name="friends/[id]" options={{ title: 'Friend' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="explore" options={{ title: 'Settings' }} />
        </Stack></ConnectionGate>
      </SafekeepsProvider>
    </ThemeProvider>
  );
}