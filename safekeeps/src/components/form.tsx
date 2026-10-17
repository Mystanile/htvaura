import { useState } from 'react';
import { Pressable, Switch, TextInput, View, type TextInputProps } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export const INTERVALS = [
  { label: '15 min', value: 15 }, { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 }, { label: '2 hours', value: 120 },
];

// A text input with its label above it, on a field fill and border that stay visible on every card in both modes.
export function Field({ label, helper, ...input }: TextInputProps & { label: string; helper?: string }) {
  const theme = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">{label}</ThemedText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={theme.placeholder}
        selectionColor={theme.accent}
        keyboardAppearance={theme.scheme === 'dark' ? 'dark' : 'light'}
        {...input}
        onFocus={event => { setFocused(true); input.onFocus?.(event); }}
        onBlur={event => { setFocused(false); input.onBlur?.(event); }}
        style={{
          minHeight: 52, paddingHorizontal: Spacing.three, paddingVertical: 12, fontSize: 17,
          borderRadius: Radius.control, borderCurve: 'continuous', borderWidth: 1.5,
          borderColor: focused ? theme.accent : theme.fieldBorder, backgroundColor: theme.field,
          color: theme.text, opacity: input.editable === false ? 0.5 : 1,
        }} />
      {helper && <ThemedText type="small" themeColor="textSecondary">{helper}</ThemedText>}
    </View>
  );
}

// One choice out of a few, shown as chips that wrap. Selected is filled and also has a check, so it never depends on color alone.
export function Choice<T extends string | number>({ label, options, value, onChange, disabled = false }: {
  label?: string; options: { label: string; short?: string; value: T }[]; value: T; onChange: (value: T) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: Spacing.two }}>
      {label && <ThemedText type="smallBold">{label}</ThemedText>}
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two }}>
        {options.map(option => {
          const selected = option.value === value;
          return (
            <Pressable key={String(option.value)} accessibilityRole="radio" accessibilityLabel={option.label}
              accessibilityState={{ selected, disabled }} disabled={disabled} onPress={() => onChange(option.value)}
              style={({ pressed }) => ({
                minHeight: TouchTarget, paddingHorizontal: 12, paddingVertical: Spacing.two,
                borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center',
                backgroundColor: selected ? theme.primary : pressed ? theme.backgroundSelected : 'transparent',
                borderWidth: 1.5, borderColor: selected ? theme.primaryPressed : theme.fieldBorder,
                opacity: disabled ? 0.5 : 1,
              })}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
                {selected ? '✓ ' : ''}{option.short ?? option.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function SwitchRow({ label, value, onValueChange, disabled = false }: {
  label: string; value: boolean; onValueChange: (value: boolean) => void; disabled?: boolean;
}) {
  const theme = useTheme();
  const offTrack = theme.scheme === 'dark' ? '#3B4A4C' : '#B4BBAA'; // a grey, so off never looks like the green on track
  return (
    <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{ checked: value, disabled }}
      disabled={disabled} onPress={() => onValueChange(!value)}
      style={{ minHeight: TouchTarget, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Spacing.three }}>
      <ThemedText style={{ flex: 1 }}>{label}</ThemedText>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} accessible={false}
        trackColor={{ false: offTrack, true: theme.accent }} ios_backgroundColor={offTrack}
        thumbColor="#FBFFF0"
        {...({ activeThumbColor: '#FBFFF0' } as object) /* web only: without it the on thumb is react-native-web's teal */} />
    </Pressable>
  );
}
