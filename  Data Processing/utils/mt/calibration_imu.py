# calibration_imu.py
# Sensor-to-segment calibration for a foot IMU without mocap.
#
# Sensor orientation assumed:
#   Y = toe (forward), Z = up (confirmed by az ≈ 9.81 at rest), X = mediolateral
#
# Why two data sources are needed:
#   Static standing  → accelerometer gives gravity direction (resolves roll + pitch)
#   Walking strides  → gyro PCA gives mediolateral axis (resolves yaw / FPA offset)
#   Gravity alone cannot determine yaw — it is vertical and yaw rotates around it.
#
# Output:
#   A scalar FPA placement offset (degrees) to subtract from raw IMU FPA values.

import numpy as np
from numpy.linalg import norm
from sklearn.decomposition import PCA


# Sensor Y axis = toe direction
SENSOR_FORWARD = np.array([0., 1., 0.])


# ------------------------------------------------------------------ #
# Internal helpers
# ------------------------------------------------------------------ #

def _gravity_axis(static_acc):
    """Unit vector in the gravity direction, measured in sensor frame."""
    g = np.mean(static_acc, axis=0)
    return g / norm(g)


def _mediolateral_axis(walking_gyr, side):
    """
    First principal component of walking gyro = the axis the foot rotates
    around most during gait = mediolateral axis.

    PCA gives an unsigned direction; we fix the sign so the axis points
    laterally (away from the body midline).

    For this sensor (Y=toe, Z=up, X=mediolateral):
      right foot: lateral = +X  →  ensure pc1[0] > 0
      left  foot: lateral = -X  →  ensure pc1[0] < 0
    """
    centred = walking_gyr - np.mean(walking_gyr, axis=0)
    pca = PCA(n_components=3)
    pca.fit(centred)
    pc1 = pca.components_[0].copy()

    if side == 'r':
        if pc1[0] < 0:
            pc1 = -pc1
    else:
        if pc1[0] > 0:
            pc1 = -pc1

    return pc1


def _rotation_matrix(static_acc, walking_gyr, side):
    """
    Build a 3x3 rotation matrix R such that  cal_data = R @ sensor_data.

    After rotation the axes are:
      new X (R[0]) = anatomical forward (toe direction)
      new Y (R[1]) = vertical (up)
      new Z (R[2]) = mediolateral (lateral)
    """
    fy = _gravity_axis(static_acc)               # vertical in sensor frame
    fz = _mediolateral_axis(walking_gyr, side)   # mediolateral in sensor frame

    # forward = vertical × mediolateral  (right-hand rule: up × lateral = forward)
    fx = np.cross(fy, fz);  fx /= norm(fx)

    # re-orthogonalise fz against the corrected fx
    fz = np.cross(fx, fy);  fz /= norm(fz)

    return np.array([fx, fy, fz])


def _fpa_offset_from_matrix(R):
    """
    Signed angle (deg) from the sensor's toe axis (sensor Y = [0,1,0]) to
    the calibrated forward axis (R[0]), projected onto the horizontal plane.

    This is the yaw misalignment caused by imperfect sensor placement.
    Subtract it from raw IMU FPA values to correct.
    """
    fy = R[1]   # vertical axis in sensor frame
    fx = R[0]   # calibrated forward axis in sensor frame

    def to_horizontal(v):
        p = v - np.dot(v, fy) * fy
        return p / norm(p)

    fx_h = to_horizontal(fx)
    sf_h = to_horizontal(SENSOR_FORWARD)

    cross = np.cross(sf_h, fx_h)
    sign  = np.sign(np.dot(cross, fy))
    angle = float(sign * np.degrees(np.arccos(np.clip(np.dot(sf_h, fx_h), -1., 1.))))
    return angle


# ------------------------------------------------------------------ #
# Public API
# ------------------------------------------------------------------ #

def calibrate(imu_df, fs, side='r', static_secs=5):
    """
    Estimate the FPA sensor-placement offset from static + walking IMU data.

    Args:
        imu_df      : pd.DataFrame with columns Acc_X/Y/Z (m/s²) and
                      Gyr_X/Y/Z (rad/s).  First `static_secs` seconds must
                      be standing still with the foot pointed straight ahead.
        fs          : sampling rate in Hz (int)
        side        : 'r' (right foot) or 'l' (left foot)
        static_secs : length of the standing-still period at the start (s)

    Returns:
        offset_deg (float) : subtract this from raw IMU FPA values.
                             E.g.  corrected_fpa = device_fpa - offset_deg
        R          (ndarray, 3×3) : rotation matrix, for reference / debugging.

    Limitations:
        • Requires walking data after the static period (for gyro PCA).
        • Yaw (FPA) cannot be determined from static data alone — the walking
          strides are essential to resolve it.
        • Accuracy depends on walking being steady and roughly straight.
    """
    from utils.mt import gait_event_mt

    static_n     = static_secs * fs
    static_acc   = imu_df[['Acc_X', 'Acc_Y', 'Acc_Z']].to_numpy()[:static_n]
    walking_df   = imu_df.iloc[static_n:].reset_index(drop=True)

    # Detect mid-swing peaks in the walking portion to define the PCA window.
    # Swing peaks are negative Gyr_X for right foot, positive for left.
    gyr_detect = -walking_df['Gyr_X'] if side == 'r' else walking_df['Gyr_X']
    ge = gait_event_mt.detect_gait_events_from_foot(gyr_detect.to_numpy(),
                                                    fs=fs, vis=False)

    if len(ge['ms_index']) >= 10:
        start, end = int(ge['ms_index'][2]), int(ge['ms_index'][10])
        print(f'  Calibration PCA window: samples {start}–{end} '
              f'({(end - start) / fs:.1f} s, ~8 strides)')
    else:
        start, end = 0, len(walking_df)
        print('  Warning: fewer than 10 mid-swing peaks detected — '
              'using full walking segment for PCA (less accurate)')

    walking_gyr = walking_df[['Gyr_X', 'Gyr_Y', 'Gyr_Z']].to_numpy()[start:end]

    R      = _rotation_matrix(static_acc, walking_gyr, side)
    offset = _fpa_offset_from_matrix(R)

    return offset, R
