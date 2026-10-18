import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Pressable, Vibration, View } from 'react-native';

import { Artwork, PixelFrame } from '@/components/pixel-art';
import { AppButton } from '@/components/app-button';
import { ButtonParticles } from '@/components/pixel-particles';
import { Field } from '@/components/form';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useAnnounce } from '@/hooks/use-announce';
import { useTheme } from '@/hooks/use-theme';
import { clockText } from '@/services/home-by';
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

// What a screen reader says when the screen changes. Same words wherever the screens look the same: ok and duress both
// end on 'thanks', and the real PIN, the duress PIN and a closed alert all say 'Alert ended'.
const SPOKEN: Record<string, string> = {
  asking: 'Are you okay? Tap three times quickly if you are okay.',
  alarm: 'Please answer now. Tap three times quickly if you are okay.',
  thanks: 'Thanks!',
  alert_active: 'Your contacts have been alerted',
  pin_retry: 'Incorrect PIN, try again',
  ended_true: 'Alert ended',
  ended_fake: 'Alert ended',
};

function PlainCheckIn() {
  const state = useSafekeeps();
  const theme = useTheme();
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Check in"
        accessibilityState={{ disabled: state.busy, busy: state.busy }}
        disabled={state.busy}
        onPress={() => { void state.recordCheckIn(); }}
        style={{
          ...hero,
          opacity: state.busy ? 0.6 : 1,
        }}>
        {({ pressed }) => <>
        <PixelFrame sprite={pressed && !state.busy ? Artwork.checkInPressed : Artwork.checkIn} />
        <ThemedText type="display" style={{ color: state.busy ? theme.textSecondary : theme.onPrimary }}>
          {state.busy ? 'Saving...' : 'Check In'}
        </ThemedText>
        <ButtonParticles active={pressed && !state.busy} />
        </>}
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
  const touch = useRef({ down: false, at: 0 }); // tells a real touch from a screen reader's activation (see onPress below)
  const [timedOut, setTimedOut] = useState<string | null>(null); // a "Thanks!"-type screen that has run its time
  const [thanks, setThanks] = useState(false); // local "Thanks!" after a gesture, the same for ok and duress
  const [sending, setSending] = useState(false); // gesture finished, still being delivered (retries)
  const [pinOpen, setPinOpen] = useState(false); // "Cancel an alert" on the armed screen
  const [pinTry, setPinTry] = useState(0); // bumps on every PIN sent, so the same answer twice still shows
  const [leaving, setLeaving] = useState(false); // "Leave night" tapped once, waiting for "Yes, leave the night"
  const [seenScreen, setSeenScreen] = useState(view.screen);
  if (seenScreen !== view.screen) { // close that PIN entry and the leave question as soon as the server view moves on
    setSeenScreen(view.screen);
    setPinOpen(false);
    setLeaving(false);
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
  useAnnounce(SPOKEN[retryArmed && screen === 'armed' ? 'pin_retry' : screen] ?? null);
  useAnnounce(leaving ? 'Leave the night? We will stop checking in on you.' : null);

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
          accessibilityHint="Tap three times quickly if you are okay"
          onPressIn={() => { touch.current = { down: true, at: Date.now() }; answer(decoder.pressIn(Date.now())); watch(); }}
          onPressOut={() => { touch.current = { down: false, at: Date.now() }; answer(decoder.pressOut(Date.now())); watch(); }}
          // TalkBack sends a click with no touch, so the press handlers never run. Count that click as one quick tap
          // (three of them say ok, same as three taps). A real touch also ends in onPress, which is skipped here.
          onPress={() => {
            const now = Date.now();
            if (touch.current.down || now - touch.current.at < 300) return;
            answer(decoder.pressIn(now)); answer(decoder.pressOut(now)); watch();
          }}
          style={{
            ...hero,
            borderWidth: loud ? 4 : 0, borderColor: theme.primary,
          }}>
          {({ pressed }) => <>
          <PixelFrame sprite={pressed ? Artwork.checkInPressed : Artwork.checkIn} />
          <ThemedText type="display" style={{ textAlign: 'center', color: theme.onPrimary }}>
            {screen === 'armed' ? 'Check In' : loud ? 'Please answer now!' : 'Are you okay?'}
          </ThemedText>
          <ButtonParticles active={pressed} />
          </>}
        </Pressable>
      )}
      {screen === 'armed' && (
        <>
          {/* the server checks on its own schedule during a night, so her local countdown does not apply */}
          <ThemedText themeColor="textSecondary">{"We'll check in on you during the night"}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">Tap 3 times quickly to check in</ThemedText>
          {view.home_by != null && (
            <ThemedText type="small" themeColor="textSecondary">Home-by check at {clockText(view.home_by * 1000 - state.serverOffset)}</ThemedText>
          )}
          <AppButton variant="quiet" label="Cancel an alert" onPress={() => setPinOpen(open => !open)} />
          {retryArmed && <ThemedText style={{ color: theme.danger }}>Incorrect PIN, try again</ThemedText>}
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
        <View style={{ ...hero, backgroundColor: theme.primary }}>
          <ThemedText type="display" style={{ color: theme.onPrimary }}>Thanks!</ThemedText>
        </View>
      )}
      {(screen === 'alert_active' || screen === 'pin_retry') && (
        <>
          <Panel>
            <ThemedText type="heading" style={{ textAlign: 'center' }}>
              {screen === 'pin_retry' ? 'Incorrect PIN, try again' : 'Your contacts have been alerted'}
            </ThemedText>
          </Panel>
          <PinEntry onSent={pinSent} hideHelper />
        </>
      )}
      {(screen === 'ended_true' || screen === 'ended_fake') && (
        <Panel>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.three }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{
              // the ring is the same for both, so only the fill tells them apart. border is about 2.9:1 on the panel
              width: 44, height: 44, borderRadius: Radius.pill, borderWidth: 3, borderColor: theme.border,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: screen === 'ended_true' ? theme.primary : 'transparent',
            }}>
              <ThemedText style={{ fontWeight: '700', color: screen === 'ended_true' ? theme.onPrimary : theme.border }}>✓</ThemedText>
            </View>
            <ThemedText type="heading">Alert ended</ThemedText>
          </View>
        </Panel>
      )}
      {inAlert ? (
        <ThemedText type="small" themeColor="textSecondary">Enter your PIN to end the alert first.</ThemedText>
      ) : view.state !== 'armed' ? null /* asking or waiting: answer the check first, the server refuses Leave now */
        : leaving ? (
        <>
          <ThemedText>Leave the night? We will stop checking in on you.</ThemedText>
          <AppButton label="Yes, leave the night" variant="danger" disabled={state.busy}
            onPress={() => { setLeaving(false); void state.sendNightEvent('Leave'); }} />
          <AppButton label="Cancel" variant="quiet" onPress={() => setLeaving(false)} />
        </>
      ) : (
        <AppButton label="Leave night" variant="secondary" onPress={() => setLeaving(true)} />
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
    <ThemedText themeColor="textSecondary">
      {loud ? `Your contacts will be told in ${secondsLeft} s` : `Answer in ${secondsLeft} s`}
    </ThemedText>
  );
}

