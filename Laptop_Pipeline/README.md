# Laptop Pipeline

Real-time data pipeline for the wearable haptics device. Receives IMU data from the foot-mounted MCU over BLE, computes foot progression angle (FPA) using a gait phase detection algorithm, and transmits vibration commands to the shank-mounted LRA MCU.

## Setup

Requires Python 3.10+. Dependencies are managed with [uv](https://docs.astral.sh/uv/).

```bash
cd Laptop_Pipeline
pip install uv
uv sync
```

## Running

```bash
uv run python run_device.py
```

The script will scan for and connect to both BLE devices automatically. Once connected, it will either run a **calibration phase** or load a previously saved baseline FPA from `base_fpa.csv`, depending on the `CALIBRATION` flag in `config.json`.

### Configuration

All settings are in `config.json`. No code changes needed.

| Variable | Description |
|---|---|
| `ALGORITHM` | FPA algorithm plugin to use (default: `"sage_motion"`) |
| `IS_RIGHT_FOOT` | Set to `true` if the IMU is on the right foot |
| `CALIBRATION` | `true` to run a 60-second calibration and save a new `base_fpa.csv`; `false` to load the existing baseline and begin feedback immediately |
| `CALIBRATION_DURATION` | Duration of the calibration phase in seconds (default: 60) |
| `FEEDBACK_TOE_OUT_THRESHOLD_DEG` | FPA deviation above which toe-out feedback fires (default: −1°) |
| `FEEDBACK_TOE_IN_THRESHOLD_DEG` | FPA deviation below which toe-in feedback fires (default: −9°) |

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
| `config.json` | All runtime configuration (thresholds, calibration, algorithm selection) |
| `run_device.py` | Main entry point — BLE connection, FPA computation, haptic feedback |
| `bluetooth.py` | BLE device discovery and read/write connection management |
| `algorithms/base.py` | Shared gait phase constants and Protocol interfaces for algorithm plugins |
| `algorithms/sage_motion/` | Default FPA algorithm (ported from SageMotion) |
| `base_fpa.csv` | Saved baseline FPA from the most recent calibration |

## Swapping or Adding an FPA Algorithm

Algorithm plugins live in `algorithms/<name>/`. To use a different algorithm:

1. Create a new folder: `algorithms/<your_algorithm>/`
2. Add an `__init__.py` that exports two classes — `FPA` and `GaitPhase` — matching the interfaces in `algorithms/base.py`:

   ```python
   # algorithms/base.py defines these protocols:

   class FPAAlgorithm(Protocol):
       FPA_this_step: float
       def update_FPA(self, sensor_data: dict, gaitphase_old: int, gaitphase: int) -> None: ...

   class GaitPhaseDetector(Protocol):
       gaitphase: int
       gaitphase_old: int
       step_count: int
       in_feedback_window: bool
       def update_gaitphase(self, sensor_data: dict) -> None: ...
   ```

   `sensor_data` is a dict with keys `AccelX/Y/Z` (m/s²) and `GyroX/Y/Z` (deg/s).

3. Set `"ALGORITHM": "<your_algorithm>"` in `config.json`.
