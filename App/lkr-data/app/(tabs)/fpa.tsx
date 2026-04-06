import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { BleManager, Device, Service } from 'react-native-ble-plx';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { useWearableFpaPipeline } from '@/hooks/use-wearable-fpa-pipeline';

const DEVICE_NAME_PREFIX = 'CIRCUITPY';
const CHAR_UUID_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export default function FpaScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [deviceLabel, setDeviceLabel] = useState<string>('Not connected');

  const managerRef = useRef<BleManager | null>(null);
  const connectedRef = useRef<Device | null>(null);

  const { latest, start: startPipeline, stop: stopPipeline, reset: resetPipeline } =
    useWearableFpaPipeline({ datarate: 180, isRightFoot: true });

  const stopScan = () => {
    managerRef.current?.stopDeviceScan();
  };

  const disconnect = async () => {
    stopPipeline();
    stopScan();
    const manager = managerRef.current;
    const connected = connectedRef.current;
    if (manager && connected) {
      try {
        await manager.cancelDeviceConnection(connected.id);
      } catch {
        // non-fatal during teardown
      }
    }
    connectedRef.current = null;
    setDeviceLabel('Not connected');
  };

  const connectAndStart = async (device: Device) => {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      stopScan();
      const connected = await manager.connectToDevice(device.id, { timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();
      const services: Service[] = await connected.services();
      let rxServiceUUID = '';
      for (const service of services) {
        const characteristics = await service.characteristics();
        const hasRx = characteristics.some(char => char.uuid.toLowerCase() === CHAR_UUID_RX);
        if (hasRx) {
          rxServiceUUID = service.uuid;
          break;
        }
      }
      if (!rxServiceUUID) {
        throw new Error(`Could not find RX characteristic ${CHAR_UUID_RX} on connected device.`);
      }
      connectedRef.current = connected;
      setDeviceLabel(`${connected.name ?? 'Unnamed'} (${connected.id})`);
      setStatus('connected');
      setError('');

      resetPipeline();
      startPipeline(connected);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
    }
  };

  const startAutoScan = () => {
    const manager = managerRef.current;
    if (!manager) return;
    setStatus('scanning');
    setError('');

    stopScan();
    manager.startDeviceScan(null, null, (scanError, device) => {
      if (scanError) {
        setError(scanError.message);
        setStatus('error');
        stopScan();
        return;
      }
      if (!device?.name) return;
      if (!device.name.startsWith(DEVICE_NAME_PREFIX)) return;
      void connectAndStart(device);
    });
  };

  const onRescan = () => {
    void (async () => {
      await disconnect();
      startAutoScan();
    })();
  };

  const onDisconnectPress = () => {
    void (async () => {
      await disconnect();
      resetPipeline();
      setStatus('idle');
    })();
  };

  const canDisconnect = status === 'scanning' || connectedRef.current != null;

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      setError('Bluetooth is only available on a physical iOS or Android device.');
      setStatus('error');
      return;
    }
    const manager = new BleManager();
    managerRef.current = manager;
    startAutoScan();

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
