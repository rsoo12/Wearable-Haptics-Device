import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';

type Point = { t: number; fpa: number };

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function formatMinutes(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function MiniBarChart({
  data,
  height = 84,
  barWidth = 6,
}: {
  data: number[];
  height?: number;
  barWidth?: number;
}) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.0001, max - min);

  return (
    <View style={[styles.chart, { height }]}>
      {data.map((v, i) => {
        const pct = (v - min) / range;
        const h = Math.max(2, Math.round(pct * (height - 10)));
        return (
          <View
            key={`${i}-${v}`}
            style={[
              styles.chartBar,
              {
                width: barWidth,
                height: h,
                opacity: 0.35 + 0.65 * clamp(pct, 0, 1),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

export default function ActiveSessionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const [isRunning, setIsRunning] = useState(false);

  const sessionSeconds = 12 * 60 + 34;

  const series: Point[] = useMemo(() => {
    // Session chart sample curve.
    const base = 6.8;
    const points: Point[] = [];
    for (let i = 0; i < 64; i++) {
      const t = i;
      const drift = Math.sin(i / 8) * 0.9;
      const wobble = Math.sin(i / 2.5) * 0.35;
      const noise = (Math.sin(i * 1.7) + Math.cos(i * 0.9)) * 0.12;
      points.push({ t, fpa: base + drift + wobble + noise });
    }
    return points;
  }, []);

  const currentFpa = useMemo(() => series[series.length - 1]?.fpa ?? 0, [series]);
  const chartData = useMemo(() => series.map(p => p.fpa), [series]);
  const avgFpa = useMemo(() => chartData.reduce((a, b) => a + b, 0) / Math.max(1, chartData.length), [chartData]);

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView contentContainerStyle={[stylesThemed.content, scrollContentStyle]} keyboardShouldPersistTaps="handled">
        <ThemedView style={stylesThemed.headerRow}>
          <ThemedText type="title">Active Session</ThemedText>
          <ThemedView style={[stylesThemed.badge, isRunning ? stylesThemed.badgeOn : stylesThemed.badgeOff]}>
            <ThemedText style={stylesThemed.badgeText}>{isRunning ? 'Recording' : 'Paused'}</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.kpiCard}>
          <ThemedText style={stylesThemed.kpiLabel}>Current FPA</ThemedText>
          <ThemedText style={stylesThemed.kpiValue}>{currentFpa.toFixed(1)}°</ThemedText>
          <View style={stylesThemed.kpiMetaRow}>
            <ThemedText style={stylesThemed.kpiMeta}>Session: {formatMinutes(sessionSeconds)}</ThemedText>
            <ThemedText style={stylesThemed.kpiMeta}>Avg: {avgFpa.toFixed(1)}°</ThemedText>
          </View>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">FPA over current session</ThemedText>
          <ThemedView style={stylesThemed.chartCard}>
            <MiniBarChart data={chartData} height={96} barWidth={6} />
            <View style={stylesThemed.chartLegendRow}>
              <ThemedText style={stylesThemed.muted}>Start</ThemedText>
              <ThemedText style={stylesThemed.muted}>Now</ThemedText>
            </View>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Controls</ThemedText>
          <ThemedView style={stylesThemed.row}>
            <TouchableOpacity
              style={[stylesThemed.button, isRunning && stylesThemed.buttonDisabled]}
              disabled={isRunning}
              onPress={() => setIsRunning(true)}
              activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonText}>Start</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[stylesThemed.buttonSecondary, !isRunning && stylesThemed.buttonDisabled]}
              disabled={!isRunning}
              onPress={() => setIsRunning(false)}
              activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonTextSecondary}>Stop</ThemedText>
            </TouchableOpacity>
          </ThemedView>
          <ThemedText style={stylesThemed.muted}>Buttons control this screen state.</ThemedText>
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
  chartBar: {
    borderRadius: 4,
    backgroundColor: '#2F7EF7',
  },
});

function createStyles(theme: (typeof Colors)['light']) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { gap: 16, paddingBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badgeOn: { backgroundColor: theme.surfaceSelected, borderColor: theme.buttonPrimary },
    badgeOff: { backgroundColor: theme.inputBackground, borderColor: theme.border },
    badgeText: { fontSize: 12, fontWeight: '700', color: theme.text },

    kpiCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 18,
      gap: 6,
      backgroundColor: theme.inputBackground,
    },
    kpiLabel: { fontSize: 13, color: theme.muted },
    kpiValue: { fontSize: 44, lineHeight: 54, fontWeight: '800', color: theme.text },
    kpiMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    kpiMeta: { fontSize: 12, color: theme.muted },

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
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },

    button: {
      paddingHorizontal: 20,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSecondary: {
      paddingHorizontal: 20,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.55 },
    buttonText: { color: theme.buttonOnPrimary, fontWeight: '700', fontSize: 16 },
    buttonTextSecondary: { color: theme.text, fontWeight: '700', fontSize: 16 },
    muted: { color: theme.muted, fontSize: 13 },
  });
}

