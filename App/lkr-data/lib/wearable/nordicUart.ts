/** Nordic UART Service (matches Bluetooth/bluetooth.py). */
import { encode as btoa } from 'base-64';
import type { BleManager, Device, Service } from 'react-native-ble-plx';

export const NORDIC_UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NORDIC_UART_TX_CHAR_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';
export const NORDIC_UART_RX_CHAR_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

export const DEVICE_NAME_PREFIX = 'CIRCUITPY';

export type NordicConnectedDevice = {
  device: Device;
  rxServiceUUID: string;
};

type FindDevicesOptions = {
  namePrefix?: string;
  scanMs?: number;
};

/**
 * Scan for BLE peripherals and return all matches (Python parity with `find_devices`).
 */
export function findNordicDevices(
  manager: BleManager,
  options?: FindDevicesOptions,
): Promise<Device[]> {
  const namePrefix = options?.namePrefix ?? DEVICE_NAME_PREFIX;
  const scanMs = options?.scanMs ?? 5000;

  return new Promise((resolve, reject) => {
    const foundById = new Map<string, Device>();
    let settled = false;

    const finish = (outcome: 'resolve' | 'reject', payload?: Device[] | Error) => {
      if (settled) return;
      settled = true;
      manager.stopDeviceScan();
      if (outcome === 'resolve') {
        resolve((payload as Device[]) ?? []);
      } else {
        reject(payload);
      }
    };

    manager.startDeviceScan(null, null, (scanError, device) => {
      if (scanError) {
        finish('reject', new Error(scanError.message));
        return;
      }
      if (!device?.name) return;
      if (!device.name.startsWith(namePrefix)) return;
      foundById.set(device.id, device);
    });

    setTimeout(() => {
      finish('resolve', [...foundById.values()]);
    }, scanMs);
  });
}

export async function findNordicRxServiceUUID(device: Device): Promise<string> {
  const services: Service[] = await device.services();
  for (const service of services) {
    const characteristics = await service.characteristics();
    const hasRx = characteristics.some(char => char.uuid.toLowerCase() === NORDIC_UART_RX_CHAR_UUID);
    if (hasRx) {
      return service.uuid;
    }
  }
  throw new Error(`Could not find RX characteristic ${NORDIC_UART_RX_CHAR_UUID} on connected device.`);
}

export async function connectNordicDevices(
  manager: BleManager,
  devices: Device[],
): Promise<NordicConnectedDevice[]> {
  const connected: NordicConnectedDevice[] = [];

  for (const device of devices) {
    try {
      const current = await manager.connectToDevice(device.id, { timeout: 10000 });
      await current.discoverAllServicesAndCharacteristics();
      const rxServiceUUID = await findNordicRxServiceUUID(current);
      connected.push({ device: current, rxServiceUUID });
    } catch {
      // Ignore per-device failures so one bad peripheral does not block others.
    }
  }

  return connected;
}

/**
 * Write UTF-8 / binary-safe bytes to Nordic UART TX (same pattern as the BLE console test page).
 * MCU README: byte 0x61 / 0x62 select vibration patterns; ASCII `"a"` / `"b"` encodes those bytes.
 */
export async function writeNordicUartTx(
  manager: BleManager,
  deviceId: string,
  payload: string,
  serviceUUID?: string | null,
): Promise<void> {
  const base64Payload = btoa(payload);
  const writeServiceUUID = serviceUUID ?? NORDIC_UART_SERVICE_UUID;
  try {
    // Match Python path (Bleak write with response=False) for best compatibility.
    await manager.writeCharacteristicWithoutResponseForDevice(
      deviceId,
      writeServiceUUID,
      NORDIC_UART_TX_CHAR_UUID,
      base64Payload,
    );
  } catch {
    // Fallback for devices that require acknowledged writes.
    await manager.writeCharacteristicWithResponseForDevice(
      deviceId,
      writeServiceUUID,
      NORDIC_UART_TX_CHAR_UUID,
      base64Payload,
    );
  }
}
