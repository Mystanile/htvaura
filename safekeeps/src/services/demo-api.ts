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
