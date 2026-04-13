import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { useWearableFpaPipeline } from '@/hooks/use-wearable-fpa-pipeline';
import { connectNordicDevices, DEVICE_NAME_PREFIX, findNordicDevices } from '@/lib/wearable';

export default function FpaScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [deviceLabel, setDeviceLabel] = useState<string>('Not connected');
  const [connectedCount, setConnectedCount] = useState<number>(0);

  const managerRef = useRef<BleManager | null>(null);
  const connectedRef = useRef<Device[]>([]);

  const { latest, start: startPipeline, stop: stopPipeline, reset: resetPipeline } =
    useWearableFpaPipeline({ datarate: 180, isRightFoot: true });

  const stopScan = () => {
    managerRef.current?.stopDeviceScan();
  };

  const disconnect = async () => {
    stopPipeline();
    stopScan();
    const manager = managerRef.current;
    if (manager && connectedRef.current.length > 0) {
      const toClose = [...connectedRef.current];
      await Promise.allSettled(
        toClose.map(async connected => {
          try {
            await manager.cancelDeviceConnection(connected.id);
          } catch {
            // non-fatal during teardown
          }
        }),
      );
    }
    connectedRef.current = [];
    setConnectedCount(0);
    setDeviceLabel('Not connected');
  };

  const connectAndStart = async (devices: Device[]) => {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      stopScan();
      const connected = await connectNordicDevices(manager, devices);
      if (connected.length === 0) {
        throw new Error('Found matching devices, but could not connect to any of them.');
      }

      connectedRef.current = connected.map(item => item.device);
      setConnectedCount(connected.length);
      setDeviceLabel(
        connected.map(item => `${item.device.name ?? 'Unnamed'} (${item.device.id})`).join(', '),
      );
      setStatus('connected');
      setError('');

      resetPipeline();
      connected.forEach(item => {
        startPipeline(item.device);
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
    }
  };

  const startAutoScan = async () => {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      setStatus('scanning');
      setError('');
      stopScan();

      const matches = await findNordicDevices(manager, {
        namePrefix: DEVICE_NAME_PREFIX,
        scanMs: 5000,
      });
      if (matches.length === 0) {
        setConnectedCount(0);
        setDeviceLabel('Not connected');
        setError(`No BLE devices found with name prefix "${DEVICE_NAME_PREFIX}".`);
        setStatus('error');
        return;
      }

      await connectAndStart(matches);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
    }
  };

  const onRescan = () => {
    void (async () => {
      await disconnect();
      await startAutoScan();
    })();
  };

  const onDisconnectPress = () => {
    void (async () => {
      await disconnect();
      resetPipeline();
      setStatus('idle');
    })();
  };

  const canDisconnect = status === 'scanning' || connectedRef.current.length > 0;

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      setError('Bluetooth is only available on a physical iOS or Android device.');
      setStatus('error');
      return;
    }
    const manager = new BleManager();
    managerRef.current = manager;
    void startAutoScan();

    return () => {
      void disconnect();
      manager.destroy();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const feedbackLine = latest?.inFeedbackWindow
    ? `Feedback window: FPA ≈ ${latest.fpaThisStepDeg.toFixed(1)}°`
    : 'Outside feedback window (middle → late stance triggers haptics context).';

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView
        contentContainerStyle={[stylesThemed.content, scrollContentStyle]}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={stylesThemed.title}>
          FPA
        </ThemedText>

        <ThemedText style={stylesThemed.muted}>
          On-device step count and foot progression angle — same pipeline as Bluetooth/vqf_processor.py
          (no cloud).
        </ThemedText>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Connection</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Status: {status}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Connected devices: {connectedCount}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Device: {deviceLabel}</ThemedText>
        </ThemedView>

        <View style={stylesThemed.buttonRow}>
          <TouchableOpacity style={stylesThemed.button} onPress={onRescan} activeOpacity={0.7}>
            <ThemedText style={stylesThemed.buttonText}>Connect</ThemedText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[stylesThemed.buttonDanger, !canDisconnect && stylesThemed.buttonDisabled]}
            onPress={onDisconnectPress}
            disabled={!canDisconnect}
            activeOpacity={0.7}>
            <ThemedText style={stylesThemed.buttonDangerText}>Disconnect</ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Live gait / FPA</ThemedText>
          <ThemedText style={stylesThemed.resultText}>
            Step count: {latest?.stepCount ?? '—'}
          </ThemedText>
          <ThemedText style={stylesThemed.resultText}>
            FPA (this step):{' '}
            {latest != null ? `${latest.fpaThisStepDeg.toFixed(1)}°` : '—'}
          </ThemedText>
          <ThemedText style={stylesThemed.resultText}>
            Stream rate: {latest != null ? `${latest.rateHz.toFixed(1)} Hz` : '—'}
          </ThemedText>
          <ThemedText style={stylesThemed.resultText}>{feedbackLine}</ThemedText>
        </ThemedView>

        {error ? (
          <ThemedView style={stylesThemed.result}>
            <ThemedText type="subtitle">Error</ThemedText>
            <ThemedText style={stylesThemed.errorText}>{error}</ThemedText>
          </ThemedView>
        ) : null}
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
    buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
    button: {
      flexGrow: 1,
      flexBasis: '45%',
      paddingHorizontal: 16,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: { color: theme.buttonOnPrimary, fontWeight: '600', fontSize: 15 },
    buttonDanger: {
      flexGrow: 1,
      flexBasis: '45%',
      paddingHorizontal: 16,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonDestructive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDangerText: { color: theme.buttonOnPrimary, fontWeight: '600', fontSize: 15 },
    buttonDisabled: { opacity: 0.45 },
    result: { gap: 8, paddingTop: 10 },
    resultText: { fontSize: 15, color: theme.text },
    errorText: { fontSize: 13, color: theme.buttonDestructive },
  });
}
