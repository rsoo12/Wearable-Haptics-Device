import asyncio
from bleak import BleakScanner, BleakClient
import threading

SERVICE_UUID        = "ef607d5f-d81f-4d42-8a5d-f306fba75564"
CHARACTERISTIC_UUID = "4806e39d-6b5e-4356-8d18-3dd7903050c1"

def handle_data(sender: int, data: bytearray):
    print(f"Received data: {int.from_bytes(data, 'little')}")

async def find_device(name_prefix="TestESP32C3"):
    devices = await BleakScanner.discover()
    for device in devices:
        if device.name and device.name.startswith(name_prefix):
            print(f"Found device: {device.name} ({device.address})")
            return device.address
    print("Device not found.")
    return None

async def connect_and_read(address):
    # async with BleakClient(address) as client:
    #     print("Connected to device.")
    #     await client.start_notify(CHARACTERISTIC_UUID, handle_data)
    #     await asyncio.sleep(10)  # Keep receiving data for 10 seconds
    #     await client.stop_notify(CHARACTERISTIC_UUID)

    async with BleakClient(address) as client:
        print("Connected to device.")
        counter = 0
        while True:
            value = await client.read_gatt_char(CHARACTERISTIC_UUID)
            print(f"Received data: {value[0]}")
            print(f"counter: {counter}")
            counter += 1
            await asyncio.sleep(0.15)

async def main():
    address = await find_device()
    if address:
        await connect_and_read(address)
        

if __name__ == "__main__":
    asyncio.run(main())



