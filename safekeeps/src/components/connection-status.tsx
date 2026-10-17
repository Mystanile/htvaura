import { Button, Host } from '@expo/ui';

import { ThemedText } from '@/components/themed-text';
import { useSafekeeps } from '@/state/safekeeps';

export function ConnectionStatus() {
  const state = useSafekeeps();
  if (!state.error) return null;
  return (
    <>
      <ThemedText selectable accessibilityLiveRegion="polite">{state.error}</ThemedText>
      <Host matchContents seedColor="#ffdedf">
        <Button label="Retry connection" disabled={state.busy} onPress={() => { void state.refresh(); }} />
      </Host>
    </>
  );
}
