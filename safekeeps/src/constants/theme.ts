/**
 * Theme tokens for the whole app. One place, light and dark sets, read through useTheme().
 * Brand: #f8ffe8 paper, #162224 ink, #B1CF58 lime (primary), #4D651C moss (accent).
 * Dark mode is the same greens moved down the scale, never pure black or pure white.
 *
 * Surfaces ("tones") sit on the page background and re-define the text, field and button colors
 * that belong on them, so a component only ever reads useTheme() and gets a readable pair:
 *   plain  white card (dark: raised teal card)
 *   ink    her dark "check in" card
 *   green  her friends card
 *   soft   pale accent card
 */

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
  scheme: 'light',
  text: '#162224',
  textSecondary: '#56604C',
  background: '#f8ffe8',
  backgroundElement: '#FFFFFF',
  backgroundSelected: '#E3EECF',
  border: '#D6E2C4',
  accent: '#4D651C',
  accentSoft: '#E5F0CC',
  onAccent: '#FFFFFF',
  primary: '#B1CF58',
  primaryPressed: '#9AB744',
  primaryDisabled: '#D3DCC0',
  onPrimary: '#162224',
  field: '#F4F9E8',
  fieldBorder: '#7C9158',
  placeholder: '#647058',
  danger: '#A23B2A',
};

const dark: Tokens = {
  scheme: 'dark',
  text: '#EEF5E0',
  textSecondary: '#AEBBA8',
  background: '#0B1314',
  backgroundElement: '#121D1F',
  backgroundSelected: '#1D2B2D',
  border: '#26383A',
  accent: '#B1CF58',
  accentSoft: '#233019',
  onAccent: '#162224',
  primary: '#B1CF58',
  primaryPressed: '#97B341',
  primaryDisabled: '#2E3A2A',
  onPrimary: '#162224',
  field: '#0B1314',
  fieldBorder: '#6F8A6A',
  placeholder: '#97A693',
  danger: '#FF9C8A',
};

export const Colors = { light, dark } as const;
export type ThemeColor = Exclude<keyof Tokens, 'scheme'>;
export type Theme = { [Key in keyof Tokens]: string };
export type Tone = 'plain' | 'ink' | 'green' | 'soft';

// Her dark card: ink in light mode, a step lighter in dark mode so it still lifts off the page.
const ink = {
  scheme: 'dark', text: '#f8ffe8', textSecondary: '#C4CEBD', accent: '#B1CF58', accentSoft: '#304137',
  onAccent: '#162224', primary: '#B1CF58', primaryPressed: '#9AB744', primaryDisabled: '#33443F',
  onPrimary: '#162224', fieldBorder: '#7E9A5C', placeholder: '#9FB09A', danger: '#FF9C8A',
} as const;

const green = {
  light: {
    scheme: 'light', backgroundElement: '#9ebd64', backgroundSelected: '#90AD59', border: '#7F9C4D',
    text: '#162224', textSecondary: '#2B3A1A', accent: '#162224', accentSoft: '#E5F0CC', onAccent: '#f8ffe8',
    primary: '#162224', primaryPressed: '#2C3E40', primaryDisabled: '#86A253', onPrimary: '#f8ffe8',
    field: '#F4F9E8', fieldBorder: '#4D651C', placeholder: '#5A6650', danger: '#7A1A10',
  },
  dark: {
    scheme: 'dark', backgroundElement: '#25341A', backgroundSelected: '#2F4222', border: '#3A4F27',
    text: '#EEF5E0', textSecondary: '#C3D1A4', accent: '#B1CF58', accentSoft: '#34471F', onAccent: '#162224',
    primary: '#B1CF58', primaryPressed: '#97B341', primaryDisabled: '#34411F', onPrimary: '#162224',
    field: '#1A2512', fieldBorder: '#7E9A4A', placeholder: '#A9B88C', danger: '#FF9C8A',
  },
} as const;

export const Tones: Record<'light' | 'dark', Record<Tone, Theme>> = {
  light: {
    plain: light,
    ink: { ...light, ...ink, backgroundElement: '#162224', backgroundSelected: '#243638', border: '#162224',
      field: '#0F1819' },
    green: { ...light, ...green.light },
    soft: { ...light, backgroundElement: '#E5F0CC', backgroundSelected: '#D6E6B2', border: '#C8DBA3', fieldBorder: '#6B7F48' },
  },
  dark: {
    plain: dark,
    ink: { ...dark, ...ink, backgroundElement: '#1A2B2D', backgroundSelected: '#263B3D', border: '#36504F',
      field: '#0E1819' },
    green: { ...dark, ...green.dark },
    soft: { ...dark, backgroundElement: '#1F2D17', backgroundSelected: '#2A3B1F', border: '#34471F' },
  },
};

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
