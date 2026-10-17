import { Button, Column, Host, TextInput, useNativeState } from '@expo/ui';

import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';

export function ServerAddress() {
  const state = useSafekeeps();
  const url = useNativeState(state.session?.url ?? '');
  return (
    <>
      <ThemedText type="smallBold">Server address</ThemedText>
      <Host matchContents seedColor="#ffdedf">
        <Column spacing={12}>
          <TextInput value={url} placeholder="http://YOUR_COMPUTER_IP:8000"
            autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!state.busy} />
          <Button label={state.busy ? 'Connecting...' : 'Reconnect'} disabled={state.busy}
            onPress={() => { void state.reconnect(url.value); }} />
        </Column>
      </Host>
    </>
  );
}
