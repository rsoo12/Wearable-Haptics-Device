# MCU Setup

## New Seeed Studio XIAO Setup

1. Double click the reset button to enter bootloader mode
2. If the device name is not `CIRCUITPY`, download the `.uf2` file from [this link](https://circuitpython.org) and drag and drop it onto the device

## Programming the MCU

1. Plug the MCU into your laptop using a USB-C cable
2. Open VSCode and click **File > Open Folder**
3. Open the external device named `CIRCUITPY`
4. In the VSCode terminal, run:
   ```
   pip install circup
   pip install mpremote
   ```
5. Copy the contents of this repo's `IMU.py` into `code.py` on the device (Bluetooth code should already be uncommented and ready to run)
6. Run `circup install --auto` to install dependencies
7. If you see errors like `missing import: ___` when running the code, run `circup install <package_name>`
8. Run `mpremote repl` in the terminal (this renames the terminal to "mpremote" — open a new tab for other commands)
9. Press **Ctrl+D** in the mpremote terminal to run the code
10. Press **Ctrl+C** to stop the code

## Bluetooth Behavior

- The code waits for a BLE connection. Once connected, the blue LED on the MCU will turn on.
- IMU acceleration data is sent once per second to the connected device.
- Sending `0x61` vibrates the LRA on mux port 3
- Sending `0x62` vibrates a different pattern
- Any other value triggers a third vibration pattern

## Testing Without a Laptop

1. Save the code to the device (**Ctrl+S** in VSCode), then unplug the USB-C cable
2. The MCU will automatically run the code (the `while True` loop runs indefinitely)
3. To restart and set up a new Bluetooth connection, press the reset button once quickly

> **Note:** Pressing reset **twice** will erase the code from the MCU entirely.

## Increasing BLE Packet Size to 24 Bytes

The default BLE ATT MTU allows only 20 bytes of payload per packet. Since the IMU payload is 24 bytes, the Nordic UART Service library must be patched on the device.

1. Open `CIRCUITPY/lib/adafruit_ble/services/nordic/__init__.py` (verify the path with `ls /Volumes/CIRCUITPY/lib/adafruit_ble/services/nordic/`)
2. Find the TX characteristic definition and change `max_length=20` to `max_length=24`:
   ```python
   # before
   _TXCharacteristic(..., max_length=20)

   # after
   _TXCharacteristic(..., max_length=24)
   ```
3. Save the file — this change persists on the device but will be overwritten if you reinstall the library via `circup`

> **Note:** Re-running `circup install --auto` will reset this change. Re-apply the patch after any library update.

## Debugging

- If saving fails with a `READ-ONLY` error, press the reset button on the XIAO once quickly
