# Bluetooth

Real-time data pipeline for the wearable haptics device. Receives IMU data from the foot-mounted MCU over BLE, computes foot progression angle (FPA) using a gait phase detection algorithm, and transmits vibration commands to the shank-mounted LRA MCU.

## Setup

Requires Python 3.10+. Dependencies are managed with [uv](https://docs.astral.sh/uv/).

```bash
cd Bluetooth
pip install uv
uv sync
```

## Running

```bash
uv run python vqf_processor.py
```

The script will scan for and connect to both BLE devices automatically. Once connected, it will either run a **calibration phase** or load a previously saved baseline FPA from `base_fpa.csv`, depending on the `CALIBRATION` flag at the top of `vqf_processor.py`.

### Configuration

| Variable | Location | Description |
|---|---|---|
| `CALIBRATION` | `vqf_processor.py:15` | `True` to run a 60-second calibration and save a new `base_fpa.csv`; `False` to load the existing baseline and begin feedback immediately |
| `IS_RIGHT_FOOT` | `vqf_processor.py:13` | Set to `True` if the IMU is on the right foot |
| `CALIBRATION_DURATION` | `vqf_processor.py:30` | Duration of the calibration phase in seconds (default: 60) |

### Calibration mode (`CALIBRATION = True`)

Collects FPA measurements over the calibration period, computes the average, and writes it to `base_fpa.csv`. Automatically switches to feedback mode once calibration completes.

### Feedback mode (`CALIBRATION = False`)

Loads the baseline FPA from `base_fpa.csv` and triggers vibration feedback on each step when the measured FPA deviates outside the deadband threshold.

## Output

Per-session logs are written to `output/fpa_log_<timestamp>.csv` with the following columns:

| Column | Description |
|---|---|
| `time` | Timestamp of the sample |
| `step num` | Step count |
| `fpa` | Foot progression angle (degrees) |
| `drv` | LRA driver activated (`DRV1` = toe-out cue, `DRV2` = toe-in cue) |
| `effect` | Haptic effect ID sent to the driver |
| `ax/ay/az` | Accelerometer readings (m/s²) |
| `gx/gy/gz` | Gyroscope readings (rad/s) |

## File Overview

| File | Description |
|---|---|
| `vqf_processor.py` | Main entry point — BLE connection, FPA computation, haptic feedback |
| `bluetooth.py` | BLE device discovery and read/write connection management |
| `gaitphase.py` | Gait phase detection (stance, swing, feedback window) |
| `FPA_algorithm.py` | FPA estimation from IMU sensor data |
| `const.py` | Shared constants |
| `base_fpa.csv` | Saved baseline FPA from the most recent calibration |
