import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';

type SessionSummary = {
  id: string;
  startedAt: string;
  durationMin: number;
  avgFpa: number;
  variability: number;
  steps: number;
};

function MiniAreaBars({ data, height = 110 }: { data: number[]; height?: number }) {
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

function formatDelta(v: number) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}°`;
}

export default function HistoryScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const last30Days = useMemo(() => {
    const base = 6.3;
    const arr: number[] = [];
    for (let i = 0; i < 30; i++) {
      const weekly = Math.sin(i / 4.2) * 0.7;
      const trend = (i - 15) * 0.03;
      const jitter = (Math.sin(i * 1.9) + Math.cos(i * 0.6)) * 0.12;
      arr.push(base + weekly + trend + jitter);
    }
    return arr;
  }, []);

  const sessions: SessionSummary[] = useMemo(
    () => [
      { id: 's1', startedAt: 'Today, 4:12 PM', durationMin: 12, avgFpa: 6.8, variability: 1.1, steps: 1430 },
      { id: 's2', startedAt: 'Yesterday, 9:03 AM', durationMin: 18, avgFpa: 6.1, variability: 1.4, steps: 2145 },
      { id: 's3', startedAt: 'Mar 26, 7:41 PM', durationMin: 9, avgFpa: 7.4, variability: 1.7, steps: 990 },
    ],
    [],
  );

  const avg30 = useMemo(() => last30Days.reduce((a, b) => a + b, 0) / last30Days.length, [last30Days]);
  const deltaWeek = useMemo(() => {
    const last7 = last30Days.slice(-7);
    const prev7 = last30Days.slice(-14, -7);
    const a = last7.reduce((x, y) => x + y, 0) / last7.length;
    const b = prev7.reduce((x, y) => x + y, 0) / prev7.length;
    return a - b;
  }, [last30Days]);

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView contentContainerStyle={[stylesThemed.content, scrollContentStyle]} keyboardShouldPersistTaps="handled">
        <ThemedText type="title">History</ThemedText>

        <ThemedView style={stylesThemed.kpiRow}>
          <ThemedView style={stylesThemed.kpiCard}>
            <ThemedText style={stylesThemed.kpiLabel}>30-day avg FPA</ThemedText>
            <ThemedText style={stylesThemed.kpiValue}>{avg30.toFixed(1)}°</ThemedText>
          </ThemedView>
          <ThemedView style={stylesThemed.kpiCard}>
            <ThemedText style={stylesThemed.kpiLabel}>Week-over-week</ThemedText>
            <ThemedText style={stylesThemed.kpiValue}>{formatDelta(deltaWeek)}</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">FPA over last 30 days</ThemedText>
          <ThemedView style={stylesThemed.chartCard}>
            <MiniAreaBars data={last30Days} height={120} />
            <View style={stylesThemed.chartLegendRow}>
              <ThemedText style={stylesThemed.muted}>30d ago</ThemedText>
              <ThemedText style={stylesThemed.muted}>Today</ThemedText>
            </View>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Past sessions</ThemedText>
          <ThemedText style={stylesThemed.muted}>
            Mock cards showing previous “active session” summaries.
          </ThemedText>

          <ThemedView style={stylesThemed.cards}>
            {sessions.map(s => (
              <ThemedView key={s.id} style={stylesThemed.card}>
                <ThemedText type="defaultSemiBold">{s.startedAt}</ThemedText>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Duration</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.durationMin} min</ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Avg FPA</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.avgFpa.toFixed(1)}°</ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Variability</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.variability.toFixed(1)}°</ThemedText>
                </View>
                <View style={stylesThemed.cardRow}>
                  <ThemedText style={stylesThemed.cardStat}>Steps</ThemedText>
                  <ThemedText style={stylesThemed.cardValue}>{s.steps.toLocaleString()}</ThemedText>
                </View>
              </ThemedView>
            ))}
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
  });
}

