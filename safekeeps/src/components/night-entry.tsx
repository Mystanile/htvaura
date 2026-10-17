import { router } from 'expo-router';

import { Button } from '@/components/controls';

export function NightEntry() {
  return <Button label="Start a night" variant="tonal" onPress={() => router.push('/night')} />;
}
