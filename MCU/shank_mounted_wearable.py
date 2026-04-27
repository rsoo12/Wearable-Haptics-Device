# #*****************************************************************************# 
# # Sends bluetooth signal to LightBlue App on phone
# #*****************************************************************************# 

# # https://www.ubiqueiot.com/posts/xiao-circuitpy-ble
from adafruit_ble import BLERadio
from adafruit_ble.advertising.standard import ProvideServicesAdvertisement
from adafruit_ble.services.nordic import UARTService
import digitalio
import board
import time
import busio
from adafruit_lsm6ds.lsm6ds3trc import LSM6DS3TRC
import adafruit_tca9548a
import struct

_DRV_ADDR = 0x5A

# Calibrated per-device values — limits set by auto-calibration, do not raise
_CAL = {
    1: {"rated_voltage": 0x24, "od_clamp": 0x4C, "a_cal_comp": 0x0E, "a_cal_bemf": 0xB6, "bemf_gain": 1},
    2: {"rated_voltage": 0x24, "od_clamp": 0x4C, "a_cal_comp": 0x10, "a_cal_bemf": 0xC2, "bemf_gain": 1},
}

def _drv_write(ch, reg, val):
    while not ch.try_lock():
        pass
    try:
        ch.writeto(_DRV_ADDR, bytes([reg, val]))
    finally:
        ch.unlock()

def drv_init(ch, cal):
    _drv_write(ch, 0x01, 0x00)                               # standby
    _drv_write(ch, 0x03, 0x06)                               # LRA library
    _drv_write(ch, 0x1A, 0xB4 | (cal["bemf_gain"] & 0x03))  # FEEDBACK: LRA mode, brake=3x, BEMF_GAIN
    _drv_write(ch, 0x16, cal["rated_voltage"])               # RATED_VOLTAGE
    _drv_write(ch, 0x17, cal["od_clamp"])                    # OD_CLAMP (calibrated limit)
    _drv_write(ch, 0x18, cal["a_cal_comp"])                  # A_CAL_COMP
    _drv_write(ch, 0x19, cal["a_cal_bemf"])                  # A_CAL_BEMF
    _drv_write(ch, 0x01, 0x05)                               # RTP mode
    _drv_write(ch, 0x02, 0x00)                               # RTP input = 0 (idle)

def drv_buzz(ch, duration=0.5):
    _drv_write(ch, 0x02, 0x7F)  # RTP = 0x7F (full scale within calibrated limits)
    time.sleep(duration)
    _drv_write(ch, 0x02, 0x00)  # stop

ble = BLERadio()
uart = UARTService()
advertisement = ProvideServicesAdvertisement(uart)

led = digitalio.DigitalInOut(board.LED_BLUE)
led.direction = digitalio.Direction.OUTPUT

imupwr = digitalio.DigitalInOut(board.IMU_PWR)
imupwr.direction = digitalio.Direction.OUTPUT
imupwr.value = True
time.sleep(0.1)
i2c = board.I2C()  
imu_i2c = busio.I2C(board.IMU_SCL, board.IMU_SDA)
sensor = LSM6DS3TRC(imu_i2c)

mux = adafruit_tca9548a.PCA9546A(i2c)
drv_init(mux[1], _CAL[1])
drv_init(mux[2], _CAL[2])

ble.start_advertising(advertisement)

seq = 0
while True:
    # drv1.sequence[0] = adafruit_drv2605.Effect(1)
    # drv1.play()
    if ble.connected:
        led.value = False 
        waiting = uart.in_waiting
        if waiting:
            received = uart.read(waiting)
            if received is not None:
                try:
                    received_str = received.decode("utf-8").strip()
                except Exception as e:
                    print(f"Error decoding UART data: {e}")
                    received_str = None
                print(f"Received: {received_str}")
                
                
                try:
                    drv_id = int(received_str[0])
                    if drv_id == 1:
                        drv_buzz(mux[1])
                    elif drv_id == 2:
                        drv_buzz(mux[2])
                    else:
                        print(f"Unknown driver: {drv_id}")
                except Exception as e:
                    print(f"Error parsing command '{received_str}': {e}")
    else:
        led.value = True
        if not ble.advertising:
            ble.start_advertising(advertisement)


