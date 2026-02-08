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

import array
import time

import audiocore
import audiopwmio
import board

from seeed_xiao_nrf52840 import IMU, Mic, Battery

with IMU() as imu:
    while True:
        print("Acceleration:", imu.acceleration)
        time.sleep(1)

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


#*****************************************************************************# 
# SAMPLE CODE: Turns on LED
#*****************************************************************************# 

#https://wiki.seeedstudio.com/XIAO-BLE_CircutPython/ 

# """Example for Seeed Studio XIAO nRF52840. Blinks the built-in LED."""
# import time
# import board
# import digitalio

# led = digitalio.DigitalInOut(board.LED_GREEN)
# led.direction = digitalio.Direction.OUTPUT

# while True:
#     led.value = True
    
