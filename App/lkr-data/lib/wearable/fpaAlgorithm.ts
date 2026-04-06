import { EARLY_STANCE, EULER_INIT_LEN, MIDDLE_STANCE } from '@/lib/wearable/const';
import { conv1dSame, dataFilt, hanning } from '@/lib/wearable/dspSignal';
import { euler2matSxyz } from '@/lib/wearable/euler2mat';
import type { SensorData } from '@/lib/wearable/sensorTypes';

const DEG2RAD = Math.PI / 180;

function matMulVec3(m: number[][], v: number[]): number[] {
  return m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
}

/** Port of Bluetooth/FPA_algorithm.py (SciPy replaced by dspSignal). */
export class FPA {
  datarate: number;
  readonly ALPHA: number;
  FPA_this_step = 0;
  FPA_last_step = 0;
  stepDataBuffer: SensorData[] = [];
  readonly isRightFoot: boolean;

  constructor(isRightFoot: boolean, datarate = 100, alpha = 0.8) {
    this.isRightFoot = isRightFoot;
    this.datarate = datarate;
    this.ALPHA = alpha;
  }

  updateFPA(data: SensorData, gaitphaseOld: number, gaitphase: number): void {
    this.stepDataBuffer.push(data);
    if (gaitphaseOld === EARLY_STANCE && gaitphase === MIDDLE_STANCE) {
      const eulerAnglesEsti = FPA.getEulerAngles(this.stepDataBuffer, this.datarate);
      const accRotated = FPA.getRotatedAcc(this.stepDataBuffer, eulerAnglesEsti);
      const accRotatedSmoothed = FPA.smoothAccRotated(accRotated);
      let fpa = FPA.getFpaViaMaxAccRatioAtNormPeak(accRotatedSmoothed);
      if (fpa > 90) {
        fpa -= 180;
      } else if (fpa < -90) {
        fpa += 180;
      }
      this.stepDataBuffer = [];
      if (this.isRightFoot) {
        fpa = -fpa;
      }
      this.FPA_this_step = this.ALPHA * fpa + (1 - this.ALPHA) * this.FPA_last_step;
      this.FPA_last_step = this.FPA_this_step;
    }
  }

  /** Matches Python `data_filt` (Butterworth + filtfilt). */
  static dataFilt(
    data: number[],
    cutOffFre = 3.8,
    samplingFre = 100,
    filterOrder = 4,
  ): number[] {
    return dataFilt(data, cutOffFre, samplingFre, filterOrder);
  }

  static getEulerAngles(dataBuffer: SensorData[], datarate: number): number[][] {
    const deltaT = 1 / datarate;
    const dataLen = dataBuffer.length;
    const eulerAnglesEsti: number[][] = Array.from({ length: dataLen }, () => [0, 0, 0]);

    const gravityVector = [0, 0, 0];
    for (let k = 1; k <= EULER_INIT_LEN; k++) {
      const sampleData = dataBuffer[dataBuffer.length - k];
      gravityVector[0] += sampleData.AccelX;
      gravityVector[1] += sampleData.AccelY;
      gravityVector[2] += sampleData.AccelZ;
    }
    gravityVector[0] /= EULER_INIT_LEN;
    gravityVector[1] /= EULER_INIT_LEN;
    gravityVector[2] /= EULER_INIT_LEN;

    const initSample = dataLen - Math.ceil(EULER_INIT_LEN / 2);
    const g0 = gravityVector[0];
    const g1 = gravityVector[1];
    const g2 = gravityVector[2];
    const roll0 = Math.atan2(g1, g2);
    const pitch0 = Math.atan2(-g0, Math.sqrt(g1 * g1 + g2 * g2));
    for (let r = initSample; r < dataLen; r++) {
      eulerAnglesEsti[r][0] = roll0;
      eulerAnglesEsti[r][1] = pitch0;
    }

    for (let iSample = initSample - 1; iSample >= 0; iSample--) {
      const sampleData = dataBuffer[iSample];
      const sampleGyr = [
        sampleData.GyroX * DEG2RAD,
        sampleData.GyroY * DEG2RAD,
        sampleData.GyroZ * DEG2RAD,
      ];
      const next = eulerAnglesEsti[iSample + 1];
      const roll = next[0];
      const pitch = next[1];
      const yaw = next[2];
      const transferMat = [
        [1, Math.sin(roll) * Math.tan(pitch), Math.cos(roll) * Math.tan(pitch)],
        [0, Math.cos(roll), -Math.sin(roll)],
        [0, Math.sin(roll) / Math.cos(pitch), Math.cos(roll) / Math.cos(pitch)],
      ];
      const angleAugment = matMulVec3(transferMat, sampleGyr);
      eulerAnglesEsti[iSample][0] = roll - angleAugment[0] * deltaT;
      eulerAnglesEsti[iSample][1] = pitch - angleAugment[1] * deltaT;
      eulerAnglesEsti[iSample][2] = yaw - angleAugment[2] * deltaT;
    }

    return eulerAnglesEsti;
  }

  static smoothAccRotated(accRotated: number[][], smoothWinLen = 29): number[][] {
    const dataLen = accRotated.length;
    const accRotatedSmoothed: number[][] = Array.from({ length: dataLen }, () => [0, 0, 0]);
    const win = Math.min(dataLen, smoothWinLen);
    for (let iAxis = 0; iAxis < 2; iAxis++) {
      const col = accRotated.map((row) => row[iAxis]);
      const w = hanning(win);
      const sumW = w.reduce((s, v) => s + v, 0);
      const wNorm = w.map((v) => v / sumW);
      const smoothed = conv1dSame(wNorm, col);
      for (let r = 0; r < dataLen; r++) {
        accRotatedSmoothed[r][iAxis] = smoothed[r];
      }
    }
    return accRotatedSmoothed;
  }

  static getFpaViaMaxAccRatioAtNormPeak(accRotated: number[][]): number {
    const stepSampleNum = accRotated.length;
    const peakCheckStart = Math.floor(0.56 * stepSampleNum);
    const accSecondHalf = accRotated.slice(peakCheckStart);
    let maxNorm = -1;
    let maxIdx = 0;
    for (let i = 0; i < accSecondHalf.length; i++) {
      const ax = accSecondHalf[i][0];
      const ay = accSecondHalf[i][1];
      const n = Math.sqrt(ax * ax + ay * ay);
      if (n > maxNorm) {
        maxNorm = n;
        maxIdx = i;
      }
    }
    const maxAcc = accSecondHalf[maxIdx];
    return (Math.atan2(maxAcc[0], maxAcc[1]) * 180) / Math.PI;
  }

  static getRotatedAcc(stepDataBuffer: SensorData[], eulerAngles: number[][]): number[][] {
    const dataLen = stepDataBuffer.length;
    const accRotated: number[][] = Array.from({ length: dataLen }, () => [0, 0, 0]);
    for (let iSample = 0; iSample < dataLen; iSample++) {
      const sampleData = stepDataBuffer[iSample];
      const sampleAcc = [sampleData.AccelX, sampleData.AccelY, sampleData.AccelZ];
      const dcmMat = euler2matSxyz(
        eulerAngles[iSample][0],
        eulerAngles[iSample][1],
        0,
      );
      accRotated[iSample] = matMulVec3(dcmMat, sampleAcc);
    }
    return accRotated;
  }
}
