import sys
from PyQt6 import QtWidgets
from PyQt6.QtWidgets import *
import interface
from bluetooth import *
import qasync

SERVICE_UUID        = "ef607d5f-d81f-4d42-8a5d-f306fba75564"
CHARACTERISTIC_UUID = "4806e39d-6b5e-4356-8d18-3dd7903050c1"

class MainWindow(QtWidgets.QMainWindow, interface.Ui_MainWindow):
    def __init__(self):
        super(MainWindow, self).__init__()
        self.setupUi(self)
        self.pushButton.clicked.connect(self.clicked_button)
        self.device = Device(SERVICE_UUID, CHARACTERISTIC_UUID)
    
    def update_label(self, counter):
        self.label.setText(f"Counter: {counter}")

    @qasync.asyncSlot()
    async def clicked_button(self):
        asyncio.create_task(connect(self))

class Device:
    def __init__(self, service_uuid, char_uuid):
        self.service_uuid = service_uuid
        self.char_uuid = char_uuid
        self.counter = 0
        self.address = None

if __name__ == "__main__":
    import sys
    app = QtWidgets.QApplication(sys.argv)
    loop = qasync.QEventLoop(app)
    asyncio.set_event_loop(loop)
    ui = MainWindow()
    ui.show()

    with loop:
        loop.run_forever()
