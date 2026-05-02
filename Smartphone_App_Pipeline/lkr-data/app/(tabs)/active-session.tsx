import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, Share, StyleSheet, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { BleManager, Device } from 'react-native-ble-plx';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useWearableFpaPipeline } from '@/hooks/use-wearable-fpa-pipeline';
import { useWearableHapticsWriter } from '@/hooks/use-wearable-haptics-writer';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';
import { createSessionSummary } from '@/lib/api';
import { getStoredBaseFpaDeg, setStoredBaseFpaDeg } from '@/lib/wearable/fpaRunCounter';
import {
  assignReceiverAndSenderDevices,
  connectNordicDevices,
  DEVICE_NAME_PREFIX,
  findNordicDevices,
} from '@/lib/wearable';

const CALIBRATION_DURATION_SEC = 60;
const CALIBRATION_IGNORE_INITIAL_STEPS = 7;
const FEEDBACK_EFFECT = 12;
const FEEDBACK_TOE_IN_THRESHOLD_DEG = -9;
const FEEDBACK_TOE_OUT_THRESHOLD_DEG = -1;
const CSV_HEADER = [
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

function formatMinutes(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function getAutoFeedbackCommand(diffDeg: number): string {
  if (diffDeg < FEEDBACK_TOE_IN_THRESHOLD_DEG) return `2${FEEDBACK_EFFECT}`;
  if (diffDeg > FEEDBACK_TOE_OUT_THRESHOLD_DEG) return `1${FEEDBACK_EFFECT}`;
  return '';
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function MiniBarChart({
  data,
  height = 84,
  barWidth = 6,
  baseLineDeg = null,
}: {
  data: number[];
  height?: number;
  barWidth?: number;
  baseLineDeg?: number | null;
}) {
  const chartScrollRef = useRef<ScrollView | null>(null);
  if (data.length === 0) {
    return (
      <View style={[styles.chart, { height }]}>
        <ThemedText style={styles.emptyChartText}>No FPA points yet</ThemedText>
      </View>
    );
  }
  const targetDeg =
    baseLineDeg == null ? null : baseLineDeg + (FEEDBACK_TOE_IN_THRESHOLD_DEG + FEEDBACK_TOE_OUT_THRESHOLD_DEG) / 2;
  const min = Math.min(...data, ...(targetDeg == null ? [] : [targetDeg]));
  const max = Math.max(...data, ...(targetDeg == null ? [] : [targetDeg]));
  const range = Math.max(0.0001, max - min);
  const chartPaddingY = 4;
  const chartInnerHeight = Math.max(8, height - chartPaddingY * 2);
  const chartWidth = Math.max(barWidth, data.length * barWidth);
  const targetPct = targetDeg == null ? null : clamp((targetDeg - min) / range, 0, 1);
  const targetLineTop =
    targetPct == null ? null : Math.max(0, chartPaddingY + chartInnerHeight - Math.round(targetPct * chartInnerHeight));
  const bars = data.map((value, index) => {
    const pct = clamp((value - min) / range, 0, 1);
    const x = index * barWidth;
    const y = Math.max(0, Math.min(height - 1, chartPaddingY + chartInnerHeight - pct * chartInnerHeight));
    const topAnchor = targetLineTop == null ? y : Math.min(y, targetLineTop);
    const barHeight = targetLineTop == null ? Math.max(2, height - y) : Math.max(2, Math.abs(y - targetLineTop));
    return { x, pct, topAnchor, barHeight };
  });

  return (
    <ScrollView
      horizontal
      ref={chartScrollRef}
      style={styles.chartScroll}
      showsHorizontalScrollIndicator={false}
      bounces={false}
      onContentSizeChange={() => chartScrollRef.current?.scrollToEnd({ animated: true })}>
      <View style={[styles.chart, { height, width: chartWidth }]}>
        {bars.map((bar, index) => (
          <View
            key={`bar-${index}`}
            pointerEvents="none"
            style={[
              styles.chartBar,
              {
                left: bar.x,
                top: bar.topAnchor,
                width: barWidth,
                height: bar.barHeight,
                opacity: 0.35 + 0.65 * bar.pct,
              },
            ]}
          />
        ))}
        {targetLineTop != null ? (
          <View
            pointerEvents="none"
            style={[
              styles.chartBaseLine,
              {
                top: targetLineTop,
              },
            ]}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

export default function ActiveSessionScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);
  const startedAtRef = useRef<number>(Date.now());

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
  const [elapsedSec, setElapsedSec] = useState<number>(0);
  const [isSessionRunning, setIsSessionRunning] = useState<boolean>(false);
  const [fpaSeries, setFpaSeries] = useState<number[]>([]);
  const [backendStatus, setBackendStatus] = useState<string>('');

  const managerRef = useRef<BleManager | null>(null);
  const connectedRef = useRef<Device[]>([]);
  const calibrationValuesRef = useRef<number[]>([]);
  const calibrationSeenStepsRef = useRef<Set<number>>(new Set());
  const lastCalibrationFpaUpdateCountRef = useRef<number>(0);
  const lastFeedbackFpaUpdateCountRef = useRef<number>(0);
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
    setCalibrationStatus(`Calibration complete. Base FPA = ${avgFpa.toFixed(2)}° (${values.length} steps).`);
  };

  const startCalibration = () => {
    if (isCalibrating) return;
    if (connectedRef.current.length === 0) {
      setCalibrationStatus('Connect devices before calibrating.');
      return;
    }
    calibrationValuesRef.current = [];
    calibrationSeenStepsRef.current = new Set();
    setCalibrationStatus(`Calibrating for ${CALIBRATION_DURATION_SEC} seconds. Walk naturally.`);
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
    setIsSessionRunning(false);
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
            // ignore teardown failures
          }
        }),
      );
    }
    connectedRef.current = [];
    setConnectedCount(0);
    setReceiverLabel('—');
    setSenderLabel('—');
    setHapticStatus('');
    lastFeedbackFpaUpdateCountRef.current = 0;
  };

  const connectAndStart = async (devices: Device[]): Promise<boolean> => {
    const manager = managerRef.current;
    if (!manager) return false;
    try {
      stopScan();
      const connected = await connectNordicDevices(manager, devices);
      if (connected.length === 0) {
        throw new Error('Found matching devices, but could not connect to any of them.');
      }
      const { receiver, sender } = assignReceiverAndSenderDevices(connected);
      if (!sender) {
        throw new Error('Need both receiver (Shank) and transmitter (Foot) devices.');
      }
      connectedRef.current = connected.map(item => item.device);
      setConnectedCount(connected.length);
      setReceiverLabel('Shank');
      setSenderLabel('Foot');
      setError('');
      setCsvStatus('');
      resetPipeline();
      resetHapticsWriter();
      lastCalibrationFpaUpdateCountRef.current = 0;
      lastFeedbackFpaUpdateCountRef.current = 0;
      csvRowsRef.current = [];
      setFpaSeries([]);
      configureSender(sender.device, sender.rxServiceUUID);
      await startPipeline(receiver.device);
      setStatus('connected');
      startedAtRef.current = Date.now();
      setElapsedSec(0);
      setIsSessionRunning(true);
      return true;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      return false;
    }
  };

  const startAutoScan = async (): Promise<boolean> => {
    const manager = managerRef.current;
    if (!manager) return false;
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
        return false;
      }
      return await connectAndStart(matches);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setStatus('error');
      return false;
    }
  };

  const appendCsvRow = useCallback(
    (args: { step: number; fpaDeg: number; diffDeg: number | null; drv: string; effect: string; sentCommand: string }) => {
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
    },
    [latest],
  );

  const exportCsv = async () => {
    try {
      if (csvRowsRef.current.length === 0) {
        setCsvStatus('No rows to export yet. Walk a few steps first.');
        return;
      }
      const csv = `${CSV_HEADER}\n${csvRowsRef.current.join('\n')}\n`;
      const filename = `fpa_log_${Date.now()}.csv`;
      const targetDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!targetDir) {
        throw new Error('No writable app directory is available.');
      }
      const fileUri = `${targetDir}${filename}`;
      await FileSystem.writeAsStringAsync(fileUri, csv, { encoding: FileSystem.EncodingType.UTF8 });
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
        setCsvStatus(`Saved and shared ${filename} (${csvRowsRef.current.length} rows).`);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setCsvStatus(`Export failed: ${msg}`);
    }
  };

  const onRescan = () => {
    void (async () => {
      await disconnect();
      await startAutoScan();
    })();
  };

  const onCalibrate = () => {
    void (async () => {
      if (isCalibrating) return;
      if (connectedRef.current.length === 0) {
        setCalibrationStatus('Connecting devices before calibration...');
        const connected = await startAutoScan();
        if (!connected) {
          setCalibrationStatus('Calibration canceled: could not connect devices.');
          return;
        }
      }
      startCalibration();
    })();
  };

  const onDisconnect = () => {
    void (async () => {
      const snapshot = {
        startedAt: new Date(startedAtRef.current).toISOString(),
        endedAt: new Date().toISOString(),
        csvRows: [...csvRowsRef.current],
      };
      await disconnect();
      resetPipeline();
      setStatus('idle');
      if (snapshot.csvRows.length === 0) {
        setBackendStatus('Session stopped. No FPA points were available to upload.');
        return;
      }
      setBackendStatus('Session stopped. Saving summary to AWS...');
      try {
        const saved = await createSessionSummary({
          session_id: `session-${startedAtRef.current}`,
          started_at: snapshot.startedAt,
          ended_at: snapshot.endedAt,
          csv_data: `${CSV_HEADER}\n${snapshot.csvRows.join('\n')}\n`,
        });
        setBackendStatus(
          `Saved to DynamoDB: ${saved.avg_fpa_deg.toFixed(1)}° avg over ${saved.duration_sec}s.`,
        );
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        setBackendStatus(`AWS summary upload failed: ${msg}`);
      }
    })();
  };

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
    if (!isSessionRunning) return;
    const timer = setInterval(() => {
      setElapsedSec(Math.max(0, Math.floor((Date.now() - startedAtRef.current) / 1000)));
    }, 1000);
    return () => clearInterval(timer);
  }, [isSessionRunning]);

  useEffect(() => {
    void (async () => {
      const storedBaseFpa = await getStoredBaseFpaDeg();
      setBaseFpaDeg(storedBaseFpa);
    })();
  }, []);

  useEffect(() => {
    if (!isCalibrating || !latest) return;
    if (latest.fpaUpdateCount <= lastCalibrationFpaUpdateCountRef.current) return;
    lastCalibrationFpaUpdateCountRef.current = latest.fpaUpdateCount;
    if (latest.stepCount <= CALIBRATION_IGNORE_INITIAL_STEPS) return;
    calibrationValuesRef.current.push(latest.fpaThisStepDeg);
  }, [isCalibrating, latest]);

  useEffect(() => {
    if (!latest) return;
    if (latest.fpaUpdateCount <= lastFeedbackFpaUpdateCountRef.current) return;
    lastFeedbackFpaUpdateCountRef.current = latest.fpaUpdateCount;
    const manager = managerRef.current;
    if (!manager) return;
    const fpaDeg = latest.fpaThisStepDeg;
    const diff = baseFpaDeg == null ? null : fpaDeg - baseFpaDeg;
    let cmd = '';
    let drv = '';
    let effect = '';
    if (!isCalibrating && diff != null && connectedRef.current.length > 1) {
      cmd = getAutoFeedbackCommand(diff);
      if (cmd) {
        drv = cmd.startsWith('3') ? 'DRV3' : 'DRV0';
        effect = String(FEEDBACK_EFFECT);
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
    setFpaSeries(prev => [...prev, fpaDeg]);
  }, [latest, baseFpaDeg, isCalibrating, sendHaptic, appendCsvRow]);

  const canDisconnect = status === 'scanning' || connectedRef.current.length > 0;
  const sessionState = isCalibrating ? 'Calibrating' : status === 'connected' ? 'Monitoring' : 'Idle';
  const currentFpa = latest ? latest.fpaThisStepDeg : null;
  const avgFpa =
    fpaSeries.length > 0 ? fpaSeries.reduce((sum, value) => sum + value, 0) / fpaSeries.length : null;
  const currentDiffDeg = latest && baseFpaDeg != null ? latest.fpaThisStepDeg - baseFpaDeg : null;
  const currentFeedbackCommand = currentDiffDeg == null ? '' : getAutoFeedbackCommand(currentDiffDeg);
  const isWithinTargetRange = currentDiffDeg != null && currentFeedbackCommand === '';
  const canStart = !isSessionRunning && status !== 'scanning';
  const startButtonLabel = status === 'scanning' ? 'Connecting...' : isSessionRunning ? 'Connected' : 'Start';
  const toeDirection =
    currentDiffDeg == null
      ? 'Awaiting baseline'
      : currentFeedbackCommand.startsWith('3')
        ? `Toe in (${currentFeedbackCommand})`
        : currentFeedbackCommand.startsWith('0')
          ? `Toe out (${currentFeedbackCommand})`
          : 'Within target range';
  const feedbackWindowText = latest?.inFeedbackWindow
    ? 'In feedback window'
    : 'Outside feedback window';
  const chartMeasuredMin = fpaSeries.length > 0 ? Math.min(...fpaSeries) : null;
  const chartMeasuredMax = fpaSeries.length > 0 ? Math.max(...fpaSeries) : null;

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView
        contentContainerStyle={[stylesThemed.content, scrollContentStyle]}
        keyboardShouldPersistTaps="handled">
        <ThemedView style={stylesThemed.headerRow}>
          <ThemedText type="title">Active Session</ThemedText>
          <ThemedView
            style={[
              stylesThemed.badge,
              sessionState === 'Monitoring' ? stylesThemed.badgeOn : stylesThemed.badgeOff,
            ]}>
            <ThemedText style={stylesThemed.badgeText}>{sessionState}</ThemedText>
          </ThemedView>
        </ThemedView>

        <ThemedView
          style={[
            stylesThemed.kpiCard,
            currentDiffDeg == null
              ? null
              : isWithinTargetRange
                ? stylesThemed.kpiCardInRange
                : stylesThemed.kpiCardOutOfRange,
          ]}>
          <ThemedText style={stylesThemed.kpiLabel}>Current FPA</ThemedText>
          <ThemedText style={stylesThemed.kpiValue}>
            {currentFpa != null ? `${currentFpa.toFixed(1)}°` : '—'}
          </ThemedText>
          <View style={stylesThemed.kpiMetaRow}>
            <ThemedText style={stylesThemed.kpiMeta}>Session: {formatMinutes(elapsedSec)}</ThemedText>
            <ThemedText style={stylesThemed.kpiMeta}>
              Avg: {avgFpa != null ? `${avgFpa.toFixed(1)}°` : '—'}
            </ThemedText>
          </View>
          <ThemedText style={stylesThemed.kpiMeta}>
            Step: {latest?.stepCount ?? '—'} | Rate: {latest ? `${latest.rateHz.toFixed(1)} Hz` : '—'}
          </ThemedText>
          <ThemedText style={stylesThemed.kpiMeta}>
            Base: {baseFpaDeg != null ? `${baseFpaDeg.toFixed(2)}°` : '—'} | {feedbackWindowText}
          </ThemedText>
          <ThemedText style={stylesThemed.kpiMeta}>Feedback direction: {toeDirection}</ThemedText>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">FPA over current session</ThemedText>
          <ThemedView style={stylesThemed.chartCard}>
            <View style={stylesThemed.chartPlotRow}>
              <View style={stylesThemed.chartRangeColumn}>
                <ThemedText style={stylesThemed.chartRangeText}>
                  {chartMeasuredMax != null ? `${chartMeasuredMax.toFixed(1)}°` : '—'}
                </ThemedText>
                <View style={stylesThemed.chartRangeStem} />
                <ThemedText style={stylesThemed.chartRangeText}>
                  {chartMeasuredMin != null ? `${chartMeasuredMin.toFixed(1)}°` : '—'}
                </ThemedText>
              </View>
              <View style={stylesThemed.chartPlotMain}>
                <MiniBarChart data={fpaSeries} height={96} barWidth={6} baseLineDeg={baseFpaDeg} />
              </View>
            </View>
            <View style={stylesThemed.chartLegendRow}>
              <ThemedText style={stylesThemed.muted}>Start</ThemedText>
              <ThemedText style={stylesThemed.muted}>
                Target:{' '}
                {baseFpaDeg != null
                  ? `${(baseFpaDeg + (FEEDBACK_TOE_IN_THRESHOLD_DEG + FEEDBACK_TOE_OUT_THRESHOLD_DEG) / 2).toFixed(1)}°`
                  : '—'}
              </ThemedText>
              <ThemedText style={stylesThemed.muted}>Now</ThemedText>
            </View>
          </ThemedView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Controls</ThemedText>
          <View style={stylesThemed.row}>
            <TouchableOpacity
              style={[stylesThemed.button, !canStart && stylesThemed.buttonDisabled]}
              disabled={!canStart}
              onPress={onRescan}
              activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonText}>{startButtonLabel}</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[stylesThemed.buttonDanger, !canDisconnect && stylesThemed.buttonDisabled]}
              disabled={!canDisconnect}
              onPress={onDisconnect}
              activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonDangerText}>Stop</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Admin</ThemedText>
          <View style={stylesThemed.row}>
            <TouchableOpacity
              style={[stylesThemed.button, isCalibrating && stylesThemed.buttonDisabled]}
              disabled={isCalibrating}
              onPress={onCalibrate}
              activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonText}>
                {isCalibrating ? `Calibrating (${calibrationSecondsLeft}s)` : 'Calibrate'}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity style={stylesThemed.button} onPress={() => void exportCsv()} activeOpacity={0.75}>
              <ThemedText style={stylesThemed.buttonText}>Export CSV</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>
        {calibrationStatus ? <ThemedText style={stylesThemed.muted}>{calibrationStatus}</ThemedText> : null}
        {hapticStatus ? <ThemedText style={stylesThemed.muted}>{hapticStatus}</ThemedText> : null}
        {csvStatus ? <ThemedText style={stylesThemed.muted}>{csvStatus}</ThemedText> : null}
        {backendStatus ? <ThemedText style={stylesThemed.muted}>{backendStatus}</ThemedText> : null}
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  chartScroll: {
    width: '100%',
  },
  chart: {
    position: 'relative',
    overflow: 'hidden',
  },
  chartBar: {
    position: 'absolute',
    borderRadius: 4,
    backgroundColor: '#2F7EF7',
  },
  emptyChartText: {
    fontSize: 13,
    color: '#6B7280',
  },
  chartBaseLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    borderRadius: 99,
    backgroundColor: '#DC2626',
    opacity: 0.92,
  },
});