#*****************************************************************************# 
# Uses the ADAFRUIT LSM6DS3TR-C IMU to read acceleration and gyro data. (WITH MUX)
#*****************************************************************************# 

# https://learn.adafruit.com/adafruit-lsm6ds3tr-c-6-dof-accel-gyro-imu/python-circuitpython

# import time

# import board
# import busio
# import digitalio

# # For haptic drivers and I2C mux
# import adafruit_drv2605
# import adafruit_tca9548a


# i2c = board.I2C()  # uses board.SCL and board.SDA
# # Main I2C bus for mux and haptic drivers
# mux = adafruit_tca9548a.PCA9546A(i2c)

# # Initialize two DRV2605 haptic drivers
# drv1 = adafruit_drv2605.DRV2605(mux[3])
# # drv2 = adafruit_drv2605.DRV2605(mux[0])
# drv3 = adafruit_drv2605.DRV2605(mux[1])

# from adafruit_lsm6ds.lsm6ds3trc import LSM6DS3TRC

# # On the Seeed XIAO nRF52840 Sense the LSM6DS3TR-C IMU is connected on a separate
# # I2C bus and it has its own power pin that we need to enable.
# imupwr = digitalio.DigitalInOut(board.IMU_PWR)
# imupwr.direction = digitalio.Direction.OUTPUT
# imupwr.value = True
# time.sleep(0.1)

# # imu_i2c = busio.I2C(board.IMU_SCL, board.IMU_SDA)
# # sensor = LSM6DS3TRC(imu_i2c)

# while True:
#     # accel_x, accel_y, accel_z = sensor.acceleration
#     # print(f"Acceleration: X:{accel_x:.2f}, Y: {accel_y:.2f}, Z: {accel_z:.2f} m/s^2")
#     # gyro_x, gyro_y, gyro_z = sensor.gyro
#     # print(f"Gyro X:{gyro_x:.2f}, Y: {gyro_y:.2f}, Z: {gyro_z:.2f} radians/s")
#     # print("")
#     # time.sleep(0.5)

   
#     drv1.sequence[0] = adafruit_drv2605.Effect(52)
#     drv1.play()
#     time.sleep(0.5)
#     # drv2.sequence[0] = adafruit_drv2605.Effect(52)
#     # drv2.play()
#     # time.sleep(0.5)
#     drv3.sequence[0] = adafruit_drv2605.Effect(52)
#     drv3.play()
#     time.sleep(0.5)
#     drv1.sequence[0] = adafruit_drv2605.Effect(52)
#     drv1.play()
#     time.sleep(0.5)
#     # drv2.sequence[0] = adafruit_drv2605.Effect(52)
#     # drv2.play()
#     # time.sleep(0.5)
#     drv3.sequence[0] = adafruit_drv2605.Effect(52)
#     drv3.play()
#     time.sleep(0.5)

#*****************************************************************************# 
# Uses the SEED XIAO NRF52840 library to read acceleration data (simpler than above code, same purpose)
#*****************************************************************************# 


# https://github.com/furbrain/CircuitPython_seeed_xiao_nRF52840

# import array
# import time

# import audiocore
# import audiopwmio
# import board

# from seeed_xiao_nrf52840 import IMU, Mic, Battery

# with IMU() as imu:
#     while True:
#         print("Acceleration:", imu.acceleration)
#         time.sleep(1)

#*****************************************************************************# 
# Vibration driving code using the ADAFRUIT DRV2605 Haptic Controller, need to check 
# if this works with connected haptic controller
#*****************************************************************************# 

# https://learn.adafruit.com/adafruit-drv2605-haptic-controller-breakout/python-circuitpython
# import board
# import busio
# import adafruit_drv2605
# i2c = busio.I2C(board.SCL, board.SDA)
# drv = adafruit_drv2605.DRV2605(i2c)  

# drv.use_LRM()  

