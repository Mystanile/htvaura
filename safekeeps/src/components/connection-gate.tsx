import { Button, Column, Host, TextInput, useNativeState } from '@expo/ui';
import type { PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { ServerAddress } from '@/components/server-address';
import { AppScreen } from '@/components/app-screen';
import { ThemedText } from '@/components/themed-text';
import { getDemoUrl } from '@/services/demo-url';
import { useSafekeeps } from '@/state/safekeeps';

export function ConnectionGate({ children }: PropsWithChildren) {
  const state = useSafekeeps();
  const url = useNativeState(process.env.EXPO_PUBLIC_API_URL ?? '');

  if (state.hydrating) return <AppScreen><ThemedText>Opening your demo...</ThemedText></AppScreen>;
  if (!state.session) return (
    <AppScreen>
      <ThemedText type="smallBold">Welcome to homebound</ThemedText>
      <ThemedText>Start as a guest. Each device gets its own identity—no sign-in needed.</ThemedText>
      <Host colorScheme="light" matchContents seedColor="#ffdedf">
        <Column spacing={16}>
          {(state.error || (Platform.OS !== 'web' && !process.env.EXPO_PUBLIC_API_URL)) && (
            <TextInput value={url} placeholder="Server address"
              autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!state.busy} />
          )}
          <Button label={state.busy ? 'Starting...' : 'Start demo'} disabled={state.busy}
            onPress={() => { void state.startGuest(url.value.trim() || getDemoUrl()); }} />
        </Column>
      </Host>
      {state.error && <ThemedText selectable accessibilityLiveRegion="polite">{state.error}</ThemedText>}
    </AppScreen>
  );
  if (state.loading) return (
    <AppScreen>
      <ServerAddress />
      <ThemedText>{state.error ? 'Unable to connect.' : 'Loading your friends...'}</ThemedText>
      {state.error && <ThemedText selectable>{state.error}</ThemedText>}
      <Host colorScheme="light" matchContents seedColor="#ffdedf">
        <Button label="Retry" onPress={() => { void state.refresh(); }} />
      </Host>
    </AppScreen>
  );
  return children;
}
