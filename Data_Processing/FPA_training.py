import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import find_peaks

from utils.mocap import fpa_mocap

os.makedirs('graphs', exist_ok=True)

MOCAP_FS = 100
IMU_FOOT = 'right'

RHEA_BASE_FPA       = 1.7119
RHEA_TARGET_TOE_IN  = RHEA_BASE_FPA - 10
RHEA_TARGET_TOE_OUT = RHEA_BASE_FPA + 10

TRIALS = [
    # Baseline (mocap) paired with Slow (IMU)
    ('Rhea Baseline ToeIn',  'outputs/TreadmillWalkingBaselineToeIn_001_Rhea.csv',  'outputs/Trial_1_Slow_TreadmillWalking_ToeIn_Rhea.csv'),
    ('Rhea Baseline ToeOut', 'outputs/TreadmillWalkingBaselineToeOut_001_Rhea.csv', 'outputs/Trial_1_Slow_TreadmillWalking_ToeOut_Rhea.csv'),
    # Training (mocap) paired with Haptic (IMU)
    ('Rhea Haptic ToeIn',    'outputs/TreadmillWalkingTraining_ToeIn_001_Rhea.csv',  'outputs/Trial_1_Haptic_TreadmillWalking_ToeIn_Rhea.csv'),
    ('Rhea Haptic ToeOut',   'outputs/TreadmillWalkingTraining_ToeOut_001_Rhea.csv', 'outputs/Trial_1_Haptic_TreadmillWalking_ToeOut_Rhea.csv'),
]


# ============================================================
# HELPERS
# ============================================================
def load_mocap(mocap_file):
    with open(mocap_file) as f:
        lines = f.readlines()
    name_row         = lines[3].strip().split(',')
    marker_names_raw = name_row[2:]
    cols = ['Frame', 'Time']
    for i in range(0, len(marker_names_raw), 3):
        raw   = marker_names_raw[i]
        short = raw.split(':')[1] if ':' in raw else raw
        cols += [short + ' X', short + ' Y', short + ' Z']
    df = pd.read_csv(mocap_file, skiprows=7, header=0, low_memory=False)
    df.columns = cols[:len(df.columns)]
    return df.ffill().astype('float64')


def ge_from_heel_height(data, side, fs=100):
    heel_y = data['RCAL Y' if side == 'right' else 'LCAL Y'].to_numpy()
    toe_y  = data['RMT2 Y' if side == 'right' else 'LMT2 Y'].to_numpy()
    min_dist = int(fs * 0.5)
    hc_idx, _ = find_peaks(-heel_y, distance=min_dist, prominence=0.03)
    to_idx, _ = find_peaks(-toe_y,  distance=min_dist, prominence=0.03)
    return {
        'hc_index': hc_idx,
        'hc_value': heel_y[hc_idx],
        'to_index': to_idx,
        'to_value': toe_y[to_idx],
    }


def load_imu_fpa(imu_file):
    raw   = pd.read_csv(imu_file)
    steps = raw[raw['fpa'].notna() & (raw['fpa'] != '')].copy()
    steps['fpa'] = steps['fpa'].astype(float)
    return steps['fpa'].to_numpy()


# ============================================================
# PASS 1 — collect data for all trials to find global y range
# ============================================================
trial_data = []
for label, mocap_file, imu_file in TRIALS:
    if not os.path.exists(mocap_file) or not os.path.exists(imu_file):
        trial_data.append(None)
        continue
    data_mocap    = load_mocap(mocap_file)
    mocap_event_r = ge_from_heel_height(data_mocap, 'right', fs=MOCAP_FS)
    fpa_mocap_r   = fpa_mocap.get_fpa_stance(fpa_mocap.get_fpa(data_mocap, 'right'), mocap_event_r)
    imu_device_fpa = load_imu_fpa(imu_file)
    fpa_mocap_r    = fpa_mocap_r[2:-1]
    imu_device_fpa = imu_device_fpa[2:-1]
    offset         = np.mean(imu_device_fpa) - np.mean(fpa_mocap_r)
    imu_corr       = imu_device_fpa - offset
    trial_data.append((label, fpa_mocap_r, imu_device_fpa, imu_corr))

global_ylim = [-80, 80]

