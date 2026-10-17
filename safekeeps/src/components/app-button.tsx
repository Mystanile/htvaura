import { Pressable, View } from 'react-native';

import { Artwork, PixelArt } from '@/components/pixel-art';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing, TouchTarget } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

type Variant = 'primary' | 'secondary' | 'danger' | 'quiet';

// primary: filled lime (or ink on the green card). secondary: outlined. danger: outlined red, for removing things.
// quiet: text only, still a 44 pt target. All variants read the colors of the card they sit on.
export function AppButton({ label, onPress, variant = 'primary', disabled = false, flex = false }: {
  label: string; onPress?: () => void; variant?: Variant; disabled?: boolean; flex?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => {
        const filled = variant === 'primary';
        const edge = variant === 'danger' ? theme.danger : variant === 'secondary' ? theme.accent : theme.primaryPressed;
        return {
          minHeight: variant === 'quiet' ? TouchTarget : 52, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
          borderRadius: Radius.control, borderCurve: 'continuous', alignItems: 'center', justifyContent: 'center',
          flex: flex ? 1 : undefined,
          backgroundColor: filled ? 'transparent'
            : pressed && variant !== 'quiet' ? theme.backgroundSelected : 'transparent',
          borderWidth: filled || variant === 'quiet' ? 0 : 1.5,
          borderColor: disabled ? theme.border : edge,
          opacity: disabled && !filled ? 0.5 : 1,
          transform: [{ scale: pressed && !disabled ? 0.98 : 1 }],
        };
      }}>
      {variant === 'primary' && <PixelArt source={Artwork.checkIn} />}
      <View pointerEvents="none">
        <ThemedText type="button" style={{
          textAlign: 'center',
          color: variant === 'primary' ? (disabled ? theme.textSecondary : theme.onPrimary)
            : variant === 'danger' ? theme.danger : variant === 'quiet' ? theme.accent : theme.text,
        }}>{label}</ThemedText>
      </View>
    </Pressable>
  );
}
