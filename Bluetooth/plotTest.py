import graphing
from PyQt6 import QtWidgets, QtGui, QtCore
from PyQt6.QtWidgets import *
import contextlib
import time
import numpy as np
import serial
import struct 
from bleak import BleakScanner, BleakClient
import asyncio
import qasync
from bleak.backends.characteristic import BleakGATTCharacteristic
from time import perf_counter

class Device:
    def __init__(self, name, uuid):
        self.name = name 
        self.uuid = uuid
        self.connected = False 
        self.data = np.zeros(100)
        self.ptr = 0

class MainWindow(QtWidgets.QMainWindow, graphing.Ui_MainWindow):
    def __init__(self):
        super(MainWindow, self).__init__()
        self.setupUi(self)
        # self.ptr = 0
        self.headerSize = 2
        self.dataSize = 2
        self.devices = [Device("TestESP32C3", "4806e39d-6b5e-4356-8d18-3dd7903050c1"), 
                        Device("MCU2", "c0b06ac9-faff-4b3c-97f6-1f278bfc3c27")]
        self.clients = []
        self.latestVal = dict()
        self.curves = dict()
        self.graph_config()
        self.timer = QtCore.QTimer()
        self.timer.timeout.connect(self.update_plot)
        self.connectButton.clicked.connect(self.connect_button)
        self.client = None

    # async def find_device(self, name_prefix="TestESP32C3"):
    # # async def find_device(self, name_prefix="MCU2"):
    #     devices = await BleakScanner.discover()
    #     for device in devices:
    #         if device.name and device.name.startswith(name_prefix):
    #             print(f"Found device: {device.name} ({device.address})")
    #             return device.address
    #     print("Device not found.")
    #     return None

    @qasync.asyncSlot()
    async def connect_button(self):
        lock = asyncio.Lock()
        await asyncio.gather(
            *(
                self.connect(lock, dev.name, dev.uuid)
                for dev in self.devices
            )
        )

    async def connect(self, lock, name, uuid):
        try: 
            async with contextlib.AsyncExitStack() as stack: 
                async with lock:
                    address = await BleakScanner.find_device_by_name(name)
                    if address: 
                        try: 
                            self.connectButton.setText("Disconnect")
                            client = BleakClient(address)
                            self.clients.append(client)
                            print("able to connect to:", name)
                            await stack.enter_async_context(client)
                            
                        except Exception as e: 
                            print(f"Connection error: {e}")
                await asyncio.sleep(1)
                await self.update(client, uuid)
            print("disconnected from", name)
            self.timer.stop()
        except Exception:
            print("connection error with", name)

    def graph_config(self):
        for dev in self.devices:
            curve = self.graph.plot(dev.data, pen = 'r')
            self.curves[dev.uuid] = curve
        self.graph.setBackground('w')
        self.graph.setLabel('left', 'Y Axis')
        self.graph.setLabel('bottom', 'X Axis')
        self.graph.setTitle('Display Plot')
    
    def read_packet(self, received):
        header = received[:self.headerSize]
        if header == b'\xAA\x55':
            data = received[self.headerSize:self.headerSize + self.dataSize]
            unpacked = struct.unpack('>H', data)
            return unpacked[0]
    
    async def update(self, client, uuid):
        # async with BleakClient(self.addr) as client:
        tmp = 0
        startTime = perf_counter()
        self.timer.start(70)
        # self.f = open("plottingData.csv", "w")
        while True:
            value = await client.read_gatt_char(uuid)
            tmp = self.read_packet(value)
            currentTime = perf_counter()
            startTime = currentTime

            if tmp is not None:
                self.latestVal[uuid] = float(tmp) 
                # msg = str(currentTime) + "," +str(self.latestVal) + "\n"
                # self.f.write(msg)
        
    def update_plot(self):
        for dev in self.devices:
            uuid = dev.uuid
            dev.data[:-1] = dev.data[1:]
            dev.data[-1] = self.latestVal.get(uuid, 0)
            dev.ptr += 1
            self.curves[uuid].setData(dev.data, pen = 'r')
            self.curves[uuid].setPos(dev.ptr, 0)

if __name__ == "__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)
    loop = qasync.QEventLoop(app)
    asyncio.set_event_loop(loop)
    ui = MainWindow()
    ui.show()

    with loop:
        loop.run_forever()