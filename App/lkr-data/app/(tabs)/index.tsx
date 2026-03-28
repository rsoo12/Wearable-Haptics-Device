import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, ScrollView, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { BleManager, Characteristic, Device, Service, Subscription } from 'react-native-ble-plx';
import { encode as btoa, decode as atob } from 'base-64';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useIphone13ContentFrame } from '@/hooks/use-iphone13-content-frame';

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

const SECTION_GAP = 18;

export default function BluetoothScreen() {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { scrollContentStyle } = useIphone13ContentFrame({ includeTabBarInset: true });
  const stylesThemed = useMemo(() => createStyles(theme), [theme]);
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
    } catch {
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
        } catch {
          appendLog(`Received (raw base64): ${characteristic.value}`);
        }
      },
    );
  };

  return (
    <ThemedView style={stylesThemed.container}>
      <ScrollView
        style={stylesThemed.scrollView}
        contentContainerStyle={[stylesThemed.scrollContent, scrollContentStyle]}
        showsVerticalScrollIndicator={true}
        keyboardShouldPersistTaps="handled">
        <ThemedText type="title" style={stylesThemed.title}>
          Bluetooth Console
        </ThemedText>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Connection</ThemedText>
          {bleError && (
            <ThemedText style={stylesThemed.errorText}>
              {bleError}
            </ThemedText>
          )}
          <ThemedText style={stylesThemed.statusText}>
            Status:{' '}
            {connectedDevice
              ? `Connected to ${connectedDevice.name ?? 'Unnamed'} (${connectedDevice.id})`
              : 'Not connected'}
          </ThemedText>
          <View style={stylesThemed.row}>
            <TouchableOpacity
              style={[stylesThemed.button, isScanning && stylesThemed.buttonSecondary]}
              onPress={isScanning ? stopScan : startScan}
              activeOpacity={0.7}>
              <ThemedText style={stylesThemed.buttonText}>{isScanning ? 'Stop Scan' : 'Scan'}</ThemedText>
            </TouchableOpacity>
            {connectedDevice && (
              <TouchableOpacity style={stylesThemed.buttonDanger} onPress={disconnect} activeOpacity={0.7}>
                <ThemedText style={stylesThemed.buttonText}>Disconnect</ThemedText>
              </TouchableOpacity>
            )}
          </View>
        </ThemedView>

        <ScrollView style={stylesThemed.devicesList} contentContainerStyle={stylesThemed.devicesListContent} nestedScrollEnabled>
          {devices.length === 0 ? (
            <ThemedText style={stylesThemed.muted}>No devices found yet. Tap Scan to begin.</ThemedText>
          ) : (
            devices.map(device => (
              <TouchableOpacity
                key={device.id}
                style={[
                  stylesThemed.deviceItem,
                  connectedDevice?.id === device.id && stylesThemed.deviceItemConnected,
                ]}
                onPress={() => connectToDevice(device)}
                activeOpacity={0.7}>
                <ThemedText type="defaultSemiBold" numberOfLines={1}>
                  {device.name ?? 'Unnamed device'}
                </ThemedText>
                <ThemedText style={stylesThemed.deviceMeta} numberOfLines={1}>{device.id}</ThemedText>
              </TouchableOpacity>
            ))
          )}
        </ScrollView>

        {connectedDevice && (
          <ThemedView style={stylesThemed.section}>
            <ThemedText type="subtitle">Discovered (tap to use for Send/Listen)</ThemedText>
            {discoveryLoading ? (
              <ThemedText style={stylesThemed.muted}>Discovering services and characteristics…</ThemedText>
            ) : discoveredChars.length === 0 ? (
              <ThemedText style={stylesThemed.muted}>
                No writable/notify characteristics found. Enter UUIDs below or refresh.
              </ThemedText>
            ) : (
              <ScrollView style={stylesThemed.discoveredList} nestedScrollEnabled>
                {discoveredChars.map((c, i) => (
                  <TouchableOpacity
                    key={`${c.serviceUUID}-${c.characteristicUUID}-${i}`}
                    style={[
                      stylesThemed.discoveredItem,
                      serviceUUID === c.serviceUUID && characteristicUUID === c.characteristicUUID && stylesThemed.discoveredItemSelected,
                    ]}
                    onPress={() => selectDiscoveredChar(c)}
                    activeOpacity={0.7}>
                    <ThemedText type="defaultSemiBold" numberOfLines={1} style={stylesThemed.discoveredCharId}>
                      {c.characteristicUUID}
                    </ThemedText>
                    <ThemedText style={stylesThemed.muted}>{c.summary}</ThemedText>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {connectedDevice && !discoveryLoading && (
              <TouchableOpacity style={stylesThemed.buttonSecondary} onPress={() => discoverServicesAndCharacteristics(connectedDevice)} activeOpacity={0.7}>
                <ThemedText style={stylesThemed.buttonText}>Refresh discovery</ThemedText>
              </TouchableOpacity>
            )}
          </ThemedView>
        )}

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Service &amp; Characteristic (optional if one is selected above)</ThemedText>
          <TextInput
            value={serviceUUID}
            onChangeText={setServiceUUID}
            placeholder="Service UUID (auto-filled when discovered)"
            placeholderTextColor={theme.placeholder}
            style={stylesThemed.input}
            autoCapitalize="none"
          />
          <TextInput
            value={characteristicUUID}
            onChangeText={setCharacteristicUUID}
            placeholder="Characteristic UUID (auto-filled when discovered)"
            placeholderTextColor={theme.placeholder}
            style={stylesThemed.input}
            autoCapitalize="none"
          />
          <View style={stylesThemed.row}>
            <TouchableOpacity style={stylesThemed.button} onPress={startListening} activeOpacity={0.7}>
              <ThemedText style={stylesThemed.buttonText}>Listen</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Send Data</ThemedText>
          <TextInput
            value={outgoingText}
            onChangeText={setOutgoingText}
            placeholder="Type message to send"
            placeholderTextColor={theme.placeholder}
            style={stylesThemed.input}
          />
          <View style={stylesThemed.row}>
            <TouchableOpacity style={stylesThemed.button} onPress={sendData} activeOpacity={0.7}>
              <ThemedText style={stylesThemed.buttonText}>Send</ThemedText>
            </TouchableOpacity>
          </View>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Received Data</ThemedText>
          <ScrollView style={stylesThemed.messagesSection} nestedScrollEnabled>
            {incomingMessages.length === 0 ? (
              <ThemedText style={stylesThemed.muted}>No data received yet.</ThemedText>
            ) : (
              incomingMessages.map((msg, index) => (
                <ThemedText key={`${msg}-${index}`} style={stylesThemed.messageItem} numberOfLines={3}>
                  {msg}
                </ThemedText>
              ))
            )}
          </ScrollView>
        </ThemedView>

        <ThemedView style={stylesThemed.section}>
          <ThemedText type="subtitle">Logs</ThemedText>
          <ScrollView style={stylesThemed.logsSection} nestedScrollEnabled>
            {logs.length === 0 ? (
              <ThemedText style={stylesThemed.muted}>No logs yet.</ThemedText>
            ) : (
              logs.map(entry => (
                <ThemedText key={entry.id} style={stylesThemed.logItem} numberOfLines={2}>
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

function createStyles(theme: (typeof Colors)['light']) {
  return StyleSheet.create({
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
      color: theme.buttonDestructive,
      marginTop: 2,
    },
    statusText: {
      fontSize: 15,
      color: theme.text,
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
      backgroundColor: theme.buttonPrimary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonSecondary: {
      backgroundColor: theme.buttonSecondary,
    },
    buttonDanger: {
      paddingHorizontal: 20,
      minHeight: 44,
      borderRadius: 10,
      backgroundColor: theme.buttonDestructive,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonText: {
      color: theme.buttonOnPrimary,
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
      borderColor: theme.border,
      marginBottom: 8,
      backgroundColor: theme.inputBackground,
    },
    deviceItemConnected: {
      borderColor: theme.buttonPrimary,
      backgroundColor: theme.surfaceSelected,
    },
    deviceMeta: {
      fontSize: 12,
      color: theme.muted,
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
      borderColor: theme.border,
      marginBottom: 6,
      backgroundColor: theme.inputBackground,
    },
    discoveredItemSelected: {
      borderColor: theme.buttonPrimary,
      backgroundColor: theme.surfaceSelected,
    },
    discoveredCharId: {
      fontSize: 12,
    },
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
      color: theme.muted,
    },
    muted: {
      color: theme.muted,
      fontSize: 13,
    },
  });
}
