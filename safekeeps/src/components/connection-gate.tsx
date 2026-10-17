import { useNativeState } from '@expo/ui';
import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { AppScreen } from '@/components/app-screen';
import { Button, TextField } from '@/components/controls';
import { SectionCard } from '@/components/section-card';
import { ServerAddress } from '@/components/server-address';
import { ThemedText } from '@/components/themed-text';
import { useTheme } from '@/hooks/use-theme';
import { getDemoUrl } from '@/services/demo-url';
import { useSafekeeps } from '@/state/safekeeps';

export function ConnectionGate({ children }: PropsWithChildren) {
  'use no memo'; // @expo/ui web TextInput only redraws when this screen re-renders, the compiler would skip that
  const state = useSafekeeps();
  const theme = useTheme();
  const url = useNativeState(process.env.EXPO_PUBLIC_API_URL ?? '');

  if (state.hydrating) return (
    <AppScreen topInset>
      <ThemedText type="title">Safekeeps</ThemedText>
      <ThemedText themeColor="textSecondary">Opening your demo...</ThemedText>
    </AppScreen>
  );
  if (!state.session) return (
    <AppScreen topInset>
      <ThemedText type="title">Welcome to Safekeeps</ThemedText>
      <ThemedText themeColor="textSecondary">Start as a guest. Each device gets its own identity. No sign-in needed.</ThemedText>
      {(state.error || (Platform.OS !== 'web' && !process.env.EXPO_PUBLIC_API_URL)) && (
        <SectionCard>
          <TextField label="Server address" value={url} placeholder="http://YOUR_COMPUTER_IP:8000"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!state.busy} />
          {state.error && <ThemedText selectable style={{ color: theme.danger }} accessibilityLiveRegion="polite">{state.error}</ThemedText>}
        </SectionCard>
      )}
      <Button label={state.busy ? 'Starting...' : 'Start demo'} disabled={state.busy}
        onPress={() => { void state.startGuest(url.value.trim() || getDemoUrl()); }} />
    </AppScreen>
  );
  if (state.loading) return (
    <AppScreen topInset>
      <ThemedText type="title">{state.error ? 'Cannot connect' : 'Loading'}</ThemedText>
      <ThemedText themeColor="textSecondary">{state.error ? 'Check the server address, then try again.' : 'Loading your friends...'}</ThemedText>
      {state.error && <ThemedText selectable style={{ color: theme.danger }}>{state.error}</ThemedText>}
      <SectionCard>
        <ServerAddress />
        <Button label="Retry" onPress={() => { void state.refresh(); }} />
      </SectionCard>
    </AppScreen>
  );
  return children;
}
