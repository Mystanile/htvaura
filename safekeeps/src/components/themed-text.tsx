import { StyleSheet, Text, type TextProps } from 'react-native';

import { Font, Fonts, ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'caption' | 'subtitle' | 'heading' | 'name' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

// Sizes follow Apple's text styles (body 17, subheadline 15, footnote 13) and grow with Dynamic Type.
// The cap keeps a very large setting from breaking a row, text still gets much bigger.
export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = themeColor ?? (type === 'link' || type === 'linkPrimary' ? 'accent' : 'text');

  return <Text maxFontSizeMultiplier={1.6} style={[{ color: theme[color] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: { fontFamily: Font.regular, fontSize: 17, lineHeight: 24 },
  small: { fontFamily: Font.regular, fontSize: 15, lineHeight: 21 },
  smallBold: { fontFamily: Font.semibold, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: Font.regular, fontSize: 13, lineHeight: 18 },
  name: { fontFamily: Font.semibold, fontSize: 17, lineHeight: 24 },
  heading: { fontFamily: Font.bold, fontSize: 22, lineHeight: 28 },
  subtitle: { fontFamily: Font.bold, fontSize: 28, lineHeight: 34 },
  title: { fontFamily: Font.bold, fontSize: 34, lineHeight: 40 },
  link: { fontFamily: Font.semibold, fontSize: 15, lineHeight: 30 },
  linkPrimary: { fontFamily: Font.semibold, fontSize: 15, lineHeight: 30 },
  code: { fontFamily: Fonts.mono, fontSize: 13, lineHeight: 18 },
});
