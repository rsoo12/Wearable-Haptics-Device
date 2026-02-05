import serial

ser = serial.Serial('/dev/cu.usbmodem1201', 9600)

while True:
    byte = ser.read(1)
    print(f"{byte.hex()}")

    