/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createContext, use } from 'react';

type Theme = { [Key in keyof typeof Colors.light]: string };
export const SurfaceThemeContext = createContext<Theme | null>(null);

export function useTheme() {
  const scheme = useColorScheme();
  const surface = use(SurfaceThemeContext);
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return surface ?? Colors[theme];
}
