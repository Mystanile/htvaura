// The band relay. It lives at module level, not in a screen: iOS can relaunch the app in the background
// (state restoration) with no screen mounted, and the band must still work. Imported once by _layout.tsx.
// The band only speaks BLE; this module passes its answers to the server and the server's asks and pings to it.
// manager is null in Expo Go and on the web (no native Bluetooth module). Every band feature checks for that.
import * as SecureStore from 'expo-secure-store';
import { AppState, PermissionsAndroid, Platform } from 'react-native';
import type { BleManager, Subscription } from 'react-native-ble-plx';

import { api, fetchNight, type Night } from '@/services/demo-api';
import { loadSession, type DemoSession } from '@/services/demo-session';
import {
  ASK_UUID, BAND_NAME, EVENT_UUID, PING_UUID, SERVICE_UUID, askKey, decodeEvent, encodeByte, keepPending, shouldPingBand,
  type BandEvent, type PendingEvent,
} from '@/services/band';

const BAND_KEY = 'safekeeps-band';
const RELAY_SESSION_KEY = 'safekeeps-band-session';
const PENDING_KEY = 'safekeeps-band-pending';
// The app's own session is saved with the default "only while unlocked" keychain rule. iOS can relaunch the app
// for the band while the phone is locked in a pocket, so the relay keeps its own copy readable after first unlock.
const anytime = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK };
let session: DemoSession | null = null;

async function relaySession() {
  const app = await loadSession().catch(() => null); // fails while locked
  if (app) {
    if (JSON.stringify(app) !== JSON.stringify(session)) {
      void SecureStore.setItemAsync(RELAY_SESSION_KEY, JSON.stringify(app), anytime).catch(() => {});
    }
    return (session = app);
  }
  if (session) return session;
  const copy = await SecureStore.getItemAsync(RELAY_SESSION_KEY, anytime).catch(() => null);
  return (session = copy ? JSON.parse(copy) : null);
}

let keptId: string | null = null; // the paired band
let connected = false;
let epoch = 0; // bumps on every new keep or forget, so an old reconnect loop stops
let askedKey: string | null = null;
let pingedAt: number | null = null;
let status = { paired: false, connected: false };
const listeners = new Set<() => void>();

function publish() {
  status = { paired: keptId !== null, connected };
  listeners.forEach(listener => listener());
}
export function subscribeBand(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
export const getBandStatus = () => status;

function createManager(): BleManager | null {
  if (Platform.OS === 'web') return null;
  try {
    // required here so the web build never loads the native module
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BleManager: Manager } = require('react-native-ble-plx') as typeof import('react-native-ble-plx');
    return new Manager({
      restoreStateIdentifier: 'kaze-band',
      // iOS relaunched the app for the band: pick the connection up again. null means a normal first launch.
      restoreStateFunction: restored => {
        const band = restored?.connectedPeripherals[0];
        if (band) void keepConnected(band.id);
      },
    });
  } catch {
    return null; // no native module (Expo Go)
  }
}
export const manager = createManager();

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Android 12 and up asks at run time. iOS asks by itself the first time Bluetooth is used.
export async function askBluetoothPermission() {
  if (Platform.OS !== 'android') return true;
  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN, PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
  ]);
  return Object.values(result).every(value => value === PermissionsAndroid.RESULTS.GRANTED);
}

// Connect with no timeout (iOS keeps a pending connect until the band is in range) and connect again after
// every disconnect. Subscribes to the band's answers after each connect.
async function keepConnected(id: string) {
  if (!manager || keptId === id) return;
  keptId = id;
  const mine = ++epoch;
  publish();
  while (mine === epoch) {
    let monitor: Subscription | undefined;
    let dropped: Subscription | undefined;
    try {
      await manager.connectToDevice(id);
      const gone = new Promise<void>(resolve => { dropped = manager.onDeviceDisconnected(id, () => resolve()); });
      await manager.discoverAllServicesAndCharacteristicsForDevice(id);
      monitor = manager.monitorCharacteristicForDevice(id, SERVICE_UUID, EVENT_UUID, (error, characteristic) => {
        if (!error && characteristic) void onEvent(decodeEvent(characteristic.value));
      });
      connected = true;
      publish();
      await gone;
    } catch {
      // not in range yet, Bluetooth off, or cancelled by forgetBand: try again below
    } finally {
      monitor?.remove();
      dropped?.remove();
      if (mine === epoch) { connected = false; publish(); }
    }
    await sleep(1000);
  }
}

