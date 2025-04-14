import graphing
from PyQt6 import QtWidgets, QtGui, QtCore
from PyQt6.QtWidgets import *
import time
import numpy as np
import serial
import threading 
import struct 

class MainWindow(QtWidgets.QMainWindow, graphing.Ui_MainWindow):
    def __init__(self):
        super(MainWindow, self).__init__()
        self.setupUi(self)
        self.graph_config()
        self.ser = serial.Serial()
        self.connectButton.clicked.connect(self.connect_button)
        self.serial_port = "/dev/cu.usbmodem1201"
        self.serial_baudrate = 9600
        self.ptr = 0
        self.headerSize = 2
        self.dataSize = 2
        self.latestVal = 0
        self.timer = QtCore.QTimer()
        self.timer.timeout.connect(self.update_plot)

    def connect_button(self):
        if not self.ser.isOpen():
            self.ser = serial.Serial(self.serial_port,\
                                    self.serial_baudrate)
            self.connectButton.setText('Disconnect')

            # Activate thread that contain the read serial function
            thread_acquire_online = threading.Thread(name = 'online acquisition', target=self.update)
            thread_acquire_online.start()

            # Check if we have connected to the serial port
            if self.ser.isOpen():
                print('Connected')
                self.timer.start(50)
        elif self.ser.isOpen():
            self.ser.close()
            self.connectButton.setText('Connect')

            #Check if we have disconnected to the serial port
            if not self.ser.isOpen():
                print("Disconnected")
                self.timer.stop()

    def graph_config(self):
        self.data = np.zeros(100)
        # self.graph = pg.PlotWidget()
        self.curve = self.graph.plot(self.data, pen = 'r')
        self.graph.setBackground('w')
        self.graph.setLabel('left', 'Y Axis')
        self.graph.setLabel('bottom', 'X Axis')
        self.graph.setTitle('Display Plot')
    
    def read_packet(self):
        header = self.ser.read(self.headerSize)
        # print(f'header received: {header}')
        if header == b'\xAA\x55':
            data = self.ser.read(self.dataSize)
            # print(f'data received: {data}')
            unpacked = struct.unpack('>H', data)
            return unpacked[0]
    
    def update(self):
        tmp = 0
        time.sleep(1)
        while self.ser.isOpen():
            tmp = self.read_packet()
            if tmp is not None:
                self.latestVal = float(tmp)
        
    def update_plot(self):
        self.data[:-1] = self.data[1:]
        self.data[-1] = self.latestVal
        self.ptr += 1
        self.curve.setData(self.data, pen = 'r')
        self.curve.setPos(self.ptr, 0)

if __name__ == "__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)

    # Display GUI
    ui = MainWindow()
    ui.show()
    sys.exit(app.exec())
