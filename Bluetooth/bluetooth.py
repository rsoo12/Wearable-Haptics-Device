import asyncio
import time
from collections import deque
from bleak import BleakScanner, BleakClient

DEVICE_NAME  = "CIRCUITPY"
CHAR_UUID_TX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  # write to device
CHAR_UUID_RX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  # receive from device


async def find_devices(name_prefix=DEVICE_NAME):
    print("Scanning for BLE devices...")
    devices = await BleakScanner.discover()
    print(f"Found {len(devices)} device(s):")
    for device in devices:
        print(f"  {device.name} ({device.address})")
    matches = [d.address for d in devices if d.name and d.name.startswith(name_prefix)]
    for addr in matches:
        print(f"Matched target device: {addr}")
    return matches


class BLEConnection:
    def __init__(self, packet_queue=None):
        self.packet_queue = packet_queue
        self.timestamps = deque(maxlen=50)

    def calc_packet_rate(self):
        if len(self.timestamps) < 2:
            return 0.0
        elapsed = self.timestamps[-1] - self.timestamps[0]
        return (len(self.timestamps) - 1) / elapsed if elapsed > 0 else 0.0

    def handle_notify(self, sender, data):
        self.timestamps.append(time.monotonic())
        rate = self.calc_packet_rate()

        if self.packet_queue is not None:
            self.packet_queue.put_nowait((data, rate, time.time()))
        else:
            print(f"rate={rate:.1f} Hz  data={data}")

    async def connect_and_read(self, address):
        async with BleakClient(address) as client:
            await asyncio.sleep(0.15)
            await client.start_notify(CHAR_UUID_RX, self.handle_notify)
            print("Listening for notifications... (Ctrl+C to stop)")
            while True:
                await asyncio.sleep(1)


async def main():
    addresses = await find_devices()
    if not addresses:
        print("No matching devices found.")
        return
    print(f"Connecting to {len(addresses)} device(s)...")
    await asyncio.gather(*(BLEConnection().connect_and_read(addr) for addr in addresses))

if __name__ == "__main__":
    asyncio.run(main())
