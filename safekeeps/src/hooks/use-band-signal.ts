import { useEffect, useState } from 'react';

import { SERVICE_UUID, median, nextNear, type Sample } from '@/services/band';
import { askBluetoothPermission, manager } from '@/services/band-relay';

const LOST_AFTER_MS = 10_000;

// near is null while there is no reading in the last 4 s.
export type BandSignal = { near: boolean | null; lost: boolean };

// Scans for the band while active (finder's phone, "You're close" state) and returns whether we are right
// next to it, from the 4 s median with hysteresis (nextNear). null when this build has no Bluetooth or active is false. Stops scanning when active
// turns false or the screen is left.
// ponytail: any KAZE-Band counts. Every band has the same name and iPhones hide the hardware address, so we
// cannot tell bands apart. More than one band needs a user id in the advertisement.
export function useBandSignal(active: boolean): BandSignal | null {
  const [signal, setSignal] = useState<BandSignal | null>(null);

  useEffect(() => {
    if (!active || !manager) return;
    const ble = manager;
    const samples: Sample[] = [];
    let lastSeen = Date.now();
    let near = false;
    let stopped = false;
    askBluetoothPermission().then(allowed => {
      if (stopped || !allowed) return;
      return ble.startDeviceScan([SERVICE_UUID], { allowDuplicates: true }, (error, device) => {
        if (error || !device || device.rssi == null) return;
        lastSeen = Date.now();
        samples.push({ t: lastSeen, rssi: device.rssi });
      });
    }).catch(() => {}); // Bluetooth off or not allowed: the screen ends up at "No band signal"
    const timer = setInterval(() => {
      const now = Date.now();
      while (samples.length > 0 && samples[0].t <= now - 4000) samples.shift();
      const rssi = median(samples, now);
      near = nextNear(near, rssi);
      setSignal({ near: rssi === null ? null : near, lost: now - lastSeen > LOST_AFTER_MS });
    }, 500);
    return () => {
      stopped = true;
      clearInterval(timer);
      setSignal(null);
      ble.stopDeviceScan().catch(() => {});
    };
  }, [active]);

  if (!active || !manager) return null;
  return signal ?? { near: null, lost: false };
}
