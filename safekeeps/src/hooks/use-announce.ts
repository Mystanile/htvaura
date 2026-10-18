import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

// Says a short line to a screen reader when the text changes. null says nothing. Works on iOS and Android
// (accessibilityLiveRegion is Android only). Pass the same words for the same moment, whoever the person is.
let last = { text: '', at: 0 };

export function useAnnounce(text: string | null) {
  useEffect(() => {
    if (!text) return;
    // two screens in the stack can show the same error at once: say it one time
    if (text === last.text && Date.now() - last.at < 1000) return;
    last = { text, at: Date.now() };
    AccessibilityInfo.announceForAccessibility(text);
  }, [text]);
}
