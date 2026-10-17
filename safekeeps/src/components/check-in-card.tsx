import { useNativeState, type TextInputRef } from '@expo/ui';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, Vibration, View } from 'react-native';

import { Button, TextField } from '@/components/controls';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useTheme } from '@/hooks/use-theme';
import { createGestureDecoder, type GestureResult } from '@/services/gesture';
import type { NightView } from '@/services/demo-api';
import { useSafekeeps } from '@/state/safekeeps';

// Goes inside the "Check in" card on the home screen, in place of the big button and the
// "Next check-in" line. The heading, last check-in, requests and friend code stay as they are.
// With no night running (or a night that has ended) it is the plain button.
// With a night it follows the server view.
export function CheckInCard() {
  const view = useSafekeeps().night?.view ?? null;
  return view && view.state !== 'ended' ? <NightCheckIn view={view} /> : <PlainCheckIn />;
}

const SETTLE_MS = 4000; // how long "Thanks!" and "Alert ended" stay before the armed look returns
const SETTLES = ['thanks', 'ended_true', 'ended_fake'];

// The big check-in surface. Calm is accent, loud is the danger tone. Same size in every state.
function bigStyle(colors: { fill: string; border: string }, pressed: boolean, scale: boolean) {
  return {
    minHeight: 120, padding: Spacing.four, borderRadius: Radius.control, borderCurve: 'continuous',
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.fill, borderWidth: 2, borderColor: colors.border,
    transform: [{ scale: pressed && scale ? 0.985 : 1 }],
  } as const;
}

function PlainCheckIn() {
  const state = useSafekeeps();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Check in"
        accessibilityState={{ disabled: state.busy, busy: state.busy }}
        disabled={state.busy}
        onPress={() => { void state.recordCheckIn(); }}
        style={({ pressed }) => bigStyle(
          state.busy ? { fill: theme.disabled, border: theme.disabled } : pressed
            ? { fill: theme.accentPressed, border: theme.accentPressed } : { fill: theme.accent, border: theme.accent },
          pressed, !reduceMotion)}>
        <ThemedText type="subtitle" style={{ color: state.busy ? theme.onDisabled : theme.onAccent }}>
          {state.busy ? 'Saving...' : 'Check in'}
        </ThemedText>
      </Pressable>
      <ThemedText themeColor="textSecondary">
        {!state.remindersEnabled ? 'Reminders off' : state.minutesRemaining === 0
          ? 'Time to check in' : `Next check-in in ${state.minutesRemaining} min`}
      </ThemedText>
    </>
  );
}

