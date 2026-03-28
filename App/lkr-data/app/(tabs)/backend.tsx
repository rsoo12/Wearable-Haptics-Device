import React, { useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { fetchHelloMessage } from '@/lib/api';

export default function BackendScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string>('');
  const [error, setError] = useState<string>('');

  const abortRef = useRef<AbortController | null>(null);

  const buttonLabel = useMemo(() => {
    if (status === 'loading') return 'Calling backend…';
    return 'Call AWS Lambda';
  }, [status]);

  const onPress = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setError('');
    setMessage('');

    try {
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetchHelloMessage(controller.signal);
      clearTimeout(timeout);

      setMessage(res.message);
      setStatus('success');
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('error');
    }
  };

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView
        contentContainerStyle={[stylesThemed.content, scrollContentStyle]}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={stylesThemed.title}>
          Backend Test
        </ThemedText>

        <ThemedText style={stylesThemed.muted}>
          Set {`EXPO_PUBLIC_API_BASE_URL`} to your deployed API base URL (ends with /prod).
        </ThemedText>

        <TouchableOpacity
          style={[stylesThemed.button, status === 'loading' && stylesThemed.buttonDisabled]}
          onPress={onPress}
          disabled={status === 'loading'}
          activeOpacity={0.7}>
          <ThemedText style={stylesThemed.buttonText}>{buttonLabel}</ThemedText>
        </TouchableOpacity>

        {status === 'success' && (
          <ThemedView style={stylesThemed.result}>
            <ThemedText type="subtitle">Message from Lambda</ThemedText>
            <ThemedText style={stylesThemed.resultText}>{message}</ThemedText>
          </ThemedView>
        )}

        {status === 'error' && (
          <ThemedView style={stylesThemed.result}>
            <ThemedText type="subtitle">Error</ThemedText>
            <ThemedText style={stylesThemed.errorText}>{error}</ThemedText>
          </ThemedView>
        )}
      </ScrollView>
    </ThemedView>
  );
}

function createStyles(theme: (typeof Colors)['light']) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { gap: 16 },
    title: { marginBottom: 2 },
    muted: { color: theme.muted, fontSize: 13 },
    button: {
      paddingHorizontal: 20,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    buttonDisabled: { opacity: 0.6 },
    buttonText: { color: theme.buttonOnPrimary, fontWeight: '600', fontSize: 16 },
    result: { gap: 8, paddingTop: 10 },
    resultText: { fontSize: 15, color: theme.text },
    errorText: { fontSize: 13, color: theme.buttonDestructive },
  });
}
