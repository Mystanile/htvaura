import { useSyncExternalStore } from 'react';

import { getBandStatus, manager, subscribeBand } from '@/services/band-relay';

// available: this build has Bluetooth (false in Expo Go and on the web, where every band feature is hidden).
export function useBand() {
  const status = useSyncExternalStore(subscribeBand, getBandStatus, getBandStatus);
  return { available: manager !== null, ...status };
}
