/** Theme tokens shared by the artwork surfaces and native controls. */

import '@/global.css';

import { Platform } from 'react-native';

type Tokens = {
  scheme: 'light' | 'dark'; // the look of this surface, used for keyboards and native pickers
  text: string;
  textSecondary: string;
  background: string; // the page
  backgroundElement: string; // a card or row on the page
  backgroundSelected: string; // pressed row, panel inside a card
  border: string; // card and divider lines
  accent: string; // links, focus ring, switch, outlines
  accentSoft: string;
  onAccent: string;
  primary: string; // main button
  primaryPressed: string;
  primaryDisabled: string;
  onPrimary: string;
  field: string; // text input fill
  fieldBorder: string; // 3:1 or better against the surface
  placeholder: string; // 4.5:1 or better on the field
  danger: string; // errors only
};

const light: Tokens = {
  scheme: 'light', text: '#5C5439', textSecondary: '#686442',
  background: '#9ED395', backgroundElement: '#B1C69B', backgroundSelected: '#DCD3B5',
  border: '#8A7857', accent: '#52653B', accentSoft: '#EAE3CB', onAccent: '#F8F3E0',
  primary: '#D5B796', primaryPressed: '#C5A380', primaryDisabled: '#DDD0B8', onPrimary: '#5C5439',
  field: '#EAE3CB', fieldBorder: '#8A7857', placeholder: '#686442', danger: '#8A302D',
};

const dark: Tokens = { ...light };

export const Colors = { light, dark } as const;
export type ThemeColor = Exclude<keyof Tokens, 'scheme'>;
export type Theme = { [Key in keyof Tokens]: string };
export type Tone = 'plain' | 'ink' | 'green' | 'soft';

// Both system appearances use the supplied artwork palette.
const surfaces: Record<Tone, Theme> = {
  plain: light,
  ink: light,
  green: { ...light, backgroundElement: '#EAE3CB' },
  soft: { ...light, backgroundElement: '#EAE3CB' },
};
export const Tones = { light: surfaces, dark: surfaces };

export const AppFont = 'Righteous';

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
  three: 16, // screen gutter, gap between things in a card
  card: 20, // padding inside a card
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

// One radius rule: cards 24, everything inside a card (buttons, fields, panels, tiles) 16, chips and dots round.
export const Radius = { card: 24, control: 16, pill: 999 } as const;

// Smallest comfortable touch target on iOS, in points.
export const TouchTarget = 44;