# ============================================================
# PASS 2 — plot each trial with shared y axis
# ============================================================
for entry in trial_data:
    if entry is None:
        print('  Skipping — file(s) not found.')
        continue
    label, fpa_mocap_r, imu_device_fpa, imu_corr = entry
    print(f'\n=== {label} ===')

    n_steps = min(len(fpa_mocap_r), len(imu_device_fpa))
    rmse_raw  = np.sqrt(np.mean((imu_device_fpa[:n_steps] - fpa_mocap_r[:n_steps]) ** 2))
    rmse_corr = np.sqrt(np.mean((imu_corr[:n_steps]       - fpa_mocap_r[:n_steps]) ** 2))

    print(f'  Mocap right : {np.mean(fpa_mocap_r):.2f} ± {np.std(fpa_mocap_r):.2f}°  (n={len(fpa_mocap_r)})')
    print(f'  IMU device  : {np.mean(imu_device_fpa):.2f} ± {np.std(imu_device_fpa):.2f}°  (n={len(imu_device_fpa)})')
    print(f'  Offset      : {np.mean(imu_device_fpa) - np.mean(fpa_mocap_r):+.2f}°')
    print(f'  IMU corrected: {np.mean(imu_corr):.2f} ± {np.std(imu_corr):.2f}°')
    print(f'  RMSE (raw)  : {rmse_raw:.2f}°  (n={n_steps} steps)')
    print(f'  RMSE (corr) : {rmse_corr:.2f}°  (n={n_steps} steps)')

    mocap_aligned    = fpa_mocap_r[:n_steps]
    imu_aligned      = imu_device_fpa[:n_steps]
    imu_corr_aligned = imu_corr[:n_steps]
    r_raw  = np.corrcoef(mocap_aligned, imu_aligned)[0, 1]
    r_corr = np.corrcoef(mocap_aligned, imu_corr_aligned)[0, 1]
    print(f'  r (raw)     : {r_raw:.3f}')
    print(f'  r (corr)    : {r_corr:.3f}')

    # Deviation from ideal toe-in / toe-out target
    if 'ToeIn' in label:
        rhea_target = RHEA_TARGET_TOE_IN
    else:
        rhea_target = RHEA_TARGET_TOE_OUT
    deviation = np.mean(imu_corr) - rhea_target
    print(f'  Target FPA  : {rhea_target:.2f}°')
    print(f'  Deviation   : {deviation:+.2f}° from ideal (mean IMU corr vs target)')

    fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))
    fig.suptitle(label, fontsize=13, fontweight='bold')

    ax1.plot(fpa_mocap_r, 'b.-', alpha=0.6, lw=1, label=f'Mocap   μ={np.mean(fpa_mocap_r):.1f}°')
    # ax1.plot(imu_device_fpa, 'g.-', alpha=0.5, lw=1, label=f'IMU device    μ={np.mean(imu_device_fpa):.1f}°')
    ax1.plot(imu_corr,    'm.-', alpha=0.7, lw=1, label=f'IMU μ={np.mean(imu_corr):.1f}°')
    ax1.axhline(0, color='k', lw=0.5, ls='--')
    ax1.axhline(rhea_target, color='darkorange', lw=1.2, ls='--',
                label=f'Target {rhea_target:.1f}°  Δ={deviation:+.2f}°')
    ax1.set_title(f'FPA per step  |  RMSE = {rmse_corr:.2f}°')
    ax1.set_xlabel('Step number')
    ax1.set_ylabel('FPA (deg)')
    ax1.set_ylim(global_ylim)
    ax1.legend(fontsize=8)

    ax2.scatter(mocap_aligned, imu_corr_aligned, color='mediumpurple', alpha=0.6, s=25, label=f'IMU corr  r={r_corr:.2f}')
    ax2.plot(global_ylim, global_ylim, 'k--', lw=1, label='Identity (y=x)')
    ax2.set_xlim(global_ylim); ax2.set_ylim(global_ylim)
    ax2.set_aspect('equal')
    ax2.set_title('IMU vs Mocap correlation')
    ax2.set_xlabel('Mocap FPA (deg)')
    ax2.set_ylabel('IMU FPA (deg)')
    ax2.legend(fontsize=8)

    plt.tight_layout()
    filename = f'graphs/{label.replace(" ", "_")}.png'
    plt.savefig(filename, dpi=150)
    print(f'  Saved → {filename}')
    plt.show()
    plt.close()

print('\nDone.')
