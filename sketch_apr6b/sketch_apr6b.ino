#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

#define SERVICE_UUID        "ef607d5f-d81f-4d42-8a5d-f306fba75564"
#define CHARACTERISTIC_UUID "4806e39d-6b5e-4356-8d18-3dd7903050c1"
#define HEADER1 (0xAA)
#define HEADER2 (0xBB)
#define ENDFRAME (0x55)

long int randNumber;
uint8_t randBytes[4]; //buffer for random number bytes 
int incomingByte = 0; // for incoming serial data
bool sendData = false; // flag to control data sending
unsigned long lastSendTime = 0;
unsigned long sendInterval = 1000; 

BLECharacteristic *pCharacteristic;

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
        String value = pCharacteristic->getValue();  // Get the value written to the characteristic
        if (value == "n") {
          sendData = true; 
        }
        else if (value == "f") {
          sendData = false;
        }
    }
};

void sendDataFrame() {
    randBytes[0] = HEADER1; 
    randBytes[1] = HEADER2; 
    // Generate a random number from 10 to 19
    randNumber = byte(random(10, 20));
    // Convert randNumber to a byte array
    memcpy(&randBytes[2], &randNumber, sizeof(randNumber));
    randBytes[3] = ENDFRAME;
    // Set the value to the BLE characteristic
    pCharacteristic->setValue(randBytes, sizeof(randBytes));
    pCharacteristic->notify();  // Notify the client 
}

void setup() {
  // Open serial port, sets data rate to 9600 bps
  Serial.begin(115200);  
  BLEDevice::init("TestESP32C3");
  BLEServer *pServer = BLEDevice::createServer();

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
  // Use random analog noise to create random seed
  randomSeed(analogRead(0));
}

void loop() {
  if (sendData && (millis() - lastSendTime) >= sendInterval) {
    sendDataFrame();
    lastSendTime = millis();
  }
}
