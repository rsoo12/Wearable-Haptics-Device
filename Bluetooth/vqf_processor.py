import asyncio
import struct
import math
import csv
import os
from datetime import datetime

from FPA_algorithm import FPA
from gaitphase import GaitPhase

from bluetooth import find_devices, BLEConnection
 
IS_RIGHT_FOOT = True  
DATA_RATE = 100  # Hz

os.makedirs("output", exist_ok=True)
CSV_FILE = f"output/fpa_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"


def parse_payload(payload: bytes):
    if len(payload) < 24:
        return None
    ax, ay, az, gx, gy, gz = struct.unpack_from('<6f', payload)
    acc = [ax, ay, az]
    gyr = [gx, gy, gz]
    return gyr, acc


async def fpa_consumer(packet_queue: asyncio.Queue, gp: GaitPhase, fpa: FPA, writer: csv.writer):
    while True:
        payload, rate, ts = await packet_queue.get()

        parsed = parse_payload(payload)
        if parsed is None:
            print(f"could not parse payload")
            continue

        gyr, acc = parsed

        # Expected payload format from MCU:
        #   6 little-endian 32-bit floats = 24 bytes total
        #   [ax, ay, az, gx, gy, gz]
        #   ax/ay/az: accelerometer in m/s²
        #   gx/gy/gz: gyroscope in rad/s

        # convert gyro from rad/s to deg/s for FPA algorithm
        sensor_data = {
            "AccelX": acc[0], "AccelY": acc[1], "AccelZ": acc[2],
            "GyroX": math.degrees(gyr[0]),
            "GyroY": math.degrees(gyr[1]),
            "GyroZ": math.degrees(gyr[2]),
        }

        gp.update_gaitphase(sensor_data)
        fpa.update_FPA(sensor_data, gp.gaitphase_old, gp.gaitphase)

        #RIGHT NOW WE PRINT. BUT LATER, WE RUN SCRIPT THAT SENDS VIB FEEDBACK COMMANDS TO SHANK COMPONENT
        if gp.in_feedback_window:
            print(f"Step {gp.step_count}: FPA = {fpa.FPA_this_step:.1f} deg  rate={rate:.1f} Hz")
            writer.writerow([ts, gp.step_count, f"{fpa.FPA_this_step:.1f}"])
        else:
            writer.writerow([ts, "", ""])


async def main():
    address = await find_devices()
    if not address:
        print("Device not found.")
        return

    print("Connected!")
    packet_queue = asyncio.Queue()
    gp  = GaitPhase(datarate=DATA_RATE)
    fpa = FPA(is_right_foot=IS_RIGHT_FOOT, datarate=DATA_RATE)

    conn = BLEConnection(packet_queue=packet_queue)

    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["time", "step num", "fpa"])
        await asyncio.gather(
            conn.connect_and_read(address[0]),
            fpa_consumer(packet_queue, gp, fpa, writer),
        )

if __name__ == "__main__":
    asyncio.run(main())
