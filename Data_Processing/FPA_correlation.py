import sys, os
sys.path.insert(0, os.path.dirname(__file__))

import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import find_peaks

from utils.mocap import fpa_mocap

os.makedirs('graphs', exist_ok=True)

MOCAP_FS = 100

TRIALS = [
    ('Spoken Feedback Toe-In',  'outputs/TreadmillWalkingBaselineToeIn_001_Rhea.csv',   'outputs/Trial_1_Slow_TreadmillWalking_ToeIn_Rhea.csv'),
    ('Spoken Feedback Toe-Out', 'outputs/TreadmillWalkingBaselineToeOut_001_Rhea.csv',  'outputs/Trial_1_Slow_TreadmillWalking_ToeOut_Rhea.csv'),
    ('Haptic Feedback Toe-In',    'outputs/TreadmillWalkingTraining_ToeIn_001_Rhea.csv',  'outputs/Trial_1_Haptic_TreadmillWalking_ToeIn_Rhea.csv'),
    ('Haptic Feedback Toe-Out',   'outputs/TreadmillWalkingTraining_ToeOut_001_Rhea.csv', 'outputs/Trial_1_Haptic_TreadmillWalking_ToeOut_Rhea.csv'),
]

COLORS  = ['steelblue', 'cornflowerblue', 'mediumpurple', 'orchid']
MARKERS = ['o', 'o', 'o', 'o']


def load_mocap(mocap_file):
    with open(mocap_file) as f:
        lines = f.readlines()
    marker_names_raw = lines[3].strip().split(',')[2:]
    cols = ['Frame', 'Time']
    for i in range(0, len(marker_names_raw), 3):
        raw = marker_names_raw[i]
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
    return {'hc_index': hc_idx, 'hc_value': heel_y[hc_idx],
            'to_index': to_idx, 'to_value': toe_y[to_idx]}


def load_imu_fpa(imu_file):
    raw = pd.read_csv(imu_file)
    steps = raw[raw['fpa'].notna() & (raw['fpa'] != '')].copy()
    steps['fpa'] = steps['fpa'].astype(float)
    return steps['fpa'].to_numpy()


all_mocap, all_imu = [], []
fig, ax = plt.subplots(figsize=(7, 7))

for (label, mocap_file, imu_file), color, marker in zip(TRIALS, COLORS, MARKERS):
    if not os.path.exists(mocap_file) or not os.path.exists(imu_file):
        print(f'Skipping {label} — file(s) not found.')
        continue

    dm = load_mocap(mocap_file)
    events = ge_from_heel_height(dm, 'right', fs=MOCAP_FS)
    mocap_fpa = fpa_mocap.get_fpa_stance(fpa_mocap.get_fpa(dm, 'right'), events)[2:-1]
    imu_fpa   = load_imu_fpa(imu_file)[2:-1]

    offset   = np.mean(imu_fpa) - np.mean(mocap_fpa)
    imu_corr = imu_fpa - offset

    n = min(len(mocap_fpa), len(imu_corr))
    mocap_aligned = mocap_fpa[:n]
    imu_aligned   = imu_corr[:n]

    r = np.corrcoef(mocap_aligned, imu_aligned)[0, 1]
    rmse = np.sqrt(np.mean((imu_aligned - mocap_aligned) ** 2))

    ax.scatter(mocap_aligned, imu_aligned,
               color=color, marker=marker, alpha=0.6, s=30,
               label=f'{label}  r={r:.2f}  RMSE={rmse:.1f}°')

    all_mocap.extend(mocap_aligned)
    all_imu.extend(imu_aligned)

all_mocap = np.array(all_mocap)
all_imu   = np.array(all_imu)
r_all     = np.corrcoef(all_mocap, all_imu)[0, 1]
rmse_all  = np.sqrt(np.mean((all_imu - all_mocap) ** 2))

pad = 3
lim = [min(all_mocap.min(), all_imu.min()) - pad,
       max(all_mocap.max(), all_imu.max()) + pad]

ax.plot(lim, lim, 'k--', lw=1, label='Identity (y = x)')
ax.set_xlim(lim)
ax.set_ylim(lim)
ax.set_aspect('equal')
ax.set_xlabel('Mocap FPA (deg)', fontsize=12)
ax.set_ylabel('IMU FPA (deg)', fontsize=12)
ax.set_title(f'Rhea – IMU vs Mocap (all trials)\nr={r_all:.3f}  RMSE={rmse_all:.2f}°', fontsize=13)
ax.legend(fontsize=9)
ax.grid(True, alpha=0.3)

plt.tight_layout()
plt.savefig('graphs/Rhea_All_Correlation.png', dpi=150)
print(f'Saved → graphs/Rhea_All_Correlation.png')
plt.show()
plt.close()