# drv.sequence[0] = adafruit_drv2605.Effect(1)
# drv.sequence[1] = adafruit_drv2605.Pause(0.5)
# drv.sequence[2] = adafruit_drv2605.Effect(47)
# drv.sequence[3] = adafruit_drv2605.Effect(0)
# drv.play()
#ctrl-d runs the code LOL 



#*****************************************************************************# 
# Uses the ADAFRUIT LSM6DS3TR-C IMU to read acceleration and gyro data.
#*****************************************************************************# 

# https://learn.adafruit.com/adafruit-lsm6ds3tr-c-6-dof-accel-gyro-imu/python-circuitpython

# import time

# import board
# import busio
# import digitalio

# from adafruit_lsm6ds.lsm6ds3trc import LSM6DS3TRC

# # On the Seeed XIAO nRF52840 Sense the LSM6DS3TR-C IMU is connected on a separate
# # I2C bus and it has its own power pin that we need to enable.
# imupwr = digitalio.DigitalInOut(board.IMU_PWR)
# imupwr.direction = digitalio.Direction.OUTPUT
# imupwr.value = True
# time.sleep(0.1)

# imu_i2c = busio.I2C(board.IMU_SCL, board.IMU_SDA)
# sensor = LSM6DS3TRC(imu_i2c)

# while True:
#     accel_x, accel_y, accel_z = sensor.acceleration
#     print(f"Acceleration: X:{accel_x:.2f}, Y: {accel_y:.2f}, Z: {accel_z:.2f} m/s^2")
#     gyro_x, gyro_y, gyro_z = sensor.gyro
#     print(f"Gyro X:{gyro_x:.2f}, Y: {gyro_y:.2f}, Z: {gyro_z:.2f} radians/s")
#     print("")
#     time.sleep(0.5)


#*****************************************************************************# 
# Uses the SEED XIAO NRF52840 library to read acceleration data (simpler than above code, same purpose)
#*****************************************************************************# 


# https://github.com/furbrain/CircuitPython_seeed_xiao_nRF52840

# import array
# import time

# import audiocore
# import audiopwmio
# import board

# from seeed_xiao_nrf52840 import IMU, Mic, Battery

# with IMU() as imu:
#     while True:
#         print("Acceleration:", imu.acceleration)
#         time.sleep(1)

#*****************************************************************************# 
# Vibration driving code using the ADAFRUIT DRV2605 Haptic Controller, need to check 
# if this works with connected haptic controller
#*****************************************************************************# 

# https://learn.adafruit.com/adafruit-drv2605-haptic-controller-breakout/python-circuitpython


# import board
# import busio
# import adafruit_drv2605
# i2c = busio.I2C(board.SCL, board.SDA)
# drv = adafruit_drv2605.DRV2605(i2c)  

# drv.use_LRM()  

# drv.sequence[0] = adafruit_drv2605.Effect(1)
# drv.sequence[1] = adafruit_drv2605.Pause(0.5)
# drv.sequence[2] = adafruit_drv2605.Effect(47)
# drv.sequence[3] = adafruit_drv2605.Effect(0)
# drv.play()

# SPDX-FileCopyrightText: 2017 Tony DiCola for Adafruit Industries
# SPDX-License-Identifier: MIT

# Simple demo of the DRV2605 haptic feedback motor driver.
# Will play all 123 effects in order for about a half second each.


#*****************************************************************************# 
# SAMPLE CODE: Turns on LED
#*****************************************************************************# 

#https://wiki.seeedstudio.com/XIAO-BLE_CircutPython/ 

# """Example for Seeed Studio XIAO nRF52840. Blinks the built-in LED."""
# import time
# import board
# import digitalio

# led = digitalio.DigitalInOut(board.LED_BLUE)
# led.direction = digitalio.Direction.OUTPUT

# while True:
#     led.value = False

#*****************************************************************************# 
# SAMPLE CODE: Turns on LED
#*****************************************************************************# 

#https://wiki.seeedstudio.com/XIAO-BLE_CircutPython/ 

# """Example for Seeed Studio XIAO nRF52840. Blinks the built-in LED."""
# import time
# import board
# import digitalio

# led = digitalio.DigitalInOut(board.LED_BLUE)
# led.direction = digitalio.Direction.OUTPUT

# while True:
#     led.value = False
