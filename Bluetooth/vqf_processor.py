import asyncio
import struct
from vqf import VQF

from bluetooth import find_device, BLEConnection

SAMPLE_RATE = 100.0 

def parse_payload(payload: bytes):
    # need to implement

async def vqf_consumer(packet_queue: asyncio.Queue, vqf: VQF):
    while True:
        seq, payload, rate = await packet_queue.get()

        parsed = parse_payload(payload)
        if parsed is None:
            print(f"seq={seq} could not parse payload ({len(payload)} bytes)")
            continue

        gyr, acc = parsed
        vqf.update(gyr, acc)

        quat = vqf.getQuat6D()   # [w, x, y, z]
        print(f"seq={seq}  rate={rate:.1f} Hz  quat={quat}")


async def main():
    address = await find_device()
    if not address:
        print("Device not found.")
        return

    print("Connected!")
    packet_queue = asyncio.Queue()
    vqf = VQF(1.0 / SAMPLE_RATE)

    conn = BLEConnection(packet_queue=packet_queue)

    await asyncio.gather(
        conn.connect_and_read(address),
        vqf_consumer(packet_queue, vqf),
    )

if __name__ == "__main__":
    asyncio.run(main())
