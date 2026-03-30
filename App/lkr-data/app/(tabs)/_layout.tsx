import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}>
      <Tabs.Screen
        name="active-session"
        options={{
          title: 'Active Session',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="figure.walk" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="clock.arrow.circlepath" color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ color }) => <IconSymbol size={28} name="chart.bar.xaxis" color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bluetooth',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="dot.radiowaves.left.and.right" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="backend"
        options={{
          title: 'Backend',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="cloud" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
