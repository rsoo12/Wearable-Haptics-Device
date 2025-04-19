import graphing
from PyQt6 import QtWidgets, QtGui, QtCore
from PyQt6.QtWidgets import *
import time
import numpy as np
import serial
import struct 
from bleak import BleakScanner, BleakClient
import asyncio
import qasync
from bleak.backends.characteristic import BleakGATTCharacteristic
from time import perf_counter

class MainWindow(QtWidgets.QMainWindow, graphing.Ui_MainWindow):
    def __init__(self):
        super(MainWindow, self).__init__()
        self.setupUi(self)
        self.graph_config()
        self.serial_baudrate = 9600
        self.ptr = 0
        self.headerSize = 2
        self.dataSize = 2
        self.latestVal = 0
        self.timer = QtCore.QTimer()
        self.timer.timeout.connect(self.update_plot)
        self.char_uuid1 = "4806e39d-6b5e-4356-8d18-3dd7903050c1"
        self.device1 = "TestESP32C3"
        self.char_uuid2 = "c0b06ac9-faff-4b3c-97f6-1f278bfc3c27"
        self.device2 = "MCU2"
        self.connected = False
        self.connectButton.clicked.connect(self.connect_button)
        self.client = None


    async def find_device(self, name_prefix="TestESP32C3"):
    # async def find_device(self, name_prefix="MCU2"):
        devices = await BleakScanner.discover()
        for device in devices:
            if device.name and device.name.startswith(name_prefix):
                print(f"Found device: {device.name} ({device.address})")
                return device.address
        print("Device not found.")
        return None

    @qasync.asyncSlot()
    async def connect_button(self):
        if not self.connected:
            asyncio.create_task(self.connect())
        else: 
            self.connected = False
            await self.client.disconnect()
            # self.f.close()
            self.timer.stop()
            print("Disconnected")

    async def connect(self):
        address = await self.find_device()
        if address: 
            try: 
                self.connectButton.setText("Disconnect")
                self.addr = address 
                print(f"found the address: {self.addr}")
                self.connected = True
                await self.update()
            except Exception as e: 
                print(f"Connection error: {e}")

    def graph_config(self):
        self.data = np.zeros(100)
        self.curve = self.graph.plot(self.data, pen = 'r')
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
    
    async def update(self):
        async with BleakClient(self.addr) as client:
            self.client = client
            tmp = 0
            startTime = perf_counter()
            self.timer.start(70)
            # self.f = open("plottingData.csv", "w")
            while True:
                value = await client.read_gatt_char(self.char_uuid)
                tmp = self.read_packet(value)
                currentTime = perf_counter()
                startTime = currentTime
                if tmp is not None:
                    self.latestVal = float(tmp)
                    # msg = str(currentTime) + "," +str(self.latestVal) + "\n"
                    # self.f.write(msg)
        
    def update_plot(self):
        self.data[:-1] = self.data[1:]
        self.data[-1] = self.latestVal
        self.ptr += 1
        self.curve.setData(self.data, pen = 'r')
        self.curve.setPos(self.ptr, 0)

if __name__ == "__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)
    loop = qasync.QEventLoop(app)
    asyncio.set_event_loop(loop)
    ui = MainWindow()
    ui.show()

    with loop:
        loop.run_forever()