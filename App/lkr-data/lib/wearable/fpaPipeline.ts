import { FPA } from '@/lib/wearable/fpaAlgorithm';
import { GaitPhase } from '@/lib/wearable/gaitPhase';
import {
  base64ToUint8Array,
  imuPayloadToSensorData,
} from '@/lib/wearable/imuPayload';
import type { SensorData } from '@/lib/wearable/sensorTypes';

export type FpaPipelineOutput = {
  sensorData: SensorData;
  /** Estimated notification rate (Hz), trailing window. */
  rateHz: number;
  inFeedbackWindow: boolean;
  /** True only on the sample where a new per-step FPA is computed. */
  fpaUpdated: boolean;
  /** Monotonic counter for each computed per-step FPA update. */
  fpaUpdateCount: number;
  stepCount: number;
  fpaThisStepDeg: number;
  /** Process-wide run counter, survives multiple pipeline runs. */
  globalRunNumber: number;
};

/**
 * On-device equivalent of Bluetooth/vqf_processor.py consumer loop
 * (without asyncio / BLE — feed bytes or base64 from your monitor callback).
 */
export class FpaPipeline {
  gaitPhase: GaitPhase;
  fpa: FPA;
  private readonly timestamps: number[] = [];
  private readonly windowSize: number;
  private readonly globalRunNumber: number;
  private fpaUpdateCount = 0;

  constructor(options?: {
    datarate?: number;
    isRightFoot?: boolean;
    rateWindow?: number;
    globalRunNumber?: number;
  }) {
    const dr = options?.datarate ?? 180;
    this.windowSize = options?.rateWindow ?? 50;
    this.gaitPhase = new GaitPhase(dr);
    this.fpa = new FPA(options?.isRightFoot ?? true, dr);
    this.globalRunNumber = options?.globalRunNumber ?? 1;
  }

  private calcRate(monoSec: number): number {
    this.timestamps.push(monoSec);
    if (this.timestamps.length > this.windowSize) {
      this.timestamps.shift();
    }
    if (this.timestamps.length < 2) {
      return 0;
    }
    const elapsed = this.timestamps[this.timestamps.length - 1] - this.timestamps[0];
    if (elapsed <= 0) {
      return 0;
    }
    return (this.timestamps.length - 1) / elapsed;
  }

  /** One IMU notification after gyro rad/s → deg/s conversion inside. */
  processSensorData(sensorData: SensorData, monoSec: number): FpaPipelineOutput {
    const gp = this.gaitPhase;
    const fpa = this.fpa;
    const rateHz = this.calcRate(monoSec);
    gp.updateGaitphase(sensorData);
    const fpaUpdated = fpa.updateFPA(sensorData, gp.gaitphaseOld, gp.gaitphase);
    if (fpaUpdated) {
      this.fpaUpdateCount += 1;
    }
    return {
      sensorData,
      rateHz,
      inFeedbackWindow: gp.inFeedbackWindow,
      fpaUpdated,
      fpaUpdateCount: this.fpaUpdateCount,
      stepCount: gp.stepCount,
      fpaThisStepDeg: fpa.FPA_this_step,
      globalRunNumber: this.globalRunNumber,
    };
  }

  processPayloadBytes(payload: Uint8Array, monoSec: number): FpaPipelineOutput | null {
    const sensorData = imuPayloadToSensorData(payload);
    if (!sensorData) {
      return null;
    }
    return this.processSensorData(sensorData, monoSec);
  }

  /** Value from `characteristic.value` (base64) on react-native-ble-plx. */
  processPayloadBase64(b64: string | null | undefined, monoSec: number): FpaPipelineOutput | null {
    if (!b64) {
      return null;
    }
    return this.processPayloadBytes(base64ToUint8Array(b64), monoSec);
  }

  reset(): void {
    this.timestamps.length = 0;
    const dr = this.gaitPhase.datarate;
    const isRf = this.fpa.isRightFoot;
    this.gaitPhase = new GaitPhase(dr);
    this.fpa = new FPA(isRf, dr);
    this.fpaUpdateCount = 0;
  }
}
