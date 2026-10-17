import { Image, type ImageSource } from 'expo-image';
import { StyleSheet } from 'react-native';

export const Artwork = {
  header: require('@/assets/images/homebound/header.png'),
  settings: require('@/assets/images/homebound/settingsbutton.png'),
  section: require('@/assets/images/homebound/sectionbig.png'),
  friends: require('@/assets/images/homebound/sectionfriends.png'),
  checkIn: require('@/assets/images/homebound/frame1.png'),
  empty: require('@/assets/images/homebound/friendempty.png'),
  away: require('@/assets/images/homebound/friendaway.png'),
  present: require('@/assets/images/homebound/friendpresent.png'),
};

export function PixelArt({ source }: { source: ImageSource }) {
  return <Image source={source} style={StyleSheet.absoluteFill} contentFit="fill"
    accessible={false} pointerEvents="none" transition={0} />;
}
