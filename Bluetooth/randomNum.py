import asyncio
from bleak import BleakScanner, BleakClient

SERVICE_UUID        = "ef607d5f-d81f-4d42-8a5d-f306fba75564"
CHARACTERISTIC_UUID = "4806e39d-6b5e-4356-8d18-3dd7903050c1"


sendData = False

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

async def user_input_toggle(client):
    global sendData
    while True: 
        cmd = input("Type 'n' or 'f' to stop receiving: ").strip().lower()
        if cmd == "n":
            sendData = True
            await client.write_gatt_char(CHARACTERISTIC_UUID, b'n')
            print("Started receiving")
        elif cmd == "f":
            sendData = False 
            await client.write_gatt_char(CHARACTERISTIC_UUID, b'f')
            print("Stopped receiving")
        else:
            print("invalid command")
    

async def read_data(client):
    global sendData
    while True:
        if sendData:
            try: 
                value = await client.read_gatt_char(CHARACTERISTIC_UUID)
                if value[0:2] == b'\xAA\xBB': 
                    # Extract the 4-byte random number (which is a 32-bit integer)
                    data = value[2]
                    # Check if the end frame is correct
                    end = bytearray([value[3]])
                    if end == b'\x55':
                        print(f"Received data: {data}")
                    else: 
                        print("incorrect padding")
            except Exception as e:
                print(f"Error reading data: {e}")
        await asyncio.sleep(1)


async def connect_and_read(address):
    async with BleakClient(address) as client:
        print("Connected to device.")
        msg = bytes('n', encoding='utf8')
        await client.get_services()

        await client.start_notify(CHARACTERISTIC_UUID, handle_data)

        await asyncio.gather(
            user_input_toggle(client)
            # read_data(client)
        )
        # while True:
        #     await client.write_gatt_char(CHARACTERISTIC_UUID, msg)
        #     value = await client.read_gatt_char(CHARACTERISTIC_UUID)
        #     if value[0:2] == b'\xAA\xBB': 
        #         # Extract the 4-byte random number (which is a 32-bit integer)
        #         data = value[2]
        #         # Check if the end frame is correct
        #         end = bytearray([value[3]])
        #         if end == b'\x55':
        #             print(f"Received data: {data}")
        #         else: 
        #             print("incorrect padding")
        #     # print(f"Received data: {value[0], value[1], value[2], value[3]}")
        #     await asyncio.sleep(0.5)


async def main():
    address = await find_device()
    if address:
        await connect_and_read(address)

if __name__ == "__main__":
    asyncio.run(main())