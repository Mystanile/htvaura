import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { AppFont, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

// Righteous is for display type (title, heading, name, display, button). Reading text uses the system font.
export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'heading' | 'name' | 'display' | 'button' | 'link' | 'code';
  themeColor?: ThemeColor;
};

const DISPLAY = ['title', 'subtitle', 'heading', 'name', 'display', 'button'];

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text maxFontSizeMultiplier={1.4} style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style,
    DISPLAY.includes(type) && { fontFamily: AppFont, fontWeight: '400' }]} {...rest} />;
}

const styles = StyleSheet.create({
  small: { fontSize: 15, lineHeight: 21, fontWeight: 400 },
  smallBold: { fontSize: 15, lineHeight: 21, fontWeight: 600 },
  default: { fontSize: 17, lineHeight: 24, fontWeight: 400 },
  title: { fontSize: 34, lineHeight: 40 },
  subtitle: { fontSize: 30, lineHeight: 36 },
  heading: { fontSize: 24, lineHeight: 30 },
  name: { fontSize: 20, lineHeight: 26 },
  display: { fontSize: 30, lineHeight: 36 },
  button: { fontSize: 19, lineHeight: 24 },
  link: { fontSize: 15, lineHeight: 21, fontWeight: 600, textDecorationLine: 'underline' },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});
