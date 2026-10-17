import { Redirect } from 'expo-router';

// Preserve old starter links while using Settings as the app's secondary screen.
export default function ExploreScreen() {
  return <Redirect href="/settings" />;
}