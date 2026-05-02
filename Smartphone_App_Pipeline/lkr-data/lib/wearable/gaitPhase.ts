import {
  EARLY_STANCE,
  LATE_STANCE,
  MIDDLE_STANCE,
  SWING,
} from '@/lib/wearable/const';
import type { SensorData } from '@/lib/wearable/sensorTypes';

function gyroMagNorm(sensorData: SensorData): number {
  const { GyroX, GyroY, GyroZ } = sensorData;
  return Math.sqrt(GyroX * GyroX + GyroY * GyroY + GyroZ * GyroZ);
}

/** Port of Bluetooth/gaitphase.py */
export class GaitPhase {
  lastStanceTime = 0.6;
  readonly middlestanceItersThreshold: number;
  readonly latestanceItersThreshold: number;
  readonly gyromagThresholdHeelstrike = 45;
  readonly gyromagThresholdToeoff = 45;
  readonly heelstrikeItersThreshold: number;
  readonly datarate: number;

  gaitphase = LATE_STANCE;
  gaitphaseOld = LATE_STANCE;
  stepCount = 0;
  itersConsecutiveBelowGyroMagThresh = 0;
  itersStance = 0;

  inFeedbackWindow = false;

  readonly fpaBuffer: number[] = [];
  fpaThisFrame = 0;
  fpaThisStep = 0;

  constructor(datarate = 50) {
    this.datarate = datarate;
    this.lastStanceTime = 0.6;
    this.middlestanceItersThreshold = this.lastStanceTime * 0.25 * datarate;
    this.latestanceItersThreshold = this.lastStanceTime * 0.5 * datarate;
    this.heelstrikeItersThreshold = 0.1 * datarate;
  }

  updateGaitphase(sensorData: SensorData): void {
    const gyroMag = gyroMagNorm(sensorData);

    if (this.gaitphase === SWING) {
      this.gaitphaseOld = SWING;
      if (gyroMag < this.gyromagThresholdHeelstrike) {
        this.itersConsecutiveBelowGyroMagThresh += 1;
        if (this.itersConsecutiveBelowGyroMagThresh > this.heelstrikeItersThreshold) {
          this.itersConsecutiveBelowGyroMagThresh = 0;
          this.itersStance = 0;
          this.stepCount += 1;
          this.gaitphase = EARLY_STANCE;
        }
      } else {
        this.itersConsecutiveBelowGyroMagThresh = 0;
      }
    } else if (this.gaitphase === EARLY_STANCE) {
      this.gaitphaseOld = EARLY_STANCE;
      this.itersStance += 1;
      if (this.itersStance > this.middlestanceItersThreshold) {
        this.gaitphase = MIDDLE_STANCE;
      }
    } else if (this.gaitphase === MIDDLE_STANCE) {
      this.gaitphaseOld = MIDDLE_STANCE;
      this.itersStance += 1;
      if (this.itersStance > this.latestanceItersThreshold) {
        this.gaitphase = LATE_STANCE;
      }
    } else if (this.gaitphase === LATE_STANCE) {
      this.gaitphaseOld = LATE_STANCE;
      this.itersStance += 1;
      if (gyroMag > this.gyromagThresholdToeoff) {
        this.lastStanceTime = this.itersStance / this.datarate;
        if (this.lastStanceTime > 2) {
          this.lastStanceTime = 2;
        } else if (this.lastStanceTime < 0.4) {
          this.lastStanceTime = 0.4;
        }
        this.gaitphase = SWING;
      }
    }

    this.inFeedbackWindow =
      this.gaitphaseOld === MIDDLE_STANCE && this.gaitphase === LATE_STANCE;
  }
}
