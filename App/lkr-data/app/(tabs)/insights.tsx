import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';

type Habit = {
  id: string;
  title: string;
  description: string;
  streakDays: number;
  isOn: boolean;
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function scoreLabel(score0to100: number) {
  if (score0to100 >= 80) return 'Strong';
  if (score0to100 >= 60) return 'Good';
  if (score0to100 >= 40) return 'Building';
  return 'Getting started';
}

export default function InsightsScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  // Mock “current stats”
  const avgFpa30 = 6.5;
  const variability30 = 1.4;
  const sessionsPerWeek = 4.2;
  const adherencePct = 68;

  const [habits, setHabits] = useState<Habit[]>([
    {
      id: 'h1',
      title: 'Daily check-in',
      description: 'Open the app and review today’s FPA trend.',
      streakDays: 6,
      isOn: true,
    },
    {
      id: 'h2',
      title: '3 sessions / week',
      description: 'Record at least three walking sessions weekly.',
      streakDays: 2,
      isOn: true,
    },
    {
      id: 'h3',
      title: 'Cooldown note',
      description: 'After sessions, jot a 10-second note about how it felt.',
      streakDays: 0,
      isOn: false,
    },
  ]);

  const habitScore = useMemo(() => {
    const onCount = habits.filter(h => h.isOn).length;
    const streakSum = habits.reduce((a, b) => a + b.streakDays, 0);
    const score = onCount * 18 + clamp(streakSum, 0, 30) * 1.6;
    return clamp(Math.round(score), 0, 100);
  }, [habits]);

  const recommendations = useMemo(() => {
    const recs: string[] = [];

    if (variability30 > 1.5) {
      recs.push('Your FPA is a bit variable—try shorter sessions focused on consistency, then build duration.');
    } else {
      recs.push('Consistency looks solid—consider gradually increasing session duration to reinforce the pattern.');
    }

    if (sessionsPerWeek < 3) {
      recs.push('Aim for at least 3 sessions per week; regular repetition usually improves carryover day-to-day.');
    } else {
      recs.push('You’re hitting a good weekly cadence—keep it steady rather than adding more volume quickly.');
    }

    if (adherencePct < 70) {
      recs.push('Set a simple reminder (same time each day) to boost adherence—small consistency beats perfect sessions.');
    } else {
      recs.push('Adherence is trending well—next step is refining technique with one focused cue per session.');
    }

    return recs.slice(0, 3);
  }, [adherencePct, sessionsPerWeek, variability30]);

  const toggleHabit = (id: string) => {
    setHabits(prev => prev.map(h => (h.id === id ? { ...h, isOn: !h.isOn } : h)));
  };

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView contentContainerStyle={[stylesThemed.content, scrollContentStyle]} keyboardShouldPersistTaps="handled">
        <ThemedText type="title">Insights</ThemedText>

        <ThemedView style={stylesThemed.summaryRow}>
          <ThemedView style={stylesThemed.summaryCard}>
            <ThemedText style={stylesThemed.summaryLabel}>Habit score</ThemedText>
            <ThemedText style={stylesThemed.summaryValue}>{habitScore}</ThemedText>
            <ThemedText style={stylesThemed.muted}>{scoreLabel(habitScore)}</ThemedText>
          </ThemedView>
          <ThemedView style={stylesThemed.summaryCard}>
            <ThemedText style={stylesThemed.summaryLabel}>30-day stats</ThemedText>
            <ThemedText style={stylesThemed.summaryStat}>Avg FPA: {avgFpa30.toFixed(1)}°</ThemedText>
            <ThemedText style={stylesThemed.summaryStat}>Variability: {variability30.toFixed(1)}°</ThemedText>
            <ThemedText style={stylesThemed.summaryStat}>Adherence: {adherencePct}%</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Habit tracking</ThemedText>
          <ThemedText style={stylesThemed.muted}>Mock toggles (stateful UI only).</ThemedText>

          <ThemedView style={stylesThemed.cards}>
            {habits.map(h => (
              <TouchableOpacity
                key={h.id}
                onPress={() => toggleHabit(h.id)}
                activeOpacity={0.75}
                style={[
                  stylesThemed.habitCard,
                  h.isOn ? stylesThemed.habitCardOn : stylesThemed.habitCardOff,
                ]}>
                <View style={stylesThemed.habitHeader}>
                  <ThemedText type="defaultSemiBold">{h.title}</ThemedText>
                  <View style={[stylesThemed.pill, h.isOn ? stylesThemed.pillOn : stylesThemed.pillOff]}>
                    <ThemedText style={stylesThemed.pillText}>{h.isOn ? 'On' : 'Off'}</ThemedText>
                  </View>
                </View>
                <ThemedText style={stylesThemed.muted}>{h.description}</ThemedText>
                <ThemedText style={stylesThemed.habitMeta}>Streak: {h.streakDays} day(s)</ThemedText>
              </TouchableOpacity>
            ))}
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Recommendations</ThemedText>
          <ThemedView style={stylesThemed.recsCard}>
            {recommendations.map((r, idx) => (
              <View key={`${idx}-${r}`} style={stylesThemed.recRow}>
                <ThemedView style={stylesThemed.recDot} />
                <ThemedText style={stylesThemed.recText}>{r}</ThemedText>
              </View>
            ))}
          </ThemedView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

function createStyles(theme: (typeof Colors)['light']) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { gap: 16, paddingBottom: 10 },

    summaryRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    summaryCard: {
      flexGrow: 1,
      minWidth: 160,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      paddingHorizontal: 14,
      paddingVertical: 22,
      gap: 6,
    },
    summaryLabel: { fontSize: 13, color: theme.muted },
    summaryValue: { fontSize: 36, lineHeight: 48, fontWeight: '900', color: theme.text, paddingVertical: 2 },
    summaryStat: { fontSize: 13, color: theme.text, fontWeight: '600' },

    section: { gap: 10 },
    cards: { gap: 10 },

    habitCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      padding: 12,
      gap: 8,
    },
    habitCardOn: { borderColor: theme.buttonPrimary, borderWidth: 0, backgroundColor: theme.surfaceSelected },
    habitCardOff: { borderColor: theme.border, backgroundColor: theme.inputBackground },
    habitHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: StyleSheet.hairlineWidth },
    pillOn: { borderColor: theme.buttonPrimary, borderWidth: 0, backgroundColor: theme.surfaceSelected },
    pillOff: { borderColor: theme.border, backgroundColor: theme.inputBackground },
    pillText: { fontSize: 12, fontWeight: '800', color: theme.text },
    habitMeta: { fontSize: 12, color: theme.muted },

    recsCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      padding: 12,
      gap: 10,
    },
    recRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: 'transparent' },
    recDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      marginTop: 6,
      backgroundColor: theme.buttonPrimary,
    },
    recText: { flex: 1, fontSize: 14, color: theme.text },
    muted: { color: theme.muted, fontSize: 13 },
  });
}

