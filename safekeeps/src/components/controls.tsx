import { Host, TextInput, type TextInputProps } from '@expo/ui';
import { Platform, Pressable, Switch, View } from 'react-native';

import { inputModifiers } from '@/components/input-frame';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useReduceMotion } from '@/hooks/use-reduce-motion';
import { useScheme, useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'tonal' | 'outline' | 'danger';

// One button for the whole app. 50 pt tall at least, the label can wrap when the text size is large.
export function Button({ label, onPress, variant = 'primary', disabled = false }: {
  label: string; onPress: () => void; variant?: Variant; disabled?: boolean;
}) {
  const theme = useTheme();
  const reduceMotion = useReduceMotion();
  const look = {
    primary: { bg: theme.accent, pressed: theme.accentPressed, fg: theme.onAccent, border: theme.accent },
    tonal: { bg: theme.accentSoft, pressed: theme.accentSoft, fg: theme.accent, border: theme.accentSoft },
    outline: { bg: 'transparent', pressed: theme.backgroundSelected, fg: theme.text, border: theme.borderStrong },
    danger: { bg: theme.danger, pressed: theme.danger, fg: theme.onDanger, border: theme.danger },
  }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 50, paddingHorizontal: Spacing.three, paddingVertical: 12,
        borderRadius: Radius.control, borderCurve: 'continuous', borderWidth: 1.5,
        alignItems: 'center', justifyContent: 'center',
        backgroundColor: disabled ? theme.disabled : pressed ? look.pressed : look.bg,
        borderColor: disabled ? theme.disabled : look.border,
        opacity: pressed && !disabled && variant !== 'primary' ? 0.8 : 1,
        transform: [{ scale: pressed && !disabled && !reduceMotion ? 0.98 : 1 }],
      })}>
      <ThemedText type="name" style={{ color: disabled ? theme.onDisabled : look.fg, textAlign: 'center' }}>{label}</ThemedText>
    </Pressable>
  );
}

// Label above, input, then hint or error below. The input is native, so it gets the theme colors explicitly.
export function TextField({ label, hint, error, ...input }: TextInputProps & { label: string; hint?: string; error?: string }) {
  'use no memo'; // @expo/ui web TextInput only redraws when its screen re-renders, the compiler would skip that
  const theme = useTheme();
  const scheme = useScheme();
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <View>
        <Host matchContents={{ vertical: true }} colorScheme={scheme} seedColor={theme.accent}>
          <TextInput
            placeholderTextColor={theme.textSecondary}
            selectionColor={theme.accent}
            style={{
              height: Platform.OS === 'ios' ? undefined : TouchTarget, paddingHorizontal: Spacing.three, backgroundColor: theme.backgroundSelected,
              borderRadius: Radius.control, borderWidth: Platform.OS === 'web' ? 0 : undefined,
            }}
            modifiers={inputModifiers}
            textStyle={{ color: theme.text, fontSize: Platform.OS === 'web' ? 17 : undefined }}
            {...input}
          />
        </Host>
        {/* The edge is drawn here, not natively: a native border gets its corners cut by the rounded clip. */}
        <View pointerEvents="none" style={{
          position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: Radius.control, borderCurve: 'continuous',
          borderWidth: 1.5, borderColor: theme.borderStrong,
        }} />
      </View>
      {hint && !error && <ThemedText type="caption" themeColor="textSecondary">{hint}</ThemedText>}
      {error && <ThemedText type="caption" style={{ color: theme.danger }} accessibilityLiveRegion="polite">{error}</ThemedText>}
    </View>
  );
}

// A small set of choices on one line. Replaces the native menu picker, which hid the options.
export function Segmented<T extends string | number>({ label, options, value, onChange, disabled = false }: {
  label?: string; options: { label: string; value: T }[]; value: T; onChange: (value: T) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.two, opacity: disabled ? 0.5 : 1 }}>
      {label && <ThemedText type="smallBold">{label}</ThemedText>}
      <View accessibilityRole="radiogroup" style={{
        flexDirection: 'row', padding: 3, gap: 3, borderRadius: Radius.control, borderCurve: 'continuous',
        backgroundColor: theme.backgroundSelected,
      }}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable key={String(option.value)} accessibilityRole="radio" accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onChange(option.value)}
              style={{
                flex: 1, minHeight: 44, paddingHorizontal: Spacing.one, alignItems: 'center', justifyContent: 'center',
                borderRadius: Radius.inner, borderCurve: 'continuous',
                backgroundColor: selected ? theme.accent : 'transparent',
              }}>
              <ThemedText type="smallBold" maxFontSizeMultiplier={1.3}
                style={{ color: selected ? theme.onAccent : theme.text, textAlign: 'center' }}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// Label on the left, switch on the right. The whole row is the tap target.
export function SwitchRow({ label, value, onValueChange, disabled = false }: {
  label: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }}
      disabled={disabled} onPress={() => onValueChange(!value)}
      style={{ minHeight: TouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
      <ThemedText type="name" style={{ flex: 1 }}>{label}</ThemedText>
      <View style={{ width: 51, height: 31 }}>
        <Switch value={value} disabled={disabled} onValueChange={onValueChange}
          trackColor={{ false: theme.borderStrong, true: theme.accent }} ios_backgroundColor={theme.borderStrong}
          thumbColor={theme.backgroundElement} accessible={false} />
      </View>
    </Pressable>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}

// Small round tag for the first letter of a name.
export function Avatar({ name, size = 44 }: { name: string; size?: number }) {
  const theme = useTheme();
  return (
    <View accessible={false} style={{
      width: size, height: size, borderRadius: Radius.round, backgroundColor: theme.accentSoft,
      alignItems: 'center', justifyContent: 'center',
    }}>
      <ThemedText type="name" style={{ color: theme.accent }} maxFontSizeMultiplier={1.2}>{name.charAt(0).toUpperCase()}</ThemedText>
    </View>
  );
}
