/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://unistyl.es/), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

const Palette = {
  text: '#162224',
  background: '#f8ffe8',
  backgroundElement: '#FFFFFF',
  backgroundSelected: '#E3EECF',
  textSecondary: '#56604C',
  accent: '#4D651C',
  accentSoft: '#E5F0CC',
  onAccent: '#FFFFFF',
  border: '#D6E2C4',
  primary: '#B1CF58',
  primaryPressed: '#9AB744',
  primaryDisabled: '#D3DCC0',
  onPrimary: '#162224',
} as const;

// Keep the requested brand palette in both system appearance modes.
export const Colors = { light: Palette, dark: Palette } as const;
export const CardColors = {
  text: '#f8ffe8', textSecondary: '#C4CEBD',
  backgroundElement: '#162224', backgroundSelected: '#243638',
  border: '#162224', accent: '#B1CF58', accentSoft: '#304137',
} as const;
export const AppFont = 'Righteous';

export const FriendsColors = {
  backgroundElement: '#9ebd64', backgroundSelected: '#90AD59',
  text: '#162224', textSecondary: '#162224', accent: '#162224',
  border: '#9ebd64',
} as const;


export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

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

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const Radius = { card: 20, control: 12, avatar: 16 } as const;
export const ButtonSeed = '#657F25';
