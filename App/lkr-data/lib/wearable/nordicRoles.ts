import type { Device } from 'react-native-ble-plx';

/**
 * When two CIRCUITPY peripherals are present, we assign roles in **stable BLE id order**
 * (lexicographic): first = IMU stream for FPA (phone subscribes to Nordic UART RX),
 * second = haptics actuator (phone writes Nordic UART TX). With a single device, only
 * the FPA role is used.
 */
export function assignReceiverAndSenderDevices<T extends { device: Device }>(
  connected: T[],
): { receiver: T; sender: T | null } {
  const findByName = (name: string) =>
    connected.find(entry => (entry.device.name ?? '').toUpperCase() === name.toUpperCase()) ?? null;
  const knownImu = findByName('CIRCUITPY4F33');
  const knownLra = findByName('CIRCUITPY9391');
  if (knownImu && knownLra) {
    return { receiver: knownImu, sender: knownLra };
  }

  const ordered = [...connected].sort((a, b) => a.device.id.localeCompare(b.device.id));
  if (ordered.length === 0) {
    throw new Error('No connected devices');
  }
  return {
    receiver: ordered[0],
    sender: ordered.length > 1 ? ordered[1] : null,
  };
}

export function labelDevice(d: Device): string {
  return `${d.name ?? 'Unnamed'} (${d.id})`;
}
