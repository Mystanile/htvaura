import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AppFont } from '@/constants/theme';

import { ConnectionGate } from '@/components/connection-gate';
import { SafekeepsProvider } from '@/state/safekeeps';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Righteous: require('@/assets/fonts/Righteous-Regular.ttf') });
  if (!fontsLoaded && !fontError) return null;
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SafekeepsProvider>
        <StatusBar style="dark" />
        <ConnectionGate><Stack screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: AppFont, fontSize: 24, fontWeight: '400' },
          contentStyle: { backgroundColor: theme.background },
        }}>
          <Stack.Screen name="index" options={{ title: 'homebound', headerShown: false }} />
          <Stack.Screen name="friends/[id]" options={{ title: 'Friend' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="night" options={{ title: 'Start a night' }} />
          <Stack.Screen name="explore" options={{ title: 'Settings' }} />
        </Stack></ConnectionGate>
      </SafekeepsProvider>
    </ThemeProvider>
  );
}
