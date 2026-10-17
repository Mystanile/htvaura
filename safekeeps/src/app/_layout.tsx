import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Font } from '@/constants/theme';

import { ConnectionGate } from '@/components/connection-gate';
import { NightEffects } from '@/components/night-effects';
import { SafekeepsProvider } from '@/state/safekeeps';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export const unstable_settings = { initialRouteName: 'index' };

export default function RootLayout() {
  const scheme = useColorScheme();
  const theme = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    [Font.regular]: require('@/assets/fonts/Figtree-Regular.ttf'),
    [Font.semibold]: require('@/assets/fonts/Figtree-SemiBold.ttf'),
    [Font.bold]: require('@/assets/fonts/Figtree-Bold.ttf'),
  });
  if (!fontsLoaded && !fontError) return null;
  // The navigation theme paints the area behind screens while they slide, so it needs our colors too.
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: theme.accent, background: theme.background, card: theme.background, text: theme.text, border: theme.border },
  };
  return (
    <ThemeProvider value={navTheme}>
      <SafekeepsProvider>
        <StatusBar style="auto" />
        <ConnectionGate><Stack screenOptions={{
          headerStyle: { backgroundColor: theme.background },
          headerTintColor: theme.accent,
          headerShadowVisible: false,
          headerTitleStyle: { fontFamily: Font.bold, fontSize: 18, color: theme.text },
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
