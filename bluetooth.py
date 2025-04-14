import asyncio
from bleak import BleakScanner, BleakClient

def handle_data(sender: int, data: bytearray):
    print(f"Received data: {int.from_bytes(data, 'little')}")

async def find_device(name_prefix="TestESP32C3"):
    devices = await BleakScanner.discover()
    for device in devices:
        if device.name and device.name.startswith(name_prefix):
            print(f"Found device: {device.name} ({device.address})")
            return device.address
    return None

def callback(sender, data):
    print(f"Received data: {data}")

async def connect_and_read(app):
    async with BleakClient(app.device.address) as client:
        counter = 0
        await asyncio.sleep(0.15)
        await client.write_gatt_char(app.device.char_uuid, b"START")
        print("sent START")
        await client.start_notify(app.device.char_uuid, callback)
        while True:
            value = await client.read_gatt_char(app.device.char_uuid)
            # unpack the data 
            print(f"Received data: {value}")
            print(f"counter: {counter}")
            app.update_label(counter)
            counter += 1
            await asyncio.sleep(0.15)

async def connect(app):
    app.device.address = await find_device()
    if app.device.address:
        print("Connected!")
        await connect_and_read(app)
    else: 
        app.label.setText("Device Not Found")