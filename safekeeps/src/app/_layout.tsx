import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { AppFont } from '@/constants/theme';

import { ConnectionGate } from '@/components/connection-gate';
import { NightEffects } from '@/components/night-effects';
import { SafekeepsProvider } from '@/state/safekeeps';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({ Righteous: require('@/assets/fonts/Righteous-Regular.ttf') });
  if (!fontsLoaded && !fontError) return null;
  // The navigation colors come from our tokens, so no default white or black shows between screens.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = { ...base, colors: { ...base.colors, background: theme.background, card: theme.background,
    text: theme.text, border: theme.border, primary: theme.accent } };
  return (
    <ThemeProvider value={navTheme}>
      <SafekeepsProvider>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <ConnectionGate><Stack screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.text,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: AppFont, fontSize: 22, fontWeight: '400', color: theme.text },
          contentStyle: { backgroundColor: theme.background },
        }}>
          <Stack.Screen name="index" options={{ title: 'Safekeeps', headerShown: false }} />
          <Stack.Screen name="friends/[id]" options={{ title: 'Friend' }} />
          <Stack.Screen name="settings" options={{ title: 'Settings' }} />
          <Stack.Screen name="night" options={{ title: 'Start a night' }} />
          <Stack.Screen name="find/[id]" options={{ title: 'Find them' }} />
          <Stack.Screen name="explore" options={{ title: 'Settings' }} />
        </Stack></ConnectionGate>
        <NightEffects />
      </SafekeepsProvider>
    </ThemeProvider>
  );
}
