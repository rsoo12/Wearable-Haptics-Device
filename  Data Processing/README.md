# Data Processing

Scripts for analyzing foot progression angle (FPA) data collected from the wearable haptics device, comparing IMU-derived FPA against motion capture (mocap) ground truth.

## Setup

Requires Python 3.13+. Dependencies are managed with [uv](https://docs.astral.sh/uv/).

```bash
pip install uv
uv sync
```

## Scripts

### `FPA_accuracy.py`
Evaluates IMU FPA accuracy against mocap across four walking conditions:
- Treadmill slow, normal, and fast
- Overground

Outputs comparison plots to `graphs/`.

```bash
uv run python3 FPA_accuracy.py
```

### `FPA_training.py`
Analyzes haptic training effectiveness by comparing baseline and haptic-cued trials for toe-in and toe-out correction targets.

Outputs training response plots to `graphs/`.

```bash
uv run python3 FPA_training.py
```

## Directory Structure

```
outputs/    # IMU FPA logs (.csv) from Bluetooth data collection
data/       # Mocap reference data
graphs/     # Generated plots (auto-created on first run)
utils/      # Shared processing utilities (mocap parsing, synchronization, visualization)
```
