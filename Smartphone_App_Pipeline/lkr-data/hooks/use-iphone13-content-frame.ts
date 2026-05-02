import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CONTENT_TOP_EXTRA,
  IPHONE_13_CONTENT_HORIZONTAL_INSET,
  IPHONE_13_LAYOUT_WIDTH,
  TAB_BAR_HEIGHT,
} from '@/constants/layout';

type Options = {
  /** Add space for the bottom tab bar (tab screens). */
  includeTabBarInset?: boolean;
  /** Extra bottom padding after safe area / tab bar. */
  contentBottomExtra?: number;
};

/**
 * Padding and width so the main column matches an iPhone 13 width (390pt), centered when the window is wider.
 */
export function useIphone13ContentFrame(options: Options = {}) {
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const includeTabBar = options.includeTabBarInset ?? true;
  const bottomExtra = options.contentBottomExtra ?? 24;

  const columnWidth = Math.min(IPHONE_13_LAYOUT_WIDTH, windowWidth);

  return {
    columnWidth,
    scrollContentStyle: {
      paddingTop: Math.max(insets.top, 12) + CONTENT_TOP_EXTRA,
      paddingBottom: insets.bottom + (includeTabBar ? TAB_BAR_HEIGHT : 0) + bottomExtra,
      paddingHorizontal: IPHONE_13_CONTENT_HORIZONTAL_INSET,
      width: columnWidth,
      alignSelf: 'center' as const,
    },
  };
}
