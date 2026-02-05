import asyncio
from bleak import BleakScanner, BleakClient
import struct 

SERVICE_UUID        = "ef607d5f-d81f-4d42-8a5d-f306fba75564"
CHARACTERISTIC_UUID = "4806e39d-6b5e-4356-8d18-3dd7903050c1"

def handle_data(sender: int, data: bytearray):
    print(read_packet(data))

def read_packet(self, received):
    header = received[:self.headerSize]
    if header == b'\xAA\x55':
        data = received[self.headerSize:self.headerSize + self.dataSize]
        unpacked = struct.unpack('>H', data)
        return unpacked[0]

async def find_device(name_prefix="TestESP32C3"):
    devices = await BleakScanner.discover()
    for device in devices:
        if device.name and device.name.startswith(name_prefix):
            print(f"Found device: {device.name} ({device.address})")
            return device.address
    print("Device not found.")
    return None

async def main():
    address = await find_device()
    if address:
        async with BleakClient(address) as client:
            print("Connected to device.")
            await client.connect()
            for service in client.services:
                print("serive is ", service)
                for char in service.characteristics:
                    print(f"\t{char.uuid}: {char.properties}")
            await asyncio.sleep(1)
            await client.start_notify(CHARACTERISTIC_UUID, handle_data)
            # while True:
            #     value = await client.read_gatt_char(CHARACTERISTIC_UUID)
            #     print(f"Received data: {value[0], value[1], value[2], value[3]}")

asyncio.run(main())