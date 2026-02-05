// Define macro in Arduino IDE
#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define SERVICE_UUID        "ef607d5f-d81f-4d42-8a5d-f306fba75564"
#define CHARACTERISTIC_UUID "4806e39d-6b5e-4356-8d18-3dd7903050c1"
#define HEADER1 (0xAA)
#define HEADER2 (0x55)
#define ENDFRAME (0xBB)

// Declare global variable
uint8_t TX_FrameTransfer[4]; //  declare an Array unsigned to store transfer data 
unsigned int cnt=0; // declare global variable to generate triangle signal 
bool sendData = false; 
bool deviceConnected = false;
bool oldDeviceConnected = false; 
unsigned long lastSendTime = 0;
unsigned long sendInterval = 70; 

BLEServer *pServer = NULL; 
BLECharacteristic *pCharacteristic = NULL;

class MyServerCallbacks: public BLEServerCallbacks {
  void onConnect(BLEServer *pServer) {
    deviceConnected = true; 
  };
  void onDisconnect(BLEServer *pServer) {
    deviceConnected = false;
  }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String value = pCharacteristic->getValue();  // Get the value written to the characteristic
    }
};

void setup(void)
{
// Initial function of the program 
  Serial.begin(9600); // set up UART with the baudrate is 9600 bits/sec 
  BLEDevice::init("TestESP32C3");
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  BLEService *pService = pServer->createService(SERVICE_UUID);

  pCharacteristic = pService->createCharacteristic(
                                         CHARACTERISTIC_UUID,
                                         BLECharacteristic::PROPERTY_READ |
                                         BLECharacteristic::PROPERTY_WRITE | 
                                         BLECharacteristic::PROPERTY_NOTIFY 
                                       );

  pCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();

  BLEAdvertising *pAdvertising = pServer->getAdvertising();
  pAdvertising->start();
}

void sendDataFrame(){
  cnt++;
  if(cnt>50)cnt=0;

  TX_FrameTransfer[0]=HEADER1; // add the first header to Frame 
  TX_FrameTransfer[1]=HEADER2; // add second header to Frame
  TX_FrameTransfer[2]=((cnt&0xff00)>>8); // add High byte to Frame
  TX_FrameTransfer[3]=((cnt&0x00ff)); // add Low byte to Frame

  pCharacteristic->setValue(TX_FrameTransfer, sizeof(TX_FrameTransfer));
  pCharacteristic->notify();
  }

void loop() {
  if (deviceConnected && ((millis() - lastSendTime) >= sendInterval))
  {
    sendDataFrame();
    lastSendTime = millis();
  }

  if (!deviceConnected && oldDeviceConnected) {
    delay(100);
    pServer->startAdvertising();
    oldDeviceConnected = deviceConnected; 
  }

  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }
}