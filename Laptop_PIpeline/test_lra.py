import asyncio
from bluetooth import find_devices, BLEConnection

LRA_NAME = "CIRCUITPY9391"
SEND_INTERVAL = 1.0  # seconds between commands

async def main():
    addresses = await find_devices()
    lra_addr = next((addr for addr, name in addresses if name == LRA_NAME), None)
    if lra_addr is None:
        print(f"Could not find {LRA_NAME}")
        return
    print(f"Found LRA MCU at {lra_addr}")

    cmd_queue = asyncio.Queue()
    conn = BLEConnection()

    async def send_loop():
        # Wait for connection to establish
        await asyncio.sleep(0.5)
        print("Sending highest intensity commands (drv1 effect 51, drv2 effect 51) every 1s. Ctrl+C to stop.")
        while True:
            cmd_queue.put_nowait('152')
            await asyncio.sleep(SEND_INTERVAL)
            cmd_queue.put_nowait('252')
            await asyncio.sleep(SEND_INTERVAL)
            cmd_queue.put_nowait('153')
            await asyncio.sleep(SEND_INTERVAL)
            cmd_queue.put_nowait('253')
            await asyncio.sleep(SEND_INTERVAL)

    await asyncio.gather(
        conn.connect_and_write(lra_addr, cmd_queue),
        send_loop(),
    )

if __name__ == "__main__":
    asyncio.run(main())
