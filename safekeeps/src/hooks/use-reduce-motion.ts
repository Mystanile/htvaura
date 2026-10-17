import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

// True when the phone's Reduce Motion setting is on. Flashing and press animations check this.
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(value => { if (live) setReduce(value); }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => { live = false; subscription.remove(); };
  }, []);
  return reduce;
}
