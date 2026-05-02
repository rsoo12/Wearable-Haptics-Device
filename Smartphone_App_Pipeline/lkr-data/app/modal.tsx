import { Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';

export default function ModalScreen() {
  const { scrollContentStyle } = useIphone13ContentFrame({
    includeTabBarInset: false,
    contentBottomExtra: 20,
  });

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.inner, scrollContentStyle]}>
        <ThemedText type="title">This is a modal</ThemedText>
        <Link href="/" dismissTo style={styles.link}>
          <ThemedText type="link">Go to home screen</ThemedText>
        </Link>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    marginTop: 20,
    paddingVertical: 16,
  },
});
