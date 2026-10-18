import { useEffect, useState, type PropsWithChildren } from 'react';
import { Platform, View } from 'react-native';

import { AppButton } from '@/components/app-button';
import { Field } from '@/components/form';
import { SectionCard } from '@/components/section-card';
import { ServerAddress } from '@/components/server-address';
import { AppScreen } from '@/components/app-screen';
import { LoadingScreen, LOADING_CYCLE_MS } from '@/components/loading-screen';
import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { getDemoUrl } from '@/services/demo-url';
import { useSafekeeps } from '@/state/safekeeps';

// The same wordmark as the home header, so the app looks like itself before anyone is signed in.
function Wordmark() {
  return <ThemedText type="heading" accessibilityRole="header">HOMEBOUND</ThemedText>;
}

export function ConnectionGate({ children, fontsReady = true }: PropsWithChildren<{ fontsReady?: boolean }>) {
  const state = useSafekeeps();
  const [url, setUrl] = useState(process.env.EXPO_PUBLIC_API_URL ?? '');
  const [introComplete, setIntroComplete] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setIntroComplete(true), LOADING_CYCLE_MS);
    return () => clearTimeout(timer);
  }, []);

  if (!introComplete || !fontsReady || state.hydrating || (state.loading && !state.error)) {
    return <LoadingScreen />;
  }
  if (!state.session) return (
    <AppScreen header={<Wordmark />}>
      <SectionCard tone="ink">
        <ThemedText type="heading">Welcome to homebound</ThemedText>
        <ThemedText>Start as a guest. Each device gets its own identity. No sign-in needed.</ThemedText>
        {(state.error || (Platform.OS !== 'web' && !process.env.EXPO_PUBLIC_API_URL)) && (
          <Field label="Server address" value={url} onChangeText={setUrl} placeholder="http://YOUR_COMPUTER_IP:8000"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!state.busy} />
        )}
        <AppButton label={state.busy ? 'Starting...' : 'Start demo'} disabled={state.busy}
          onPress={() => { void state.startGuest(url.trim() || getDemoUrl()); }} />
        {state.error && <ThemedText selectable announce themeColor="danger">{state.error}</ThemedText>}
      </SectionCard>
    </AppScreen>
  );
  if (state.loading) return (
    <AppScreen header={<Wordmark />}>
      <SectionCard><ServerAddress /></SectionCard>
      <View style={{ gap: Spacing.two }}>
        <ThemedText type="name">{state.error ? 'Unable to connect.' : 'Loading your friends...'}</ThemedText>
        {state.error && <ThemedText selectable themeColor="danger">{state.error}</ThemedText>}
      </View>
      <AppButton label="Retry" onPress={() => { void state.refresh(); }} />
    </AppScreen>
  );
  return children;
}
