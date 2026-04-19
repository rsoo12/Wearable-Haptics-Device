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
CALIBRATION = False

os.makedirs("output", exist_ok=True)
CSV_FILE = f"output/fpa_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"


def parse_payload(payload: bytes):
    if len(payload) < 24:
        return None
    ax, ay, az, gx, gy, gz = struct.unpack_from('<6f', payload)
    acc = [ax, ay, az]
    gyr = [gx, gy, gz]
    return gyr, acc


CALIBRATION_DURATION = 60  # seconds

def lra_feedback(diff, cmd_queue: asyncio.Queue):
    # Positive diff → FPA below baseline (toe-in) → drv2
    # Negative diff → FPA above baseline (toe-out) → drv1
    if diff < -12:
        drv = 2 #right
    elif diff > -8:
        drv = 1 #left
    else:
        return None  # within threshold, no feedback

    # if diff < -14:
    #     drv = 2 #right
    # elif diff > -6:
    #     drv = 1 #left
    # else:
    #     return None 
    direction = "toe-in (drv2)" if drv == 2 else "toe-out (drv1)"
    cmd = f"{drv}52"
    print(f"[LRA Feedback] diff={diff:.2f} deg → {direction} → cmd='{cmd}'")
    cmd_queue.put_nowait(cmd)
    return cmd

async def fpa_consumer(packet_queue: asyncio.Queue, gp: GaitPhase, fpa: FPA, writer: csv.writer, cmd_queue: asyncio.Queue):
    start_time = asyncio.get_running_loop().time()
    calibration_fpas = []
    calibrating = CALIBRATION
    seen_steps = set()

    base = None
    if not calibrating:
        with open("base_fpa.csv", "r", newline="") as cal_f:
            cal_reader = csv.reader(cal_f)
            next(cal_reader)  # skip header
            base = float(next(cal_reader)[0])
        print(f"Loaded base FPA: {base:.2f} deg")

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
        row_acc = [f"{acc[0]:.4f}", f"{acc[1]:.4f}", f"{acc[2]:.4f}"]
        row_gyr = [f"{gyr[0]:.4f}", f"{gyr[1]:.4f}", f"{gyr[2]:.4f}"]

        if calibrating:
            elapsed = asyncio.get_running_loop().time() - start_time

            if gp.in_feedback_window and gp.step_count not in seen_steps:
                seen_steps.add(gp.step_count)
                calibration_fpas.append(fpa.FPA_this_step)
                print(f"[Calibration] Step {gp.step_count}: FPA = {fpa.FPA_this_step:.1f} deg  elapsed={elapsed:.1f}s")

            if elapsed >= CALIBRATION_DURATION:
                if calibration_fpas:
                    avg_fpa = sum(calibration_fpas) / len(calibration_fpas)
                    with open("base_fpa.csv", "w", newline="") as cal_f:
                        cal_writer = csv.writer(cal_f)
                        cal_writer.writerow(["base_fpa"])
                        cal_writer.writerow([f"{avg_fpa:.4f}"])
                    print(f"Calibration complete. Average FPA = {avg_fpa:.2f} deg ({len(calibration_fpas)} steps) written to base_fpa.csv")
                    base = avg_fpa
                else:
                    print("Calibration complete but no FPA values were collected.")
                    return

                # Switch to feedback mode
                calibrating = False
                seen_steps = set()
                print("Starting feedback...")
        else:
            if gp.in_feedback_window and gp.step_count not in seen_steps:
                seen_steps.add(gp.step_count)
                print(f"Step {gp.step_count}: FPA = {fpa.FPA_this_step:.1f} deg  rate={rate:.1f} Hz")

                diff = fpa.FPA_this_step - base
                cmd = lra_feedback(diff, cmd_queue)
                if cmd is not None:
                    drv_id, effect = cmd[0], cmd[1:]
                    writer.writerow([ts, gp.step_count, f"{fpa.FPA_this_step:.1f}", f"DRV{drv_id}", effect] + row_acc + row_gyr)
                else:
                    writer.writerow([ts, gp.step_count, f"{fpa.FPA_this_step:.1f}", "", ""] + row_acc + row_gyr)

            else:
                writer.writerow([ts, "", "", "", ""] + row_acc + row_gyr)


async def main():
    addresses = await find_devices()
    if not addresses:
        print("Device not found.")
        return
    elif len(addresses) == 1:
        print("Only one device connected.")
    elif len(addresses) == 2:
        print(f"Both devices connected! {', '.join(f'{name} ({addr})' for addr, name in addresses)}")

    packet_queue = asyncio.Queue()
    cmd_queue = asyncio.Queue()
    gp  = GaitPhase(datarate=DATA_RATE)
    fpa = FPA(is_right_foot=IS_RIGHT_FOOT, datarate=DATA_RATE)

    conn = BLEConnection(packet_queue=packet_queue)
    lra_conn = BLEConnection()

    imu_mcu, lra_mcu = None, None

    for addr, name in addresses:
        if name == "CIRCUITPY4f33":
            imu_mcu = addr
            print("Assigned imu_mcu address")
        elif name == "CIRCUITPY9391":
            lra_mcu = addr
            print("Assigned lra_mcu address")

    if lra_mcu == None:
        print("Did not connect to LRA")
        return

    if imu_mcu == None:
        print("Did not connect to IMU")
        return

    with open(CSV_FILE, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["time", "step num", "fpa", "drv", "effect", "ax (m/s2)", "ay (m/s2)", "az (m/s2)", "gx (rad/s)", "gy (rad/s)", "gz (rad/s)"])
        await asyncio.gather(
            conn.connect_and_read(imu_mcu),
            lra_conn.connect_and_write(lra_mcu, cmd_queue),
            fpa_consumer(packet_queue, gp, fpa, writer, cmd_queue),
        )

if __name__ == "__main__":
    asyncio.run(main())
