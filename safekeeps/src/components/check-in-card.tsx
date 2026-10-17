import { Button, Column, Host, TextInput, useNativeState, type TextInputRef } from '@expo/ui';
import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, Vibration, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ButtonSeed, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { createGestureDecoder, type GestureResult } from '@/services/gesture';
import type { NightView } from '@/services/demo-api';
import { useSafekeeps } from '@/state/safekeeps';

// Goes inside her dark "Safekeeping check in :3" SectionCard, in place of the big button and the
// "Next check-in" line. Her heading, last check-in, requests and friend code stay as they are.
// With no night running (or a night that has ended) it is exactly her old button.
// With a night it follows the server view.
export function CheckInCard() {
  const view = useSafekeeps().night?.view ?? null;
  return view && view.state !== 'ended' ? <NightCheckIn view={view} /> : <PlainCheckIn />;
}

const SETTLE_MS = 4000; // how long "Thanks!" and "Alert ended" stay before the armed look returns
const SETTLES = ['thanks', 'ended_true', 'ended_fake'];

function PlainCheckIn() {
  const state = useSafekeeps();
  const theme = useTheme();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="CHECK IN !!"
        accessibilityState={{ disabled: state.busy, busy: state.busy }}
        disabled={state.busy}
        onPress={() => { void state.recordCheckIn(); }}
        style={({ pressed }) => ({
          minHeight: 112, padding: Spacing.four, borderRadius: Radius.card,
          borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
          backgroundColor: state.busy ? theme.primaryDisabled : pressed ? theme.primaryPressed : theme.primary,
        })}>
        <ThemedText style={{ fontSize: 32, lineHeight: 40, fontWeight: '700', color: theme.onPrimary }}>
          {state.busy ? 'Saving...' : 'Check In'}
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
          accessibilityLabel={screen === 'armed' ? 'CHECK IN !!' : 'Are you okay?'}
          onPressIn={() => { answer(decoder.pressIn(Date.now())); watch(); }}
          onPressOut={() => { answer(decoder.pressOut(Date.now())); watch(); }}
          style={({ pressed }) => ({
            minHeight: 112, padding: Spacing.four, borderRadius: Radius.card,
            borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
            backgroundColor: loud ? theme.text : pressed ? theme.primaryPressed : theme.primary,
            borderWidth: loud ? 4 : 0, borderColor: theme.primary,
          })}>
          <ThemedText style={{ fontSize: 32, lineHeight: 40, fontWeight: '700', color: loud ? theme.backgroundElement : theme.onPrimary }}>
            {screen === 'armed' ? 'Check In' : loud ? 'Please answer now!' : 'Are you okay?'}
          </ThemedText>
        </Pressable>
      )}
      {screen === 'armed' && (
        <>
          {/* the server checks on its own schedule during a night, so her local countdown does not apply */}
          <ThemedText themeColor="textSecondary">{"We'll check in on you during the night"}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Tap 3 times quickly to check in</ThemedText>
          <Pressable accessibilityRole="button" onPress={() => setPinOpen(open => !open)}>
            <ThemedText type="small" themeColor="textSecondary">Cancel an alert</ThemedText>
          </Pressable>
          {retryArmed && <ThemedText accessibilityLiveRegion="polite">Incorrect PIN, try again</ThemedText>}
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
        <View accessibilityLiveRegion="polite" style={{ ...panel, backgroundColor: theme.primary }}>
          <ThemedText style={{ fontSize: 32, lineHeight: 40, fontWeight: '700', color: theme.onPrimary }}>Thanks!</ThemedText>
        </View>
      )}
      {(screen === 'alert_active' || screen === 'pin_retry') && (
        <>
          <Panel>
            <ThemedText type="heading" accessibilityLiveRegion="polite">
              {screen === 'pin_retry' ? 'Incorrect PIN, try again' : 'Your contacts have been alerted'}
            </ThemedText>
          </Panel>
          <PinEntry onSent={pinSent} />
        </>
      )}
      {(screen === 'ended_true' || screen === 'ended_fake') && (
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <View style={{
              width: 40, height: 40, borderRadius: 20, borderWidth: 3, borderColor: theme.primary,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: screen === 'ended_true' ? theme.primary : 'transparent',
            }}>
              <ThemedText type="name" style={{ color: screen === 'ended_true' ? theme.onPrimary : theme.primary }}>✓</ThemedText>
            </View>
            <ThemedText type="heading" accessibilityLiveRegion="polite">Alert ended</ThemedText>
          </View>
        </Panel>
      )}
      {inAlert ? (
        <ThemedText type="small" themeColor="textSecondary">Enter your PIN to end the alert first.</ThemedText>
      ) : (
        <Host matchContents seedColor={ButtonSeed}>
          <Button label="Leave night" variant="outlined" onPress={() => { void state.sendNightEvent('Leave'); }} />
        </Host>
      )}
    </>
  );
}

// Its own component, keyed by the deadline, so every new ask starts from a fresh clock reading.
function Countdown({ deadline, loud }: { deadline: number; loud: boolean }) {
  const { serverOffset } = useSafekeeps();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const secondsLeft = Math.max(0, Math.ceil((deadline * 1000 - (now + serverOffset)) / 1000));
  return (
    <ThemedText themeColor="textSecondary" accessibilityLiveRegion="polite">
      {loud ? `Your contacts will be told in ${secondsLeft} s` : `Answer in ${secondsLeft} s`}
    </ThemedText>
  );
}

const panel = {
  minHeight: 112, padding: Spacing.four, borderRadius: Radius.card,
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
      <ThemedText type="small" themeColor="textSecondary">Enter your PIN to end the alert.</ThemedText>
      {problem !== '' && <ThemedText type="small" accessibilityLiveRegion="polite">{problem}</ThemedText>}
      <Host matchContents seedColor={ButtonSeed}>
        <Column spacing={12}>
          <TextInput ref={input} value={pin} placeholder="4-digit PIN" keyboardType="number-pad"
            secureTextEntry autoCorrect={false} editable={!state.busy} maxLength={4} />
          <Button label="End alert" disabled={state.busy} onPress={() => { void end(); }} />
        </Column>
      </Host>
    </>
  );
}
