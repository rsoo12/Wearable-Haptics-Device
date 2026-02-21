import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BleManager, Characteristic, Device, Service, Subscription } from 'react-native-ble-plx';
import { encode as btoa, decode as atob } from 'base-64';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';

type LogEntry = {
  id: string;
  message: string;
};

type DiscoveredChar = {
  serviceUUID: string;
  characteristicUUID: string;
  isWritable: boolean;
  isNotifiable: boolean;
  summary: string;
};

// iPhone 13 viewport: 390×844 pt; use consistent spacing and 44pt min touch targets
const HORIZONTAL_PADDING = 20;
const SECTION_GAP = 18;
const TAB_BAR_HEIGHT = 49;

export default function BluetoothScreen() {
  const insets = useSafeAreaInsets();
  const [manager, setManager] = useState<BleManager | null>(null);
  const [bleError, setBleError] = useState<string | null>(null);
  const scanSubscription = useRef<Subscription | null>(null);
  const notificationSubscription = useRef<Subscription | null>(null);

  const [isScanning, setIsScanning] = useState(false);
  const [devices, setDevices] = useState<Device[]>([]);
  const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const [serviceUUID, setServiceUUID] = useState('');
  const [characteristicUUID, setCharacteristicUUID] = useState('');
  const [discoveredChars, setDiscoveredChars] = useState<DiscoveredChar[]>([]);
  const [discoveryLoading, setDiscoveryLoading] = useState(false);
  const [outgoingText, setOutgoingText] = useState('');
  const [incomingMessages, setIncomingMessages] = useState<string[]>([]);

  const appendLog = (message: string) => {
    setLogs(prev => [{ id: String(Date.now() + Math.random()), message }, ...prev].slice(0, 50));
  };

  useEffect(() => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
      setBleError('Bluetooth is only available on a physical iOS or Android device.');
      return;
    }

    try {
      const m = new BleManager();
      setManager(m);

      return () => {
        scanSubscription.current?.remove();
        notificationSubscription.current?.remove();
        m.destroy();
      };
    } catch (error: any) {
      setBleError(
        'Failed to initialize Bluetooth. On Expo, make sure you are using a dev client with react-native-ble-plx installed.',
      );
    }
  }, []);

  const startScan = () => {
    if (!manager) {
      appendLog('Bluetooth manager not ready.');
      return;
    }
    if (isScanning) return;

    setDevices([]);
    setIsScanning(true);
    appendLog('Starting scan for BLE devices...');

    scanSubscription.current = manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        appendLog(`Scan error: ${error.message}`);
        setIsScanning(false);
        scanSubscription.current?.remove();
        scanSubscription.current = null;
        return;
      }

      if (device) {
        setDevices(prev => {
          if (prev.find(d => d.id === device.id)) return prev;
          return [...prev, device];
        });
      }
    });

    // Stop scanning automatically after 10 seconds
    setTimeout(() => {
      if (scanSubscription.current) {
        scanSubscription.current.remove();
        scanSubscription.current = null;
        setIsScanning(false);
        appendLog('Scan stopped.');
      }
    }, 10000);
  };

  const stopScan = () => {
    if (!isScanning) return;
    scanSubscription.current?.remove();
    scanSubscription.current = null;
    setIsScanning(false);
    appendLog('Scan manually stopped.');
  };

  const discoverServicesAndCharacteristics = async (device: Device) => {
    if (!manager) return;
    setDiscoveryLoading(true);
    setDiscoveredChars([]);
    try {
      const services: Service[] = await device.services();
      const all: DiscoveredChar[] = [];
      for (const service of services) {
        const characteristics: Characteristic[] = await service.characteristics();
        for (const char of characteristics) {
          const writable = char.isWritableWithResponse || char.isWritableWithoutResponse;
          const notifiable = char.isNotifiable || char.isIndicatable;
          if (writable || notifiable) {
            all.push({
              serviceUUID: service.uuid,
              characteristicUUID: char.uuid,
              isWritable: writable,
              isNotifiable: notifiable,
              summary: [writable && 'write', notifiable && 'notify'].filter(Boolean).join(', '),
            });
          }
        }
      }
      setDiscoveredChars(all);

      const firstWritable = all.find(c => c.isWritable);
      const firstNotifiable = all.find(c => c.isNotifiable);
      if (firstWritable) {
        setServiceUUID(firstWritable.serviceUUID);
        setCharacteristicUUID(firstWritable.characteristicUUID);
        appendLog(`Auto-selected characteristic for send: ${firstWritable.characteristicUUID.slice(0, 8)}...`);
      }
      if (firstNotifiable && (!firstWritable || firstNotifiable.characteristicUUID !== firstWritable.characteristicUUID)) {
        appendLog(`Available for listen: ${firstNotifiable.characteristicUUID.slice(0, 8)}...`);
      }
      if (all.length === 0) {
        appendLog('No writable or notifiable characteristics found. Enter UUIDs manually if your device uses custom GATT.');
      }
    } catch (e: any) {
      appendLog(`Discovery error: ${e?.message ?? String(e)}`);
    } finally {
      setDiscoveryLoading(false);
    }
  };

  const connectToDevice = async (device: Device) => {
    try {
      appendLog(`Connecting to ${device.name ?? 'Unnamed'} (${device.id})...`);
      stopScan();

      if (!manager) {
        appendLog('Bluetooth manager not ready.');
        return;
      }

      const connected = await manager.connectToDevice(device.id, { timeout: 10000 });
      await connected.discoverAllServicesAndCharacteristics();

      setConnectedDevice(connected);
      appendLog(`Connected to ${connected.name ?? 'Unnamed'} (${connected.id}).`);
      await discoverServicesAndCharacteristics(connected);
    } catch (error: any) {
      appendLog(`Connection error: ${error.message ?? String(error)}`);
    }
  };

  const disconnect = async () => {
    if (!connectedDevice) return;
    try {
      appendLog(`Disconnecting from ${connectedDevice.name ?? 'Unnamed'} (${connectedDevice.id})...`);
      notificationSubscription.current?.remove();
      notificationSubscription.current = null;
      if (!manager) {
        appendLog('Bluetooth manager not ready.');
        return;
      }
      await manager.cancelDeviceConnection(connectedDevice.id);
      setConnectedDevice(null);
      setDiscoveredChars([]);
      setServiceUUID('');
      setCharacteristicUUID('');
      appendLog('Disconnected.');
    } catch (error: any) {
      appendLog(`Disconnect error: ${error.message ?? String(error)}`);
    }
  };

  const selectDiscoveredChar = (c: DiscoveredChar) => {
    setServiceUUID(c.serviceUUID);
    setCharacteristicUUID(c.characteristicUUID);
    appendLog(`Selected characteristic: ${c.characteristicUUID.slice(0, 8)}... (${c.summary})`);
  };

  const sendData = async () => {
    if (!connectedDevice) {
      appendLog('Cannot send: no device connected.');
      return;
    }
    if (!serviceUUID || !characteristicUUID) {
      appendLog('No characteristic selected. Pick one from "Discovered" or enter Service & Characteristic UUIDs.');
      return;
    }
    if (!outgoingText) {
      appendLog('Nothing to send: outgoing text is empty.');
      return;
    }

    try {
      if (!manager) {
        appendLog('Bluetooth manager not ready.');
        return;
      }
      const base64Payload = btoa(outgoingText);
      await manager.writeCharacteristicWithResponseForDevice(
        connectedDevice.id,
        serviceUUID.trim(),
        characteristicUUID.trim(),
        base64Payload,
      );
      appendLog(`Sent: "${outgoingText}"`);
    } catch (error: any) {
      appendLog(`Send error: ${error.message ?? String(error)}`);
    }
  };

  const startListening = async () => {
    if (!connectedDevice) {
      appendLog('Cannot listen: no device connected.');
      return;
    }
    if (!serviceUUID || !characteristicUUID) {
      appendLog('No characteristic selected. Pick one from "Discovered" or enter Service & Characteristic UUIDs.');
      return;
    }

    notificationSubscription.current?.remove();
    notificationSubscription.current = null;

    appendLog('Subscribing for notifications...');

    if (!manager) {
      appendLog('Bluetooth manager not ready.');
      return;
    }

    notificationSubscription.current = manager.monitorCharacteristicForDevice(
      connectedDevice.id,
      serviceUUID.trim(),
      characteristicUUID.trim(),
      (error, characteristic) => {
        if (error) {
          appendLog(`Notification error: ${error.message}`);
          return;
        }
        if (!characteristic?.value) return;

        try {
          const decoded = atob(characteristic.value);
          setIncomingMessages(prev => [decoded, ...prev].slice(0, 50));
          appendLog(`Received: "${decoded}"`);
        } catch (e: any) {
          appendLog(`Received (raw base64): ${characteristic.value}`);
        }
      },
    );
  };

  const contentPadding = {
    paddingTop: Math.max(insets.top, 12),
    paddingHorizontal: HORIZONTAL_PADDING,
    paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 24,
  };

  return (
    <ThemedView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, contentPadding]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={styles.title}>
          Bluetooth Console
        </ThemedText>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Connection</ThemedText>
          {bleError && (
            <ThemedText style={styles.errorText}>
              {bleError}
            </ThemedText>
          )}
          <ThemedText style={styles.statusText}>
            Status:{' '}
            {connectedDevice
              ? `Connected to ${connectedDevice.name ?? 'Unnamed'} (${connectedDevice.id})`
              : 'Not connected'}
          </ThemedText>
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.button, isScanning && styles.buttonSecondary]}
              onPress={isScanning ? stopScan : startScan}
              activeOpacity={0.7}>
              <ThemedText style={styles.buttonText}>{isScanning ? 'Stop Scan' : 'Scan'}</ThemedText>
            </TouchableOpacity>
            {connectedDevice && (
              <TouchableOpacity style={styles.buttonDanger} onPress={disconnect} activeOpacity={0.7}>
                <ThemedText style={styles.buttonText}>Disconnect</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </ThemedView>

        <ScrollView style={styles.devicesList} contentContainerStyle={styles.devicesListContent} nestedScrollEnabled>
          {devices.length === 0 ? (
            <ThemedText style={styles.muted}>No devices found yet. Tap Scan to begin.</ThemedText>
          ) : (
            devices.map(device => (
              <TouchableOpacity
                key={device.id}
                style={[
                  styles.deviceItem,
                  connectedDevice?.id === device.id && styles.deviceItemConnected,
                ]}
                onPress={() => connectToDevice(device)}
                activeOpacity={0.7}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {device.name ?? 'Unnamed device'}
                </ThemedText>
                <ThemedText style={styles.deviceMeta} numberOfLines={1}>{device.id}</ThemedText>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {connectedDevice && (
          <ThemedView style={styles.section}>
            <ThemedText type="subtitle">Discovered (tap to use for Send/Listen)</ThemedText>
            {discoveryLoading ? (
              <ThemedText style={styles.muted}>Discovering services and characteristics…</ThemedText>
            ) : discoveredChars.length === 0 ? (
              <ThemedText style={styles.muted}>
                No writable/notify characteristics found. Enter UUIDs below or refresh.
              </ThemedText>
            ) : (
              <ScrollView style={styles.discoveredList} nestedScrollEnabled>
                {discoveredChars.map((c, i) => (
                  <TouchableOpacity
                    key={`${c.serviceUUID}-${c.characteristicUUID}-${i}`}
                    style={[
                      styles.discoveredItem,
                      serviceUUID === c.serviceUUID && characteristicUUID === c.characteristicUUID && styles.discoveredItemSelected,
                    ]}
                    onPress={() => selectDiscoveredChar(c)}
                    activeOpacity={0.7}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={styles.discoveredCharId}>
                      {c.characteristicUUID}
                    </ThemedText>
                    <ThemedText style={styles.muted}>{c.summary}</ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {connectedDevice && !discoveryLoading && (
              <TouchableOpacity style={styles.buttonSecondary} onPress={() => discoverServicesAndCharacteristics(connectedDevice)} activeOpacity={0.7}>
                <ThemedText style={styles.buttonText}>Refresh discovery</ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>
        )}

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Service &amp; Characteristic (optional if one is selected above)</ThemedText>
          <TextInput
            value={serviceUUID}
            onChangeText={setServiceUUID}
            placeholder="Service UUID (auto-filled when discovered)"
            placeholderTextColor="#999"
            style={styles.input}
            autoCapitalize="none"
          />
          <TextInput
            value={characteristicUUID}
            onChangeText={setCharacteristicUUID}
            placeholder="Characteristic UUID (auto-filled when discovered)"
            placeholderTextColor="#999"
            style={styles.input}
            autoCapitalize="none"
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.button} onPress={startListening} activeOpacity={0.7}>
              <ThemedText style={styles.buttonText}>Listen</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Send Data</ThemedText>
          <TextInput
            value={outgoingText}
            onChangeText={setOutgoingText}
            placeholder="Type message to send"
            placeholderTextColor="#999"
            style={styles.input}
          />
          <View style={styles.row}>
            <TouchableOpacity style={styles.button} onPress={sendData} activeOpacity={0.7}>
              <ThemedText style={styles.buttonText}>Send</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Received Data</ThemedText>
          <ScrollView style={styles.messagesSection} nestedScrollEnabled>
            {incomingMessages.length === 0 ? (
              <ThemedText style={styles.muted}>No data received yet.</ThemedText>
            ) : (
              incomingMessages.map((msg, index) => (
                <ThemedText key={`${msg}-${index}`} style={styles.messageItem} numberOfLines={3}>
                  {msg}
                </ThemedText>
              ))
            )}
          </ScrollView>
        </ThemedView>

        <ThemedView style={styles.section}>
          <ThemedText type="subtitle">Logs</ThemedText>
          <ScrollView style={styles.logsSection} nestedScrollEnabled>
            {logs.length === 0 ? (
              <ThemedText style={styles.muted}>No logs yet.</ThemedText>
            ) : (
              logs.map(entry => (
                <ThemedText key={entry.id} style={styles.logItem} numberOfLines={2}>
                  {entry.message}
                </ThemedText>
              ))
            )}
          </ScrollView>
        </ThemedView>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    gap: SECTION_GAP,
    paddingBottom: 8,
  },
  title: {
    marginBottom: 6,
    marginTop: 4,
  },
  section: {
    gap: 10,
  },
  errorText: {
    fontSize: 13,
    color: '#FF3B30',
    marginTop: 2,
  },
  statusText: {
    fontSize: 15,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  button: {
    paddingHorizontal: 20,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#5AC8FA',
  },
  buttonDanger: {
    paddingHorizontal: 20,
    minHeight: 44,
    borderRadius: 10,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 16,
  },
  devicesList: {
    maxHeight: 152,
    borderRadius: 10,
    marginTop: 2,
  },
  devicesListContent: {
    paddingVertical: 6,
    paddingRight: 4,
  },
  deviceItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CCC',
    marginBottom: 8,
  },
  deviceItemConnected: {
    borderColor: '#007AFF',
    backgroundColor: '#E6F0FF',
  },
  deviceMeta: {
    fontSize: 12,
    color: '#777',
    marginTop: 2,
  },
  discoveredList: {
    maxHeight: 140,
    marginTop: 4,
  },
  discoveredItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CCC',
    marginBottom: 6,
  },
  discoveredItemSelected: {
    borderColor: '#007AFF',
    backgroundColor: '#E6F0FF',
  },
  discoveredCharId: {
    fontSize: 12,
  },
  input: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#CCC',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    minHeight: 44,
    color: '#000',
  },
  messagesSection: {
    maxHeight: 110,
    marginTop: 4,
  },
  messageItem: {
    paddingVertical: 6,
    fontSize: 14,
  },
  logsSection: {
    maxHeight: 130,
    marginTop: 4,
  },
  logItem: {
    fontSize: 12,
    paddingVertical: 4,
    color: '#555',
  },
  muted: {
    color: '#777',
    fontSize: 13,
  },
});