// Find the band, remember it, and keep it connected.
export async function pairBand() {
  if (!manager) throw new Error('Bluetooth is not available in this app build.');
  if (!(await askBluetoothPermission())) throw new Error('Allow Bluetooth for Safekeeps in your settings.');
  const ble = manager;
  const id = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      void ble.stopDeviceScan();
      reject(new Error('No band found. Turn it on, hold it close, and try again.'));
    }, 15_000);
    ble.startDeviceScan([SERVICE_UUID], null, (error, device) => {
      if (error) {
        clearTimeout(timer);
        reject(new Error('Bluetooth is off or not allowed for Safekeeps.'));
      } else if (device && (device.name === BAND_NAME || device.localName === BAND_NAME)) {
        clearTimeout(timer);
        void ble.stopDeviceScan();
        resolve(device.id);
      }
    }).catch(error => { clearTimeout(timer); reject(error); });
  });
  await SecureStore.setItemAsync(BAND_KEY, id, anytime);
  void keepConnected(id);
}

export async function forgetBand() {
  if (!manager || keptId === null) return;
  const id = keptId;
  keptId = null;
  connected = false;
  epoch++;
  askedKey = null;
  publish();
  await SecureStore.deleteItemAsync(BAND_KEY, anytime);
  await manager.cancelDeviceConnection(id).catch(() => {}); // also cancels a pending connect
}

// One try. Reads the session itself because no screen may be mounted. Any error counts as not delivered.
async function deliver(type: PendingEvent['type']) {
  const session = await relaySession();
  if (!session) return false;
  return api(session.url, '/night/events', session.token, { type }).then(() => true, () => false);
}

// Answers that failed for 10 s, kept (also on disk) and tried again on every heartbeat, every foreground night
// view and at launch, until delivered or too old (keepPending). The same path for every answer.
let pending: PendingEvent[] = [];
let flushing = false;
const savePending = () => SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(pending), anytime).catch(() => {});

async function flushPending() {
  if (flushing || pending.length === 0) return;
  flushing = true;
  try {
    const sent: PendingEvent[] = [];
    for (const event of [...pending]) {
      if (keepPending(event, Date.now()) && await deliver(event.type)) sent.push(event);
    }
    // an answer that failed while this ran was added to pending meanwhile and stays
    pending = pending.filter(event => !sent.includes(event) && keepPending(event, Date.now()));
    await savePending();
  } finally {
    flushing = false;
  }
}

// Same path for every answer. Retries for about 10 s like the screens do, then keeps it to try again later.
async function sendEvent(event: PendingEvent) {
  const start = Date.now();
  do {
    if (await deliver(event.type)) return;
    await sleep(700);
  } while (Date.now() - start < 10_000);
  pending.push(event);
  await savePending();
}

async function onEvent(event: BandEvent | null) {
  if (event === 'ConfirmOk' || event === 'Duress') await sendEvent({ type: event, at: Date.now() });
  else if (event === 'heartbeat') await onHeartbeat();
}

// iOS wakes the app for each heartbeat. Ask the server what is waiting. In the foreground the poll already
// does this and calls onNight, so skip the extra request.
async function onHeartbeat() {
  void flushPending();
  if (AppState.currentState === 'active') return;
  const session = await relaySession();
  if (!session) return;
  onNight(await fetchNight(session).catch(() => null));
}

function write(uuid: string) {
  if (!manager || keptId === null || !connected) return Promise.reject(new Error('Band not connected'));
  return manager.writeCharacteristicWithResponseForDevice(keptId, SERVICE_UUID, uuid, encodeByte(1));
}

// Called with every night view the app gets: the foreground poll and the heartbeat fetch.
export function onNight(night: Night | null) {
  void flushPending();
  const view = night?.view;
  if (!night || !view || !connected) return;
  const key = askKey(view);
  if (key !== null && key !== askedKey) {
    askedKey = key;
    write(ASK_UUID).catch(() => { if (askedKey === key) askedKey = null; }); // try again on the next view
  }
  if (shouldPingBand(view.ping_at, pingedAt, night.now)) {
    const at = view.ping_at as number;
    pingedAt = at;
    write(PING_UUID).catch(() => { if (pingedAt === at) pingedAt = null; });
  }
}

if (manager) {
  void relaySession(); // refresh the relay's copy on every normal launch
  SecureStore.getItemAsync(PENDING_KEY, anytime).then(text => {
    const saved: PendingEvent[] = text ? JSON.parse(text) : [];
    pending = [...saved, ...pending];
    void flushPending();
  }).catch(() => {});
  SecureStore.getItemAsync(BAND_KEY, anytime).then(id => { if (id) void keepConnected(id); }).catch(() => {});
}
