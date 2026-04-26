import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
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
const FEEDBACK_EFFECT = 52;
const FEEDBACK_TOE_IN_THRESHOLD_DEG = -12;
const FEEDBACK_TOE_OUT_THRESHOLD_DEG = -8;

function getAutoFeedbackCommand(diffDeg: number): string {
  // Match Bluetooth/vqf_processor.py lra_feedback() thresholds and command mapping.
  if (diffDeg < FEEDBACK_TOE_IN_THRESHOLD_DEG) return `2${FEEDBACK_EFFECT}`;
  if (diffDeg > FEEDBACK_TOE_OUT_THRESHOLD_DEG) return `1${FEEDBACK_EFFECT}`;
  return '';
}

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
  const [hapticStatus, setHapticStatus] = useState<string>('');
  const [csvStatus, setCsvStatus] = useState<string>('');
  const [isCalibrating, setIsCalibrating] = useState<boolean>(false);
  const [calibrationSecondsLeft, setCalibrationSecondsLeft] = useState<number>(0);
  const [calibrationStatus, setCalibrationStatus] = useState<string>('');
  const [baseFpaDeg, setBaseFpaDeg] = useState<number | null>(null);

  const managerRef = useRef<BleManager | null>(null);
  const connectedRef = useRef<Device[]>([]);
  const calibrationValuesRef = useRef<number[]>([]);
  const calibrationSeenStepsRef = useRef<Set<number>>(new Set());
  const feedbackSeenStepsRef = useRef<Set<number>>(new Set());
  const calibrationTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const calibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const csvRowsRef = useRef<string[]>([]);

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
    feedbackSeenStepsRef.current = new Set();
  };

  const connectAndStart = async (devices: Device[]) => {
    const manager = managerRef.current;
    if (!manager) return;
    try {
      stopScan();
      // 1) Broadly scan and attempt connection to all CIRCUITPY matches first.
      const connected = await connectNordicDevices(manager, devices);
      if (connected.length === 0) {
        throw new Error('Found matching devices, but could not connect to any of them.');
      }

      // 2) Identify RX (IMU) vs TX (LRA) roles from known names when present.
      const { receiver, sender } = assignReceiverAndSenderDevices(connected);
      if (!sender) {
        throw new Error(
          'Found only one CIRCUITPY device. Need both IMU (RX) and LRA (TX) devices to run dual pipelines.',
        );
      }

      connectedRef.current = connected.map(item => item.device);
      setConnectedCount(connected.length);
      setReceiverLabel(labelDevice(receiver.device));
      setSenderLabel(labelDevice(sender.device));
      setStatus('connected');
      setError('');
      setCsvStatus('');

      // 3) Differentiate pipelines:
      //    - RX device -> FPA stream/analysis pipeline.
      //    - TX device -> haptics command pipeline (write-only).
      resetPipeline();
      resetHapticsWriter();
      feedbackSeenStepsRef.current = new Set();
      csvRowsRef.current = [];
      configureSender(sender.device);
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

  const appendCsvRow = useCallback((args: {
    step: number;
    fpaDeg: number;
    diffDeg: number | null;
    drv: string;
    effect: string;
    sentCommand: string;
  }) => {
    if (!latest) return;
    const now = new Date().toISOString();
    const sd = latest.sensorData;
    csvRowsRef.current.push(
      [
        now,
        String(args.step),
        latest.rateHz.toFixed(2),
        args.fpaDeg.toFixed(2),
        args.diffDeg == null ? '' : args.diffDeg.toFixed(2),
        args.drv,
        args.effect,
        args.sentCommand,
        sd.AccelX.toFixed(4),
        sd.AccelY.toFixed(4),
        sd.AccelZ.toFixed(4),
        sd.GyroX.toFixed(4),
        sd.GyroY.toFixed(4),
        sd.GyroZ.toFixed(4),
      ].join(','),
    );
  }, [latest]);

  const exportCsv = async () => {
    try {
      if (csvRowsRef.current.length === 0) {
        setCsvStatus('No rows to export yet. Walk a few steps first.');
        return;
      }
      const header = [
        'time_iso',
        'step_num',
        'rate_hz',
        'fpa_deg',
        'fpa_minus_base_deg',
        'drv',
        'effect',
        'sent_cmd',
        'ax_m_s2',
        'ay_m_s2',
        'az_m_s2',
        'gx_deg_s',
        'gy_deg_s',
        'gz_deg_s',
      ].join(',');
      const csv = `${header}\n${csvRowsRef.current.join('\n')}\n`;
      const filename = `fpa_log_${Date.now()}.csv`;
      const targetDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!targetDir) {
        throw new Error('No writable app directory is available.');
      }
      const fileUri = `${targetDir}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      const result = await Share.share(
        {
          title: filename,
          url: fileUri,
          message: Platform.OS === 'android' ? fileUri : undefined,
        },
        Platform.OS === 'ios' ? { subject: 'FPA session CSV' } : undefined,
      );
      if (result?.action === Share.dismissedAction) {
        setCsvStatus('Export cancelled.');
      } else {
        setCsvStatus(
          `Saved and shared ${filename} (${csvRowsRef.current.length} rows).`,
        );
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCsvStatus(`Export failed: ${msg}`);
    }
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

  useEffect(() => {
    if (!latest?.inFeedbackWindow) return;
    if (feedbackSeenStepsRef.current.has(latest.stepCount)) return;
    feedbackSeenStepsRef.current.add(latest.stepCount);

    const manager = managerRef.current;
    if (!manager) return;

    const fpaDeg = latest.fpaThisStepDeg;
    const base = baseFpaDeg;
    const diff = base == null ? null : fpaDeg - base;
    let cmd = '';
    let drv = '';
    let effect = '';

    if (!isCalibrating && diff != null && connectedRef.current.length > 1) {
      cmd = getAutoFeedbackCommand(diff);
      if (cmd) {
        drv = cmd.startsWith('2') ? 'DRV2' : 'DRV1';
        effect = String(FEEDBACK_EFFECT);
      }
      if (cmd) {
        void (async () => {
          try {
            await sendHaptic(manager, cmd);
            setHapticStatus(`Auto feedback sent: ${cmd} (diff=${diff.toFixed(2)}°)`);
          } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            setHapticStatus(`Auto feedback error: ${msg}`);
          }
        })();
      }
    }

    appendCsvRow({
      step: latest.stepCount,
      fpaDeg,
      diffDeg: diff,
      drv,
      effect,
      sentCommand: cmd,
    });
  }, [latest, baseFpaDeg, isCalibrating, sendHaptic, appendCsvRow]);

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
          <TouchableOpacity style={stylesThemed.button} onPress={() => void exportCsv()} activeOpacity={0.7}>
            <ThemedText style={stylesThemed.buttonText}>Export CSV</ThemedText>
          </TouchableOpacity>
        </View>
        {csvStatus ? <ThemedText style={stylesThemed.resultText}>{csvStatus}</ThemedText> : null}

        <ThemedView style={stylesThemed.result}>
          <ThemedText type="subtitle">Haptics (sender device)</ThemedText>
          <ThemedText style={stylesThemed.muted}>
            Writes Nordic UART TX (same as BLE console). LRA firmware expects string commands like
            &quot;152&quot; or &quot;252&quot; (`drv + effect`). Commands are sent automatically from each
            detected FPA step using the same threshold logic as `Bluetooth/vqf_processor.py`.
          </ThemedText>
          <ThemedText style={stylesThemed.resultText}>
            Auto feedback is always enabled while connected and not calibrating.
          </ThemedText>
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
  });
}
