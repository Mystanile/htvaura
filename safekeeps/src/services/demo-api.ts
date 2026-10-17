import { fetch } from 'expo/fetch';
import type { DemoSession } from '@/services/demo-session';

export type Friend = {
  id: string; name: string; lastCheckIn: number | null;
  requestedAt: number | null; resolvedAt: number | null;
};
export type Snapshot = {
  me: { id: string; name: string; code: string; lastCheckIn: number | null };
  friends: Friend[];
  incoming: { id: string; name: string; requestedAt: number }[];
  friendRequests: { id: string; name: string }[];
  sentRequests: { id: string; name: string }[];
};

export type NightView = {
  state: 'armed' | 'asking' | 'waiting' | 'escalating' | 'acknowledged' | 'ended';
  screen: 'armed' | 'asking' | 'alarm' | 'alert_active' | 'thanks' | 'pin_retry' | 'ended_true' | 'ended_fake';
  deadline: number | null; // server Unix seconds, only set while asking or waiting
  ping_at?: number | null; // server Unix seconds of the last counted ping, null if none
  home_by?: number; // server Unix seconds, only in the user's own view while a home-by check has not started
};
export type NightAlert = {
  user_id: string; active: boolean;
  kind: 'manual' | 'periodic' | 'home_by' | 'separation' | 'duress';
  card: { title: string; do: string[]; dont: string[] };
  acknowledged_by: string | null;
  location: [number, number] | null;
};
export type Night = { now: number; view: NightView | null; alerts: NightAlert[] };
export type NightConfig = {
  pin: string; tiers: string[][]; duress_contacts: string[];
  check_every_minutes?: number; ask_seconds?: number; grace_seconds?: number; ack_seconds?: number;
  night_ends_at?: number; // server Unix seconds
  home_by?: number; // server Unix seconds
};

class ApiError extends Error {}

export async function api<T>(
  url: string, path: string, token?: string, body?: object, signal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort);
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 8000);
  try {
    const response = await fetch(url + '/safekeeps' + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) {
      throw new ApiError(typeof data.detail === 'string' ? data.detail : 'Request failed. Please try again.');
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error(
      'Cannot reach ' + url + '. Check that the demo server is running and allow Expo Go local network access, then retry.',
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function fetchState(session: DemoSession, signal?: AbortSignal) {
  return api<Snapshot>(session.url, '/state', session.token, undefined, signal);
}

export function fetchNight(session: DemoSession, signal?: AbortSignal) {
  return api<Night>(session.url, '/night', session.token, undefined, signal);
}
