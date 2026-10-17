import { router } from 'expo-router';

import { AppButton } from '@/components/app-button';

export function NightEntry() {
  return <AppButton label="Start a night" onPress={() => router.push('/night')} />;
}
