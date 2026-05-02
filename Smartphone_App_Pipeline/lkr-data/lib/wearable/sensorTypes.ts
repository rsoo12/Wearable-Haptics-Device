/** IMU sample in the same units as the Python pipeline (accel m/s², gyro deg/s). */
export type SensorData = {
  AccelX: number;
  AccelY: number;
  AccelZ: number;
  GyroX: number;
  GyroY: number;
  GyroZ: number;
};
