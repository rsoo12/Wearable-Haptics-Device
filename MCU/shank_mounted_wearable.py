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