function createStyles(theme: (typeof Colors)['light']) {
  return StyleSheet.create({
    container: { flex: 1 },
    content: { gap: 16, paddingBottom: 10 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    muted: { color: theme.muted, fontSize: 13 },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      borderWidth: StyleSheet.hairlineWidth,
    },
    badgeOn: { backgroundColor: theme.surfaceSelected, borderColor: theme.buttonPrimary },
    badgeOff: { backgroundColor: theme.inputBackground, borderColor: theme.border },
    badgeText: { fontSize: 12, fontWeight: '700', color: theme.text },
    section: { gap: 10, marginTop: 18 },
    row: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
    kpiCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      paddingHorizontal: 14,
      paddingVertical: 18,
      gap: 6,
      backgroundColor: theme.inputBackground,
    },
    kpiCardInRange: {
      borderColor: '#22C55E',
      backgroundColor: 'rgba(34, 197, 94, 0.16)',
    },
    kpiCardOutOfRange: {
      borderColor: '#EF4444',
      backgroundColor: 'rgba(239, 68, 68, 0.16)',
    },
    kpiLabel: { fontSize: 13, color: theme.muted },
    kpiValue: { fontSize: 44, lineHeight: 54, fontWeight: '800', color: theme.text },
    kpiMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
    kpiMeta: { fontSize: 12, color: theme.muted },
    chartCard: {
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: theme.border,
      backgroundColor: theme.inputBackground,
      padding: 12,
      gap: 8,
    },
    chartPlotRow: { flexDirection: 'row', alignItems: 'stretch', gap: 0 },
    chartRangeColumn: {
      width: 42,
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      paddingVertical: 2,
      gap: 6,
    },
    chartRangeText: { color: theme.muted, fontSize: 12 },
    chartRangeStem: {
      width: 2,
      flex: 1,
      borderRadius: 99,
      backgroundColor: theme.border,
      marginVertical: 2,
    },
    chartPlotMain: { flex: 1, justifyContent: 'flex-end' },
    chartLegendRow: { flexDirection: 'row', justifyContent: 'space-between' },
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
    buttonDanger: {
      paddingHorizontal: 20,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonDestructive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: { opacity: 0.55 },
    buttonText: { color: theme.buttonOnPrimary, fontWeight: '700', fontSize: 16 },
    buttonTextSecondary: { color: theme.text, fontWeight: '700', fontSize: 16 },
    buttonDangerText: { color: theme.buttonOnPrimary, fontWeight: '700', fontSize: 16 },
    errorText: { color: theme.buttonDestructive, fontSize: 13 },
  });
}

