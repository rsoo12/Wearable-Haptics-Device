import graphing
from PyQt6 import QtWidgets, QtGui, QtCore
from PyQt6.QtWidgets import *
import time
import numpy as np
import serial
import threading 
import struct 
from bleak import BleakScanner, BleakClient
import asyncio
import qasync
from bleak.backends.characteristic import BleakGATTCharacteristic

class MainWindow(QtWidgets.QMainWindow, graphing.Ui_MainWindow):
    def __init__(self):
        super(MainWindow, self).__init__()
        self.setupUi(self)
        self.graph_config()
        self.ser = serial.Serial()
        self.serial_port = "/dev/cu.usbmodem1201"
        self.serial_baudrate = 9600
        self.ptr = 0
        self.headerSize = 2
        self.dataSize = 2
        self.latestVal = 0
        self.timer = QtCore.QTimer()
        self.timer.timeout.connect(self.update_plot)
        self.char_uuid = "4806e39d-6b5e-4356-8d18-3dd7903050c1"
        self.service_uuid = "ef607d5f-d81f-4d42-8a5d-f306fba75564" 
        self.connected = False
        self.connectButton.clicked.connect(self.connect_button)


    async def find_device(self, name_prefix="TestESP32C3"):
        devices = await BleakScanner.discover()
        for device in devices:
            if device.name and device.name.startswith(name_prefix):
                print(f"Found device: {device.name} ({device.address})")
                return device.address
        print("Device not found.")
        return None

    @qasync.asyncSlot()
    async def connect_button(self):
        asyncio.create_task(self.connect())
    
    async def connect(self):
        address = await self.find_device()
        if address: 
            try: 
                # await self.connect_and_read(address)
                self.addr = address 
                # thread_acquire_online = threading.Thread(name = 'online acquisition', target=self.update)
                # thread_acquire_online.start()
                print(f"found the address: {self.addr}")
                await self.update()
            except Exception as e: 
                print(f"Connection error: {e}")
        
    # async def connect_and_read(self, address):
    #     async with BleakClient(address) as client:
    #         print("Connected to device.")
    #         self.connected = True
    #         # task = asyncio.create_task(self.readingStuff(client))
    #         await self.readingStuff(client)

    def graph_config(self):
        self.data = np.zeros(100)
        self.curve = self.graph.plot(self.data, pen = 'r')
        self.graph.setBackground('w')
        self.graph.setLabel('left', 'Y Axis')
        self.graph.setLabel('bottom', 'X Axis')
        self.graph.setTitle('Display Plot')
    
    def read_packet(self, received):
        header = received[:self.headerSize]
        # print("start reading")
        if header == b'\xAA\x55':
            data = received[self.headerSize:self.headerSize + self.dataSize]
            unpacked = struct.unpack('>H', data)
            return unpacked[0]
    
    async def update(self):
        async with BleakClient(self.addr) as client:
            tmp = 0
            self.timer.start(50)
            while True:
                value = await client.read_gatt_char(self.char_uuid)
                tmp = self.read_packet(value)
                if tmp is not None:
                    self.latestVal = float(tmp)
                    # print(f"latestVal: {self.latestVal}")
        
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