// The big tap target and the "Thanks!" panel share one shape so the card does not jump between states.
const hero = {
  minHeight: 120, padding: Spacing.card,
  borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
} as const;

function Panel({ children }: PropsWithChildren) {
  const theme = useTheme();
  return <View style={{ ...hero, backgroundColor: theme.backgroundSelected }}>{children}</View>;
}

// hideHelper: the card already says to enter the PIN, so the field does not say it twice.
function PinEntry({ onSent, hideHelper = false }: { onSent: () => void; hideHelper?: boolean }) {
  const state = useSafekeeps();
  const theme = useTheme();
  const [pin, setPin] = useState('');
  const [problem, setProblem] = useState('');

  async function end() {
    const value = pin;
    if (!/^\d{4}$/.test(value)) return setProblem('Your PIN is 4 digits.');
    setProblem('');
    setPin('');
    await state.sendNightEvent('Resolve', { pin: value });
    onSent();
  }

  return (
    <>
      <Field label="Your PIN" helper={hideHelper ? undefined : 'Enter your PIN to end the alert.'} value={pin} onChangeText={setPin}
        placeholder="4 digits" keyboardType="number-pad" secureTextEntry autoCorrect={false}
        editable={!state.busy} maxLength={4} />
      {problem !== '' && <ThemedText type="small" announce style={{ color: theme.danger }}>{problem}</ThemedText>}
      <AppButton label="End alert" disabled={state.busy} onPress={() => { void end(); }} />
    </>
  );
}
