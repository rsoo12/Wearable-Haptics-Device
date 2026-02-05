#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

/* Sampling time */
unsigned int timer = 0;

/* Serial (BLE) communication configuration */
// See the following for generating UUIDs:
// https://www.uuidgenerator.net/
#define SERVICE_UUID       "ef607d5f-d81f-4d42-8a5d-f306fba75564"
#define CHARACTERISTIC_UUID "4806e39d-6b5e-4356-8d18-3dd7903050c1"


// Data frame
struct DataPacket {
  unsigned long timestamp; 
  int count; 
  int val;
};

// initialize data packet 
DataPacket data;

// initialize counter
int counter = 0;

// sampling time 
unsigned long lastSampleTime = 0;
const unsigned long sampleInterval = 2000; // 2s 

BLECharacteristic *pCharacteristic; 

// connection status 
bool deviceConnected = false;
bool startSendingData = false;

class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Client connected");
    }

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      startSendingData = false; // Stop sending data when disconnected
      Serial.println("Client disconnected");
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String value = pCharacteristic->getValue();

      if (value == "START") {
        startSendingData = true; 
        Serial.println("START received - begin sending data");
      } else if (value == "STOP") {
        startSendingData = false;
        Serial.println("STOP received - stop sending");
      }
    }
};

void setup() {
  Serial.begin(115200);

  BLEDevice::init("TestESP32C3");
  BLEServer *pServer = BLEDevice::createServer();
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
  randomSeed(analogRead(0));
}


void loop() {
  unsigned long currentTime = millis();

  if (deviceConnected && startSendingData) {
    if (currentTime - lastSampleTime >= sampleInterval) {
      lastSampleTime = currentTime;

      // Generate data
      data.timestamp = currentTime;
      data.count = counter++;       // increment counter
      data.val = random(0, 100);  // generate a random number

      // Convert data packet to byte array
      uint8_t dataBytes[sizeof(data)];
      memcpy(dataBytes, &data, sizeof(data));

      // Send data via BLE
      pCharacteristic->setValue(dataBytes, sizeof(data));
      pCharacteristic->notify();

      // Debugging output
      Serial.print("Timestamp: "); Serial.println(data.timestamp);
      Serial.print("Counter: "); Serial.print(data.count);
      Serial.print(", Random: "); Serial.println(data.val);
      Serial.println();
    }
  }
  // delay(2000);
}