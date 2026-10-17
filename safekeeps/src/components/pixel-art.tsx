import { Image as ExpoImage } from 'expo-image';
import { Image, PixelRatio, Platform, StyleSheet, View } from 'react-native';

// One art pixel is exactly 3 device pixels on 2x screens and 4 on 3x screens.
// scripts/make-pixel-assets.py writes those copies to scaled/ (name@2x.png, name@3x.png).
// In points that is 1.5 on 2x and 4/3 on 3x.
export const ART = PixelRatio.get() >= 3 ? 4 / 3 : 3 / 2;
const IOS = Platform.OS === 'ios';

// caps: [top, right, bottom, left] in art pixels. Everything decorated sits inside a cap.
// Between the caps every row and every column is identical, so repeating them adds no new pixels.
function sprite(art: number, scaled: number, w: number, h: number, caps = [0, 0, 0, 0]) {
  return { art, scaled, width: w * ART, height: h * ART, caps };
}
type Sprite = ReturnType<typeof sprite>;

export const Artwork = {
  // planks: columns 176-229 and rows 31-42 are plain
  header: sprite(require('@/assets/images/homebound/header.png'),
    require('@/assets/images/homebound/scaled/header.png'), 242, 46, [31, 12, 3, 176]),
  settings: sprite(require('@/assets/images/homebound/settingsbutton.png'),
    require('@/assets/images/homebound/scaled/settingsbutton.png'), 24, 24),
  // title bar: icon and stripes in columns 0-86, stripes and buttons in 135-221, a plain gap between
  section: sprite(require('@/assets/images/homebound/sectionbig.png'),
    require('@/assets/images/homebound/scaled/sectionbig.png'), 222, 147, [13, 87, 7, 87]),
  friends: sprite(require('@/assets/images/homebound/sectionfriends.png'),
    require('@/assets/images/homebound/scaled/sectionfriends.png'), 222, 135, [6, 5, 6, 5]),
  checkIn: sprite(require('@/assets/images/homebound/frame1.png'),
    require('@/assets/images/homebound/scaled/frame1.png'), 195, 61, [5, 5, 8, 5]),
  empty: sprite(require('@/assets/images/homebound/friendempty.png'),
    require('@/assets/images/homebound/scaled/friendempty.png'), 100, 36, [1, 2, 3, 2]),
  // the outer edge turns darker at row 16 (away) or 20 (present): that change stays in the top cap
  away: sprite(require('@/assets/images/homebound/friendaway.png'),
    require('@/assets/images/homebound/scaled/friendaway.png'), 100, 36, [16, 4, 5, 4]),
  present: sprite(require('@/assets/images/homebound/friendpresent.png'),
    require('@/assets/images/homebound/scaled/friendpresent.png'), 100, 36, [20, 4, 5, 4]),
};

// Fills its parent, behind the content. iOS: nine-slice, caps drawn 1:1, only the plain middle grows.
// Web and Android keep the simple fill (web draws it with image-rendering: pixelated, see global.css).
export function PixelFrame({ sprite }: { sprite: Sprite }) {
  if (!IOS) return <ExpoImage source={sprite.art} style={StyleSheet.absoluteFill} contentFit="fill"
    accessible={false} pointerEvents="none" transition={0} />;
  // Caps are rounded up to whole points (3 art px on 3x, 2 on 2x); the middle left over is still only plain
  // rows and columns. Caps that ended between points left blended pixels at their edges in the simulator check.
  const unit = ART === 1.5 ? 2 : 3;
  const [top, right, bottom, left] = sprite.caps.map(cap => Math.ceil(cap / unit) * unit * ART);
  // RN's Image sizes itself from the source, so it fills a plain wrapper at 100% instead of using absoluteFill.
  // "stretch" of rows and columns that are all the same color gives the same pixels as "repeat". "repeat" was
  // measured to smear the last device pixel row or column of a partly repeated edge, so it is not used.
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Image source={sprite.scaled} style={{ width: '100%', height: '100%' }} resizeMode="stretch"
        capInsets={{ top, right, bottom, left }} accessible={false} />
    </View>
  );
}

// At its natural size, never scaled.
export function PixelSprite({ sprite }: { sprite: Sprite }) {
  const size = { width: sprite.width, height: sprite.height };
  return IOS ? <Image source={sprite.scaled} style={size} accessible={false} />
    : <ExpoImage source={sprite.art} style={size} contentFit="fill" accessible={false} transition={0} />;
}
