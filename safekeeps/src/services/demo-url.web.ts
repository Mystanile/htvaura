export function getDemoUrl() {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  if (typeof window === 'undefined') return '';
  return window.location.protocol + '//' + window.location.hostname + ':8000';
}
