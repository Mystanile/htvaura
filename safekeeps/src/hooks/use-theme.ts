/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors, type Theme } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { createContext, use } from 'react';

export const SurfaceThemeContext = createContext<Theme | null>(null);

// A SectionCard puts its own colors in the context, so anything inside reads a matching text, field and button set.
export function useTheme(): Theme {
  const scheme = useColorScheme();
  const surface = use(SurfaceThemeContext);
  const theme = scheme === 'dark' ? 'dark' : 'light';

  return surface ?? Colors[theme];
}
