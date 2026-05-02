import type { PropsWithChildren, ReactElement } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useScrollOffset,
} from 'react-native-reanimated';

import { ThemedView } from '@/components/themed-view';
import {
  IPHONE_13_CONTENT_HORIZONTAL_INSET,
  IPHONE_13_LAYOUT_WIDTH,
  PARALLAX_CONTENT_TOP_PADDING,
  TAB_BAR_HEIGHT,
} from '@/constants/layout';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useThemeColor } from '@/hooks/use-theme-color';

const HEADER_HEIGHT = 250;

type Props = PropsWithChildren<{
  headerImage: ReactElement;
  headerBackgroundColor: { dark: string; light: string };
}>;

export default function ParallaxScrollView({
  children,
  headerImage,
  headerBackgroundColor,
}: Props) {
  const backgroundColor = useThemeColor({}, 'background');
  const colorScheme = useColorScheme() ?? 'light';
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const columnWidth = Math.min(IPHONE_13_LAYOUT_WIDTH, windowWidth);
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const headerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollOffset.value,
            [-HEADER_HEIGHT, 0, HEADER_HEIGHT],
            [-HEADER_HEIGHT / 2, 0, HEADER_HEIGHT * 0.75]
          ),
        },
        {
          scale: interpolate(scrollOffset.value, [-HEADER_HEIGHT, 0, HEADER_HEIGHT], [2, 1, 1]),
        },
      ],
    };
  });

  return (
    <Animated.ScrollView
      ref={scrollRef}
      style={{ backgroundColor, flex: 1 }}
      scrollEventThrottle={16}>
      <Animated.View
        style={[
          styles.header,
          { backgroundColor: headerBackgroundColor[colorScheme] },
          headerAnimatedStyle,
        ]}>
        {headerImage}
      </Animated.View>
      <ThemedView
        style={[
          styles.content,
          {
            width: columnWidth,
            alignSelf: 'center',
            paddingHorizontal: IPHONE_13_CONTENT_HORIZONTAL_INSET,
            paddingTop: PARALLAX_CONTENT_TOP_PADDING,
            paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
          },
        ]}>
        {children}
      </ThemedView>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    height: HEADER_HEIGHT,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    gap: 16,
    overflow: 'hidden',
  },
});
