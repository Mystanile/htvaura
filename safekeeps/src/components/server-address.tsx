import { Button, Column, Host, TextInput, useNativeState } from '@expo/ui';

import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';
import { ButtonSeed } from '@/constants/theme';

export function ServerAddress() {
  const state = useSafekeeps();
  const url = useNativeState(state.session?.url ?? '');
  return (
    <>
      <ThemedText type="heading">Connection</ThemedText>
      <Host colorScheme="light" matchContents seedColor={ButtonSeed}>
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
