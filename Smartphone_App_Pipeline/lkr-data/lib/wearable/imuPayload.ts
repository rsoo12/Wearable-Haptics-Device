import type { SensorData } from '@/lib/wearable/sensorTypes';

const RAD2DEG = 180 / Math.PI;

/**
 * Decode 24 bytes: 6 little-endian float32 [ax, ay, az, gx, gy, gz]
 * (accel m/s², gyro rad/s) — same as Bluetooth/vqf_processor.parse_payload.
 */
export function parseImuPayload(payload: ArrayBufferView): {
  acc: [number, number, number];
  gyrRad: [number, number, number];
} | null {
  const buf =
    payload instanceof Uint8Array
      ? payload
      : new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
  if (buf.byteLength < 24) {
    return null;
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, 24);
  const ax = dv.getFloat32(0, true);
  const ay = dv.getFloat32(4, true);
  const az = dv.getFloat32(8, true);
  const gx = dv.getFloat32(12, true);
  const gy = dv.getFloat32(16, true);
  const gz = dv.getFloat32(20, true);
  return { acc: [ax, ay, az], gyrRad: [gx, gy, gz] };
}

export function imuPayloadToSensorData(payload: ArrayBufferView): SensorData | null {
  const p = parseImuPayload(payload);
  if (!p) return null;
  const [ax, ay, az] = p.acc;
  const [gx, gy, gz] = p.gyrRad;
  return {
    AccelX: ax,
    AccelY: ay,
    AccelZ: az,
    GyroX: gx * RAD2DEG,
    GyroY: gy * RAD2DEG,
    GyroZ: gz * RAD2DEG,
  };
}

/** react-native-ble-plx passes base64; Hermes provides `atob`. */
export function base64ToUint8Array(b64: string): Uint8Array {
  if (typeof atob !== 'function') {
    throw new Error('atob is not available in this runtime');
  }
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}
