import * as Notifications from 'expo-notifications';
import { AppState, Platform } from 'react-native';

// Every text is the same on purpose, so a watcher who reads the lock screen learns nothing.
export const REMINDER = { title: 'Homebound', body: 'Open the app.', sound: true };

let shownFor: number | null = null; // the deadline of the check already shown

export function forgetCheckNow() { shownFor = null; }

// Called with every night view the app gets, in the foreground and from the band heartbeat in the background.
// A check is running and the app is not open: show one notification, once per deadline. In the foreground the screen asks.
export function notifyCheckNow(view: { state: string; deadline: number | null } | null | undefined) {
  if (Platform.OS === 'web' || AppState.currentState === 'active') return;
  const deadline = view?.state === 'asking' || view?.state === 'waiting' ? view.deadline : null;
  if (deadline == null || shownFor === deadline) return;
  shownFor = deadline;
  // Clear the earlier ones first, so the lock screen never shows two (the scheduled one may have fired already).
  Notifications.dismissAllNotificationsAsync()
    .then(() => Notifications.scheduleNotificationAsync({ identifier: 'check-now', content: REMINDER, trigger: null }))
    .catch(() => {}); // best effort
}
