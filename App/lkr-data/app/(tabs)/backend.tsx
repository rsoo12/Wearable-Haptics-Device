import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { BleManager, Device, Service, Subscription } from 'react-native-ble-plx';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { processBlePacket } from '@/lib/api';

const DEVICE_NAME_PREFIX = 'CIRCUITPY';
const CHAR_UUID_RX = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export default function BackendScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [deviceLabel, setDeviceLabel] = useState<string>('Not connected');
  const [step, setStep] = useState<number>(0);
  const [fpaDeg, setFpaDeg] = useState<number>(0);
  const [rateHz, setRateHz] = useState<number>(0);
  const [printMessage, setPrintMessage] = useState<string>('Waiting for feedback window...');

  const managerRef = useRef<BleManager | null>(null);
  const notifySubRef = useRef<Subscription | null>(null);
  const connectedRef = useRef<Device | null>(null);

  const packetQueueRef = useRef<{ payload: string; rate: number }[]>([]);
  const processingRef = useRef(false);
  const timestampsRef = useRef<number[]>([]);

  const appendTimestamp = () => {
    const now = Date.now() / 1000;
    const next = [...timestampsRef.current, now];
    if (next.length > 50) next.shift();
    timestampsRef.current = next;
    if (next.length < 2) return 0;
    const elapsed = next[next.length - 1] - next[0];
    if (elapsed <= 0) return 0;
    return (next.length - 1) / elapsed;
  };

  const stopScan = () => {
    managerRef.current?.stopDeviceScan();
  };

  const disconnect = async () => {
    notifySubRef.current?.remove();
    notifySubRef.current = null;
    stopScan();
    const manager = managerRef.current;
    const connected = connectedRef.current;
    if (manager && connected) {
      try {
        await manager.cancelDeviceConnection(connected.id);
      } catch {
        // no-op: disconnect errors are non-fatal during teardown
      }
    }
    connectedRef.current = null;
    setDeviceLabel('Not connected');
  };

  const drainQueue = async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    try {
      while (packetQueueRef.current.length > 0) {
        const next = packetQueueRef.current.shift();
        if (!next) break;
        const response = await processBlePacket(next.payload, next.rate);
        setStep(response.step);
        setFpaDeg(response.fpa_deg);
        setRateHz(response.rate_hz);
        if (response.print_message) {
          setPrintMessage(response.print_message);
        }
      }
    } catch (e: any) {
      setError(e?.message ?? String(e));
      setStatus('error');
    } finally {
      processingRef.current = false;
    }
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

      notifySubRef.current?.remove();
      notifySubRef.current = manager.monitorCharacteristicForDevice(
        connected.id,
        rxServiceUUID,
        CHAR_UUID_RX,
        (notifyError, characteristic) => {
          if (notifyError) {
            setError(notifyError.message);
            setStatus('error');
            return;
          }
          if (!characteristic?.value) return;
          const rate = appendTimestamp();
          packetQueueRef.current.push({ payload: characteristic.value, rate });
          void drainQueue();
        },
      );
    } catch (e: any) {
      setError(e?.message ?? String(e));
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

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView
        contentContainerStyle={[stylesThemed.content, scrollContentStyle]}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={stylesThemed.title}>
          Backend Pipeline
        </ThemedText>

        <ThemedText style={stylesThemed.muted}>
          Auto-scans for BLE devices and streams packets into AWS Lambda VQF processing.
        </ThemedText>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Connection</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Status: {status}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Device: {deviceLabel}</ThemedText>
        </ThemedView>

        <TouchableOpacity style={stylesThemed.button} onPress={startAutoScan} activeOpacity={0.7}>
          <ThemedText style={stylesThemed.buttonText}>Rescan & reconnect</ThemedText>
        </TouchableOpacity>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Live Output</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Step: {step}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>FPA: {fpaDeg.toFixed(1)} deg</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Rate: {rateHz.toFixed(1)} Hz</ThemedText>
          <ThemedText style={stylesThemed.resultText}>{printMessage}</ThemedText>
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
    button: {
      paddingHorizontal: 20,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonPrimary,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    buttonText: { color: theme.buttonOnPrimary, fontWeight: '600', fontSize: 16 },
    result: { gap: 8, paddingTop: 10 },
    resultText: { fontSize: 15, color: theme.text },
    errorText: { fontSize: 13, color: theme.buttonDestructive },
  });
}