function NightCheckIn({ view }: { view: NightView }) {
  const state = useSafekeeps();
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const [decoder] = useState(createGestureDecoder);
  const decoderTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [timedOut, setTimedOut] = useState<string | null>(null); // a "Thanks!"-type screen that has run its time
  const [thanks, setThanks] = useState(false); // local "Thanks!" after a gesture, the same for ok and duress
  const [sending, setSending] = useState(false); // gesture finished, still being delivered (retries)
  const [pinOpen, setPinOpen] = useState(false); // "Cancel an alert" on the armed screen
  const [pinTry, setPinTry] = useState(0); // bumps on every PIN sent, so the same answer twice still shows
  const [seenScreen, setSeenScreen] = useState(view.screen);
  if (seenScreen !== view.screen) { // close that PIN entry as soon as the server view moves on
    setSeenScreen(view.screen);
    setPinOpen(false);
  }

  // thanks and ended_* go back to the armed look after a few seconds
  useEffect(() => {
    if (!SETTLES.includes(view.screen)) return;
    const timer = setTimeout(() => setTimedOut(view.screen), SETTLE_MS);
    return () => { clearTimeout(timer); setTimedOut(null); };
  }, [view.screen, pinTry]);
  useEffect(() => {
    if (!thanks) return;
    const timer = setTimeout(() => setThanks(false), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [thanks]);
  useEffect(() => () => clearTimeout(decoderTimer.current), []);
  // buzz once when the view first becomes asking, same for everyone
  useEffect(() => { if (view.screen === 'asking') Vibration.vibrate(); }, [view.screen]);

  // an alert the user can see is running. A wrong PIN typed with no alert keeps the armed look.
  const inAlert = view.state === 'escalating' || view.state === 'acknowledged';
  const retryArmed = view.screen === 'pin_retry' && !inAlert;
  const base = timedOut === view.screen || retryArmed ? 'armed' : view.screen;
  const screen = (thanks || sending) && (base === 'armed' || base === 'asking' || base === 'alarm') ? 'thanks' : base;
  const loud = screen === 'alarm';

  // louder look: buzz again and again until the screen changes
  useEffect(() => {
    if (!loud) return;
    const buzz = () => Vibration.vibrate([0, 400, 200, 400]);
    buzz();
    const timer = setInterval(buzz, 1500);
    return () => { clearInterval(timer); Vibration.cancel(); };
  }, [loud]);

  function answer(result: GestureResult) {
    if (!result) return;
    Vibration.vibrate(50); // ok and duress feel and look the same
    // "Thanks!" shows while the event is delivered (retried for about 10 s), the same for ok and duress
    setSending(true);
    void state.sendNightEventRetry(result === 'ok' ? 'ConfirmOk' : 'Duress').then(sent => {
      setSending(false);
      if (sent) setThanks(true);
    });
  }
  function pinSent() {
    setPinOpen(false);
    setPinTry(n => n + 1);
  }
  function watch() {
    clearTimeout(decoderTimer.current);
    const at = decoder.nextCheckAt();
    if (at === null) return;
    decoderTimer.current = setTimeout(() => { answer(decoder.tick(Date.now())); watch(); }, Math.max(0, at - Date.now()));
  }

  return (
    <>
      {(screen === 'armed' || screen === 'asking' || screen === 'alarm') && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={screen === 'armed' ? 'Check in' : 'Are you okay?'}
          onPressIn={() => { answer(decoder.pressIn(Date.now())); watch(); }}
          onPressOut={() => { answer(decoder.pressOut(Date.now())); watch(); }}
          style={({ pressed }) => bigStyle(
            loud ? { fill: theme.danger, border: theme.danger } : pressed
              ? { fill: theme.accentPressed, border: theme.accentPressed } : { fill: theme.accent, border: theme.accent },
            pressed, !reduceMotion)}>
          <ThemedText type="subtitle" style={{ color: loud ? theme.onDanger : theme.onAccent, textAlign: 'center' }}>
            {screen === 'armed' ? 'Check in' : loud ? 'Please answer now!' : 'Are you okay?'}
          </ThemedText>
        </Pressable>
      )}
      {screen === 'armed' && (
        <>
          {/* the server checks on its own schedule during a night, so the local countdown does not apply */}
          <ThemedText themeColor="textSecondary">{"We'll check in on you during the night"}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Tap 3 times quickly to check in</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => setPinOpen(open => !open)}
            style={{ minHeight: TouchTarget, justifyContent: 'center', alignSelf: 'flex-start' }}>
            <ThemedText type="smallBold" themeColor="accent">Cancel an alert</ThemedText>
          </Pressable>
          {retryArmed && <ThemedText style={{ color: theme.danger }} accessibilityLiveRegion="polite">Incorrect PIN, try again</ThemedText>}
          {(pinOpen || retryArmed) && <PinEntry onSent={pinSent} />}
        </>
      )}
      {(screen === 'asking' || screen === 'alarm') && (
        <>
          {view.deadline !== null && <Countdown key={view.deadline} deadline={view.deadline} loud={loud} />}
          <ThemedText type="small" themeColor="textSecondary">Tap the button 3 times quickly to say you are okay.</ThemedText>
        </>
      )}
      {screen === 'thanks' && (
        <View accessibilityLiveRegion="polite" style={{ ...panel, backgroundColor: theme.accentSoft }}>
          <ThemedText type="subtitle" style={{ color: theme.accent }}>Thanks!</ThemedText>
        </View>
      )}
      {(screen === 'alert_active' || screen === 'pin_retry') && (
        <>
          <View style={{ ...panel, backgroundColor: theme.dangerSoft, borderWidth: 2, borderColor: theme.danger }}>
            <ThemedText type="heading" style={{ color: theme.danger, textAlign: 'center' }} accessibilityLiveRegion="polite">
              {screen === 'pin_retry' ? 'Incorrect PIN, try again' : 'Your contacts have been alerted'}
            </ThemedText>
          </View>
          <PinEntry onSent={pinSent} />
        </>
      )}
      {(screen === 'ended_true' || screen === 'ended_fake') && (
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <View style={{
              width: 44, height: 44, borderRadius: Radius.round, borderWidth: 3, borderColor: theme.accent,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: screen === 'ended_true' ? theme.accent : 'transparent',
            }}>
              <ThemedText type="name" maxFontSizeMultiplier={1.2}
                style={{ color: screen === 'ended_true' ? theme.onAccent : theme.accent }}>✓</ThemedText>
            </View>
            <ThemedText type="heading" accessibilityLiveRegion="polite">Alert ended</ThemedText>
          </View>
        </Panel>
      )}
      {inAlert ? (
        <ThemedText type="small" themeColor="textSecondary">Enter your PIN to end the alert first.</ThemedText>
      ) : (
        <Button label="Leave night" variant="outline" onPress={() => { void state.sendNightEvent('Leave'); }} />
      )}
    </>
  );
}

// Its own component, keyed by the deadline, so every new ask starts from a fresh clock reading.
function Countdown({ deadline, loud }: { deadline: number; loud: boolean }) {
  const { serverOffset } = useSafekeeps();
  const theme = useTheme();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((deadline * 1000 - (now + serverOffset)) / 1000));
  return (
    <ThemedText type={loud ? 'name' : 'default'} themeColor={loud ? undefined : 'textSecondary'}
      style={loud ? { color: theme.danger } : undefined} accessibilityLiveRegion="polite">
      {loud ? `Your contacts will be told in ${secondsLeft} s` : `Answer in ${secondsLeft} s`}
    </ThemedText>
  );
}

const panel = {
  minHeight: 120, padding: Spacing.four, borderRadius: Radius.control,
  borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
} as const;

function Panel({ children }: PropsWithChildren) {
  const theme = useTheme();
  return <View style={{ ...panel, backgroundColor: theme.backgroundSelected }}>{children}</View>;
}

function PinEntry({ onSent }: { onSent: () => void }) {
  'use no memo'; // same reason as on the home screen
  const state = useSafekeeps();
  const pin = useNativeState('');
  const input = useRef<TextInputRef>(null);
  const [problem, setProblem] = useState('');

  async function end() {
    const value = pin.value;
    if (!/^\d{4}$/.test(value)) return setProblem('Your PIN is 4 digits.');
    setProblem('');
    input.current?.clear();
    await state.sendNightEvent('Resolve', { pin: value });
    onSent();
  }

  return (
    <>
      <TextField ref={input} label="Your PIN" hint="Enter your PIN to end the alert." error={problem === '' ? undefined : problem}
        value={pin} placeholder="4 digits" keyboardType="number-pad"
        secureTextEntry autoCorrect={false} editable={!state.busy} maxLength={4} />
      <Button label="End alert" disabled={state.busy} onPress={() => { void end(); }} />
    </>
  );
}
