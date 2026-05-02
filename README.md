# Wearable Haptics Device

A wearable gait biofeedback system that measures foot progression angle (FPA) in real time and delivers vibrotactile cues to correct toe-in/toe-out gait patterns during walking.

## System Overview

**Foot MCU** --(BLE: IMU data)--> **Phone App / Python** --(BLE: haptic cmd)--> **Shank MCU**

Two microcontrollers (Seeed Studio XIAO, running CircuitPython) are worn on the leg:
- **Foot MCU** — samples a 6-axis IMU at ~180 Hz and streams data over BLE
- **Shank MCU** — receives haptic commands and drives two LRA (linear resonant actuator) motors

Gait analysis runs either on the **phone app** (iOS/Android) or in a **Python script** on a laptop. Both compute FPA per step, compare it against a calibrated baseline, and send a vibration command when the foot deviates outside the threshold.

---

## Repository Structure

```
Wearable-Haptics-Device/
├── MCU/                      CircuitPython firmware for both wearable MCUs
├── Laptop_Pipeline/          Python real-time pipeline (laptop ↔ BLE devices)
├── Smartphone_App_Pipeline/lkr-data/    React Native (Expo) mobile app
└── Data_Processing/          Offline analysis scripts (FPA accuracy, training outcomes)
```

---

## Components

### MCU — Firmware
CircuitPython code for the two microcontrollers.

| File | Description |
|------|-------------|
| `foot_mounted_wearable.py` | Reads IMU, packs 6 floats (ax, ay, az, gx, gy, gz) into 24 bytes, streams over Nordic UART BLE |
| `shank_mounted_wearable.py` | Receives ASCII haptic commands (`"112"`, `"212"`), drives LRA motors via DRV2605 haptic drivers through a PCA9546A I²C mux |

See [MCU/README.md](MCU/README.md) for flashing instructions and hardware setup.

---

### Laptop_Pipeline — Python Pipeline
Real-time FPA computation and haptic feedback on a laptop.

```bash
cd Laptop_Pipeline
pip install uv && uv sync
uv run python run_device.py
```

Configure at the top of `run_device.py`:

| Variable | Description |
|----------|-------------|
| `ALGORITHM` | FPA algorithm plugin (default: `"sage_motion"`) |
| `IS_RIGHT_FOOT` | `True` if the IMU is on the right foot |
| `CALIBRATION` | `True` to run a 60 s calibration walk; `False` to load `base_fpa.csv` |

See [Laptop_Pipeline/README.md](Laptop_Pipeline/README.md) for full configuration, output format, and how to add a custom FPA algorithm.

---

### Smartphone_App_Pipeline — Mobile Interface
React Native (Expo) app for live monitoring, calibration, and session logging.

```bash
cd Smartphone_App_Pipeline/lkr-data
npm install
npx expo start
```

Scan the QR code with Expo Go on iOS or Android. The app connects to both MCUs over BLE, runs the FPA pipeline on-device, and logs per-step data to a CSV that can be exported via the share sheet.

An optional AWS backend enables session history and gait trend charts — see [Smartphone_App_Pipeline/lkr-data/README.md](Smartphone_App_Pipeline/lkr-data/README.md) for setup.

---

### Data_Processing — Offline Analysis
Post-collection scripts for validating and analyzing sessions.

```bash
cd Data_Processing
pip install uv && uv sync
```

| Script | Description |
|--------|-------------|
| `FPA_accuracy.py` | Compares IMU-derived FPA against motion capture ground truth across walking conditions |
| `FPA_training.py` | Analyzes whether haptic cues produced a measurable gait correction |
| `FPA_correlation.py` | Correlation analysis between IMU and MOCAP FPA signals |

Input CSVs go in `Data_Processing/outputs/`. Generated plots are saved to `Data_Processing/graphs/`.

---

## How Feedback Works

1. The foot MCU streams IMU data over BLE at ~180 Hz.
2. Gait phase detection identifies heel strike and toe-off to segment each step.
3. FPA is computed per step at the MIDDLE_STANCE → LATE_STANCE transition.
4. The measured FPA is compared to the calibrated baseline:
   - **Toe-out** (FPA > baseline − 1°) → vibrate **driver 1**
   - **Toe-in** (FPA < baseline − 9°) → vibrate **driver 2**
   - Within deadband → no feedback
5. The haptic command (`"112"` or `"212"`) is sent to the shank MCU over BLE.

Thresholds and effect IDs are defined in `run_device.py` (Python) and `active-session.tsx` (app).
