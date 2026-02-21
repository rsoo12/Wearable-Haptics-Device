import asyncio
import time
from collections import deque
from bleak import BleakScanner, BleakClient

DEVICE_NAME   = "CIRCUITPY"
CHAR_UUID_TX  = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # write to device
CHAR_UUID_RX  = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # receive from device

async def find_device(name_prefix=DEVICE_NAME):
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover()
    print(f"Found {len(devices)} device(s):")
    for device in devices:
        print(f"  {device.name} ({device.address})")
    for device in devices:
        if device.name and device.name.startswith(name_prefix):
            print(f"Matched target device: {device.name} ({device.address})")
            return device.address
    return None

async def print_services(client):
    print("Available services and characteristics:")
    for service in client.services:
        print(f"  Service: {service.uuid}")
        for char in service.characteristics:
            print(f"    Characteristic: {char.uuid}  properties: {char.properties}")

last_seq = None
dropped_total = 0
timestamps = deque(maxlen=50)  # sliding window of last 50 packet arrival times

def handle_notify(sender, data):
    global last_seq, dropped_total

    timestamps.append(time.monotonic())

    seq = int.from_bytes(data[:2], "little")
    payload = data[2:]

    if last_seq is not None:
        expected = (last_seq + 1) % 65536
        if seq != expected:
            dropped = (seq - last_seq - 1) % 65536
            dropped_total += dropped
            print(f"DROPPED {dropped} (seq {last_seq} -> {seq}) total dropped: {dropped_total}")

    last_seq = seq

    rate = 0.0
    if len(timestamps) >= 2:
        elapsed = timestamps[-1] - timestamps[0]
        if elapsed > 0:
            rate = (len(timestamps) - 1) / elapsed

    print(f"seq={seq}  rate={rate:.1f} Hz  data={payload}")

async def connect_and_read(address):
    async with BleakClient(address) as client:
        await asyncio.sleep(0.15)
        await client.start_notify(CHAR_UUID_RX, handle_notify)
        print("Listening for notifications... (Ctrl+C to stop)")
        while True:
            await asyncio.sleep(1)

async def main():
    address = await find_device()
    if address:
        print("Connected!")
        await connect_and_read(address)
    else:
        print("Device not found.")

if __name__ == "__main__":
    asyncio.run(main())
