import { useNativeState } from '@expo/ui';

import { Button, TextField } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';

export function ServerAddress() {
  'use no memo'; // same reason as TextField
  const state = useSafekeeps();
  const url = useNativeState(state.session?.url ?? '');
  return (
    <>
      <ThemedText type="heading">Connection</ThemedText>
      <TextField label="Server address" value={url} placeholder="http://YOUR_COMPUTER_IP:8000"
        autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!state.busy} />
      <Button label={state.busy ? 'Connecting...' : 'Reconnect'} disabled={state.busy}
        onPress={() => { void state.reconnect(url.value); }} />
    </>
  );
}
