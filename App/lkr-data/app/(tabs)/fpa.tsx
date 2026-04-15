import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { BleManager, Device } from 'react-native-ble-plx';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWearableHapticsWriter } from '@/hooks/use-wearable-haptics-writer';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { useWearableFpaPipeline } from '@/hooks/use-wearable-fpa-pipeline';
import { getStoredBaseFpaDeg, setStoredBaseFpaDeg } from '@/lib/wearable/fpaRunCounter';
import {
  assignReceiverAndSenderDevices,
  connectNordicDevices,
  DEVICE_NAME_PREFIX,
  findNordicDevices,
  labelDevice,
} from '@/lib/wearable';

const CALIBRATION_DURATION_SEC = 30;
const CALIBRATION_IGNORE_INITIAL_STEPS = 7;

export default function FpaScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);

  const [status, setStatus] = useState<'idle' | 'scanning' | 'connected' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [receiverLabel, setReceiverLabel] = useState<string>('—');
  const [senderLabel, setSenderLabel] = useState<string>('—');
  const [connectedCount, setConnectedCount] = useState<number>(0);
  const [hapticPayload, setHapticPayload] = useState<string>('a');
  const [hapticStatus, setHapticStatus] = useState<string>('');
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationSecondsLeft, setCalibrationSecondsLeft] = useState<number>(0);
  const [calibrationStatus, setCalibrationStatus] = useState<string>('');
  const [baseFpaDeg, setBaseFpaDeg] = useState<number | null>(null);

  const managerRef = useRef<BleManager | null>(null);
  const connectedRef = useRef<Device[]>([]);
  const calibrationValuesRef = useRef<number[]>([]);
  const calibrationSeenStepsRef = useRef<Set<number>>(new Set());
  const calibrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { latest, start: startPipeline, stop: stopPipeline, reset: resetPipeline } =
    useWearableFpaPipeline({ datarate: 180, isRightFoot: true });
  const { configureSender, send: sendHaptic, reset: resetHapticsWriter } = useWearableHapticsWriter();

  const stopScan = () => {
    managerRef.current?.stopDeviceScan();
  };

  const clearCalibrationTimers = () => {
    if (calibrationTimeoutRef.current) {
      clearTimeout(calibrationTimeoutRef.current);
      calibrationTimeoutRef.current = null;
    }
    if (calibrationIntervalRef.current) {
      clearInterval(calibrationIntervalRef.current);
      calibrationIntervalRef.current = null;
    }
  };

  const finishCalibration = async () => {
    clearCalibrationTimers();
    setIsCalibrating(false);
    setCalibrationSecondsLeft(0);

    const values = calibrationValuesRef.current;
    if (values.length === 0) {
      setCalibrationStatus('Calibration complete, but no FPA values were collected.');
      return;
    }

    const avgFpa = values.reduce((sum, value) => sum + value, 0) / values.length;
    await setStoredBaseFpaDeg(avgFpa);
    setBaseFpaDeg(avgFpa);
    setCalibrationStatus(
      `Calibration complete. Base FPA = ${avgFpa.toFixed(2)}° (${values.length} steps).`,
    );
  };

  const startCalibration = () => {
    if (isCalibrating) return;
    if (connectedRef.current.length === 0) {
      setCalibrationStatus('Connect to a device before calibrating.');
      return;
    }

    calibrationValuesRef.current = [];
    calibrationSeenStepsRef.current = new Set();
    setCalibrationStatus('Calibrating for 30 seconds. Walk naturally.');
    setIsCalibrating(true);
    setCalibrationSecondsLeft(CALIBRATION_DURATION_SEC);

    clearCalibrationTimers();
    calibrationIntervalRef.current = setInterval(() => {
      setCalibrationSecondsLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    calibrationTimeoutRef.current = setTimeout(() => {
      void finishCalibration();
    }, CALIBRATION_DURATION_SEC * 1000);
  };

  const disconnect = async () => {
    stopPipeline();
    resetHapticsWriter();
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
    setReceiverLabel('—');
    setSenderLabel('—');
    setHapticStatus('');
  };

  const connectAndStart = async (devices: Device[]) => {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      stopScan();
      const sorted = [...devices].sort((a, b) => a.id.localeCompare(b.id));
      const pair = sorted.slice(0, 2);
      const connected = await connectNordicDevices(manager, pair);
      if (connected.length === 0) {
        throw new Error('Found matching devices, but could not connect to any of them.');
      }

      const { receiver, sender } = assignReceiverAndSenderDevices(connected);

      connectedRef.current = connected.map(item => item.device);
      setConnectedCount(connected.length);
      setReceiverLabel(labelDevice(receiver.device));
      setSenderLabel(sender ? labelDevice(sender.device) : '— (second device: haptics over UART TX)');
      setStatus('connected');
      setError('');

      resetPipeline();
      resetHapticsWriter();
      configureSender(sender?.device ?? null);
      await startPipeline(receiver.device);
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
        setReceiverLabel('—');
        setSenderLabel('—');
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

  const onSendHaptic = () => {
    const manager = managerRef.current;
    if (!manager) return;
    void (async () => {
      try {
        await sendHaptic(manager, hapticPayload);
        setHapticStatus(`Sent: ${JSON.stringify(hapticPayload)}`);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setHapticStatus(`Send error: ${msg}`);
      }
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
      clearCalibrationTimers();
      void disconnect();
      manager.destroy();
      managerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void (async () => {
      const storedBaseFpa = await getStoredBaseFpaDeg();
      setBaseFpaDeg(storedBaseFpa);
    })();
  }, []);

  useEffect(() => {
    if (!isCalibrating || !latest?.inFeedbackWindow) return;
    if (latest.stepCount <= CALIBRATION_IGNORE_INITIAL_STEPS) return;
    if (calibrationSeenStepsRef.current.has(latest.stepCount)) return;

    calibrationSeenStepsRef.current.add(latest.stepCount);
    calibrationValuesRef.current.push(latest.fpaThisStepDeg);
  }, [isCalibrating, latest]);

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
          (no cloud). With two peripherals, the lower BLE id is the FPA (RX) unit; the other is the
          haptics (TX) unit.
        </ThemedText>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Connection</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Status: {status}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Connected devices: {connectedCount}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>FPA / stream (RX): {receiverLabel}</ThemedText>
          <ThemedText style={stylesThemed.resultText}>Haptics (TX): {senderLabel}</ThemedText>
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
          <TouchableOpacity
            style={[stylesThemed.button, isCalibrating && stylesThemed.buttonDisabled]}
            onPress={startCalibration}
            disabled={isCalibrating}
            activeOpacity={0.7}>
            <ThemedText style={stylesThemed.buttonText}>
              {isCalibrating ? `Calibrating (${calibrationSecondsLeft}s)` : 'Calibrate'}
            </ThemedText>
          </TouchableOpacity>
        </View>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Haptics (sender device)</ThemedText>
          <ThemedText style={stylesThemed.muted}>
            Writes Nordic UART TX (same as BLE console). MCU uses byte 0x61 / 0x62 — send &quot;a&quot;
            or &quot;b&quot;, or any payload your firmware expects.
          </ThemedText>
          <TextInput
            value={hapticPayload}
            onChangeText={setHapticPayload}
            placeholder="Payload (e.g. a or b)"
            placeholderTextColor={theme.placeholder}
            style={stylesThemed.input}
            autoCapitalize="none"
          />
          <View style={stylesThemed.buttonRow}>
            <TouchableOpacity style={stylesThemed.button} onPress={onSendHaptic} activeOpacity={0.7}>
              <ThemedText style={stylesThemed.buttonText}>Send vibration</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={stylesThemed.button}
              onPress={() => {
                setHapticPayload('a');
                const manager = managerRef.current;
                if (!manager) return;
                void (async () => {
                  try {
                    await sendHaptic(manager, 'a');
                    setHapticStatus('Sent pattern: "a" (0x61)');
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setHapticStatus(`Send error: ${msg}`);
                  }
                })();
              }}
              activeOpacity={0.7}>
              <ThemedText style={stylesThemed.buttonText}>Pattern A</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={stylesThemed.button}
              onPress={() => {
                setHapticPayload('b');
                const manager = managerRef.current;
                if (!manager) return;
                void (async () => {
                  try {
                    await sendHaptic(manager, 'b');
                    setHapticStatus('Sent pattern: "b" (0x62)');
                  } catch (e: unknown) {
                    const msg = e instanceof Error ? e.message : String(e);
                    setHapticStatus(`Send error: ${msg}`);
                  }
                })();
              }}
              activeOpacity={0.7}>
              <ThemedText style={stylesThemed.buttonText}>Pattern B</ThemedText>
            </TouchableOpacity>
          </View>
          {hapticStatus ? (
            <ThemedText style={stylesThemed.resultText}>{hapticStatus}</ThemedText>
          ) : null}
        </ThemedView>

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Live gait / FPA</ThemedText>
          <ThemedText style={stylesThemed.resultText}>
            Global run #: {latest?.globalRunNumber ?? '—'}
          </ThemedText>
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
          <ThemedText style={stylesThemed.resultText}>
            Base FPA (calibrated): {baseFpaDeg != null ? `${baseFpaDeg.toFixed(2)}°` : '—'}
          </ThemedText>
          {calibrationStatus ? (
            <ThemedText style={stylesThemed.resultText}>{calibrationStatus}</ThemedText>
          ) : null}
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
    input: {
      borderRadius: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 16,
      minHeight: 44,
      color: theme.text,
      backgroundColor: theme.inputBackground,
    },
  });
}
