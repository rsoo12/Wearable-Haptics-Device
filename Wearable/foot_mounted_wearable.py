# #*****************************************************************************# 
# # Sends bluetooth signal to LightBlue App on phone
# #*****************************************************************************# 

# https://www.ubiqueiot.com/posts/xiao-circuitpy-ble

from adafruit_ble import BLERadio
from adafruit_ble.advertising.standard import ProvideServicesAdvertisement
from adafruit_ble.services.nordic import UARTService
import digitalio
import board
import time
import busio
from adafruit_lsm6ds.lsm6ds3trc import LSM6DS3TRC
import adafruit_drv2605
import adafruit_tca9548a
import struct

ble = BLERadio()
uart = UARTService()
advertisement = ProvideServicesAdvertisement(uart)

led = digitalio.DigitalInOut(board.LED_BLUE)
led.direction = digitalio.Direction.OUTPUT

imupwr = digitalio.DigitalInOut(board.IMU_PWR)
imupwr.direction = digitalio.Direction.OUTPUT
imupwr.value = True
time.sleep(0.1)
imu_i2c = busio.I2C(board.IMU_SCL, board.IMU_SDA)
sensor = LSM6DS3TRC(imu_i2c)
ble.start_advertising(advertisement)

seq = 0
while True:
    if ble.connected:
        led.value = False
        accel_x, accel_y, accel_z = sensor.acceleration
        gyro_x, gyro_y, gyro_z = sensor.gyro
        payload = struct.pack('<6f', accel_x, accel_y, accel_z, gyro_x, gyro_y, gyro_z)
        uart.write(payload)
        time.sleep(1/160)  # 140 Hz
    else:
        led.value = True
        if not ble.advertising:
            ble.start_advertising(advertisement)

