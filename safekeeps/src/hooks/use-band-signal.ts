import { useEffect, useState } from 'react';

import { SERVICE_UUID, median, nextNear, type Sample } from '@/services/band';
import { askBluetoothPermission, manager } from '@/services/band-relay';

const LOST_AFTER_MS = 10_000;
const RETRY_MS = 2500; // wait between scan restarts, so Bluetooth that stays off is not hammered

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
    let scanning = false;
    let retryAt = 0;
    // stopDeviceScan drops the dead scan's listener, or every retry would leave one more behind
    const fail = () => { scanning = false; retryAt = Date.now() + RETRY_MS; ble.stopDeviceScan().catch(() => {}); };
    const start = () => {
      scanning = true;
      askBluetoothPermission().then(allowed => {
        if (stopped || !allowed) return; // not allowed: scanning stays true, so we never ask again
        return ble.startDeviceScan([SERVICE_UUID], { allowDuplicates: true }, (error, device) => {
          if (error) return fail(); // ble-plx: the scan has stopped, it must be started again
          if (!device || device.rssi == null) return;
          lastSeen = Date.now();
          samples.push({ t: lastSeen, rssi: device.rssi });
        });
      }).catch(fail); // Bluetooth off: the screen shows "No band signal" until a retry works
    };
    start();
    const timer = setInterval(() => {
      const now = Date.now();
      if (!scanning && now >= retryAt) start();
      while (samples.length > 0 && samples[0].t <= now - 4000) samples.shift();
      const rssi = median(samples, now);
      near = nextNear(near, rssi, samples.length);
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
