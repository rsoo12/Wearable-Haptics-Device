import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { deleteSessionSummary, listSessionSummaries, SessionSummaryEntry } from '@/lib/api';

function MiniAreaBars({ data, height = 110 }: { data: number[]; height?: number }) {
  if (data.length === 0) {
    return (
      <View style={[styles.chart, { height }]}>
        <ThemedText style={styles.emptyChartText}>No sessions yet</ThemedText>
      </View>
    );
  }
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.0001, max - min);

  return (
    <View style={[styles.chart, { height }]}>
      {data.map((v, i) => {
        const pct = (v - min) / range;
        const h = Math.max(2, Math.round(pct * (height - 12)));
        return (
          <View
            key={`${i}-${v}`}
            style={[
              styles.bar,
              {
                height: h,
                opacity: 0.25 + 0.75 * pct,
              },
            ]}
          />
        );
      })}
    </View>
  );
}

function formatDateLabel(iso: string) {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);
  const [sessions, setSessions] = useState<SessionSummaryEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const items = await listSessionSummaries();
      setSessions(items);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onDeleteSession = useCallback(
    async (sessionId: string) => {
      setDeletingSessionId(sessionId);
      setError('');
      try {
        await deleteSessionSummary(sessionId);
        setSessions(prev => prev.filter(item => item.session_id !== sessionId));
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setDeletingSessionId(null);
      }
    },
    [],
  );

  const avgAllTime = useMemo(() => {
    if (sessions.length === 0) return null;
    return sessions.reduce((sum, item) => sum + item.avg_fpa_deg, 0) / sessions.length;
  }, [sessions]);
  const avgFpaBySession = useMemo(
    () => [...sessions].reverse().map(item => item.avg_fpa_deg),
    [sessions],
  );

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView contentContainerStyle={[stylesThemed.content, scrollContentStyle]} keyboardShouldPersistTaps="handled">
        <ThemedText type="title">History</ThemedText>

        <ThemedView style={stylesThemed.kpiRow}>
          <ThemedView style={stylesThemed.kpiCard}>
            <ThemedText style={stylesThemed.kpiLabel}>All-time avg FPA</ThemedText>
            <ThemedText style={stylesThemed.kpiValue}>
              {avgAllTime != null ? `${avgAllTime.toFixed(1)}°` : '—'}
            </ThemedText>
          </ThemedView>
          <ThemedView style={stylesThemed.kpiCard}>
            <ThemedText style={stylesThemed.kpiLabel}>Saved sessions</ThemedText>
            <ThemedText style={stylesThemed.kpiValue}>{sessions.length}</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Average FPA across sessions</ThemedText>
          <ThemedView style={stylesThemed.chartCard}>
            <MiniAreaBars data={avgFpaBySession} height={120} />
            <View style={stylesThemed.chartLegendRow}>
              <ThemedText style={stylesThemed.muted}>Oldest</ThemedText>
              <ThemedText style={stylesThemed.muted}>Newest</ThemedText>
            </View>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <View style={stylesThemed.headerRow}>
            <ThemedText type="subtitle">Past sessions</ThemedText>
            <TouchableOpacity style={stylesThemed.button} onPress={() => void refresh()} activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonText}>{loading ? 'Refreshing...' : 'Refresh'}</ThemedText>
            </TouchableOpacity>
          </View>
          {error ? <ThemedText style={stylesThemed.errorText}>Could not load history: {error}</ThemedText> : null}

          <ThemedView style={stylesThemed.cards}>
            {sessions.map(s => (
              <ThemedView key={s.session_id} style={stylesThemed.card}>
                <ThemedText type="defaultSemiBold">{formatDateLabel(s.started_at)}</ThemedText>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Duration</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{Math.round(s.duration_sec / 60)} min</ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Avg FPA</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.avg_fpa_deg.toFixed(1)}°</ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Variability</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.variability_deg.toFixed(1)}°</ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Range</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>
                    {s.min_fpa_deg.toFixed(1)}° - {s.max_fpa_deg.toFixed(1)}°
                  </ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Steps</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.step_count.toLocaleString()}</ThemedText>
                </View>
                <TouchableOpacity
                  style={[stylesThemed.buttonDelete, deletingSessionId === s.session_id && stylesThemed.buttonDisabled]}
                  disabled={deletingSessionId != null}
                  onPress={() => void onDeleteSession(s.session_id)}
                  activeOpacity={0.75}>
                  <ThemedText style={stylesThemed.buttonDeleteText}>
                    {deletingSessionId === s.session_id ? 'Deleting...' : 'Delete'}
                  </ThemedText>
                </TouchableOpacity>
              </ThemedView>
            ))}
            {!loading && sessions.length === 0 ? (
              <ThemedText style={stylesThemed.muted}>No session summaries found in DynamoDB yet.</ThemedText>
            ) : null}
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    overflow: 'hidden',
  },
  bar: {
    width: 8,
    borderRadius: 4,
    backgroundColor: '#2F7EF7',
  },
  emptyChartText: {
    fontSize: 13,
    color: '#6B7280',
  },
});

function createStyles(theme: (typeof Colors)['light']) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { gap: 16, paddingBottom: 10 },

    kpiRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    kpiCard: {
      flexGrow: 1,
      minWidth: 160,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 22,
      backgroundColor: theme.inputBackground,
      gap: 6,
    },
    kpiLabel: { fontSize: 13, color: theme.muted },
    kpiValue: { fontSize: 28, lineHeight: 40, fontWeight: '800', color: theme.text, paddingVertical: 2 },

    section: { gap: 10 },
    headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
    chartCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      padding: 12,
      gap: 8,
    },
    chartLegendRow: { flexDirection: 'row', justifyContent: 'space-between' },

    cards: { gap: 10 },
    card: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      padding: 12,
      gap: 8,
    },
    cardRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
    cardStat: { fontSize: 13, color: theme.muted },
    cardValue: { fontSize: 13, color: theme.text, fontWeight: '600' },
    muted: { color: theme.muted, fontSize: 13 },
    button: {
      paddingHorizontal: 14,
      minHeight: 36,
      borderRadius: 10,
      backgroundColor: theme.buttonPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDelete: {
      marginTop: 4,
      paddingHorizontal: 14,
      minHeight: 36,
      borderRadius: 10,
      backgroundColor: theme.buttonDestructive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.55 },
    buttonText: { color: theme.buttonOnPrimary, fontWeight: '700', fontSize: 13 },
    buttonDeleteText: { color: theme.buttonOnPrimary, fontWeight: '700', fontSize: 13 },
    errorText: { color: theme.buttonDestructive, fontSize: 13 },
  });
}

