/**
 * Every color, font, radius and spacing value in the app lives here.
 * Read colors through the useTheme hook, never import a palette directly in a screen.
 *
 * Look: cool slate neutrals and one cobalt accent. Dark mode is a real second palette
 * (no pure black or white). A red "danger" tone exists only for alarms, errors and removing things.
 * Contrast checked: body text 6:1 or better, buttons 6:1 or better, input borders 3:1 or better.
 */

import '@/global.css';

import { Platform } from 'react-native';

const light = {
  background: '#EDF0F6', // screen
  backgroundElement: '#F9FAFD', // cards
  backgroundSelected: '#DCE2EE', // pressed rows, sunken fills, unselected chips
  text: '#111A2B',
  textSecondary: '#4A566B',
  border: '#CBD2DF', // hairlines and card edges
  borderStrong: '#6F7A8D', // input and control edges, 3:1 against every surface
  accent: '#2150D8',
  accentPressed: '#1A41B3',
  accentSoft: '#DDE6FB',
  onAccent: '#F8FAFF',
  danger: '#B3261E',
  dangerSoft: '#FBE4E1',
  onDanger: '#FFF6F5',
  disabled: '#CDD3DF',
  onDisabled: '#515C72',
} as const;

const dark = {
  background: '#0C1018',
  backgroundElement: '#151B27',
  backgroundSelected: '#222A3B',
  text: '#E9EDF5',
  textSecondary: '#A2ADC0',
  border: '#2A3347',
  borderStrong: '#68758C',
  accent: '#86A7FF',
  accentPressed: '#A5BEFF',
  accentSoft: '#1B2A52',
  onAccent: '#0A1228',
  danger: '#FF8F86',
  dangerSoft: '#3A1B1B',
  onDanger: '#2A0A08',
  disabled: '#232B3B',
  onDisabled: '#97A2B6',
} as const;

export type Theme = { [Key in keyof typeof light]: string };
export const Colors: { light: Theme; dark: Theme } = { light, dark };
export type ThemeColor = keyof Theme;

// Figtree (OFL), three static weights loaded in the root layout. Pick the weight by family name, not fontWeight.
export const Font = {
  regular: 'Figtree-Regular',
  semibold: 'Figtree-SemiBold',
  bold: 'Figtree-Bold',
} as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

// 4 point grid.
export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

/**
 * One soft corner system. A control inside a card is one step smaller than the card,
 * a chip inside a control is one step smaller again. Circles use `round`.
 */
export const Radius = { card: 20, control: 14, inner: 11, round: 999 } as const;

export const TouchTarget = 48; // Apple asks for 44 pt at least
export const ScreenGutter = 20;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
