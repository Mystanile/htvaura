import { useState } from 'react';

import { AppButton } from '@/components/app-button';
import { Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';

export function ServerAddress() {
  const state = useSafekeeps();
  const [url, setUrl] = useState(state.session?.url ?? '');
  return (
    <>
      <ThemedText type="heading">Connection</ThemedText>
      <Field label="Server address" value={url} onChangeText={setUrl} placeholder="http://YOUR_COMPUTER_IP:8000"
        autoCapitalize="none" autoCorrect={false} keyboardType="url" editable={!state.busy} />
      <AppButton label={state.busy ? 'Connecting...' : 'Reconnect'} disabled={state.busy}
        onPress={() => { void state.reconnect(url); }} />
    </>
  );
}
