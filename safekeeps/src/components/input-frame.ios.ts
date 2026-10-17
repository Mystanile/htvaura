import { frame } from '@expo/ui/swift-ui/modifiers';

import { TouchTarget } from '@/constants/theme';

// iPhone: at least 48 pt tall and still growing with the text size, and the whole box takes the tap.
export const inputModifiers = [frame({ minHeight: TouchTarget })];
