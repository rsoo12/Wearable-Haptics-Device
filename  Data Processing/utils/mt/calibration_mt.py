# name: calibration_mt.py
# description: sensor-to-body alignment for IMUs
# author: Vu Phan
# date: 2024/01/27


import numpy as np 

from numpy.linalg import norm, inv 
from sklearn.decomposition import PCA 
from tqdm import tqdm 

import sys, os 
sys.path.append('/path/to/IMU_Kinematics_Comparison_v2')

from utils.mt import constant_mt


# --- Get PCA axis --- #
def get_pc1_ax_mt(data):
    ''' Get the rotation axis during walking (for thighs/shanks/feet) or squat (for pelvis) using PCA

    Args:
        + data (pd.DataFrame): walking data of a thigh/shank sensor or squat data of the pelvis sensor

    Returns:
        + pc1_ax (np.array): the first principal component of data
    '''
    data = data - np.mean(data, axis = 0)
    pca  = PCA(n_components = 3)
    pca.fit(data)

    pc1_ax = 1*pca.components_[0]

    return pc1_ax


# --- Find segment to sensor transformation --- #
def sensor_to_segment_mt(data_static, data_walking, walking_period):
    ''' Obtain transformation from segment-to-sensor

    Args:
        + data_static (dict of pd.DataFrame): static data for the vertical axis
        + data_walking (dict of pd.DataFrame): walking data for thigh/shank/foot rotational axis
        + walking_period (list of int): period of 8 strides for calibration

    Returns:
        + seg2sens (dict of pd.DataFrame): segment-to-sensor transformation
    '''
    seg2sens = {}

    for sensor_name in tqdm(data_static.keys()):
        static_acc = 1*data_static[sensor_name][['Acc_X', 'Acc_Y', 'Acc_Z']].to_numpy()
        vy         = np.mean(static_acc, axis = 0)
        fy         = vy/norm(vy)

        side = sensor_name[-1]
        if sensor_name == 'chest':
            fx = np.ones(3) 
            fy = np.ones(3) 
            fz = np.ones(3) # DO NOT CALIBRATE CHEST SENSOR
            
        elif sensor_name == 'pelvis':
            fx = np.ones(3) 
            fy = np.ones(3) 
            fz = np.ones(3) # DO NOT CALIBRATE PELVIS SENSOR

        elif (sensor_name == 'foot_r') or (sensor_name == 'foot_l'):
            walking_gyr = 1*data_walking[sensor_name][['Gyr_X', 'Gyr_Y', 'Gyr_Z']].to_numpy()
            walking_gyr = walking_gyr[walking_period[0]:walking_period[1], :]
            pc1_ax      = get_pc1_ax_mt(walking_gyr)

            if pc1_ax[1] < 0:
                pc1_ax = (-1)*pc1_ax
            
            vx = np.cross(fy, pc1_ax)
            fx = vx/norm(vx)

            vz = np.cross(fx, fy)
            fz = vz/norm(vz)
        
        else:
            fx = np.ones(3) 
            fy = np.ones(3) 
            fz = np.ones(3) # DO NOT CALIBRATE THIGH OR SHANK SENSOR
        
        seg2sens[sensor_name] = np.array([fx, fy, fz])

    return seg2sens


# --- Get calibrated IMU data --- #
# NOTE: only apply calibration for foot sensors
def get_calib_imu_data_mt(imu_data_mt, seg2sens):
    ''' Apply calibration to get linear accelerations and angular velocities in segment frames

    Args:
        + imu_data_mt (dict of pd.DataFrame): data to be calibrated
        + seg2sens (dict of pd.DataFrame): segment-to-sensor transformation

    Returns:
        + cal_imu_data_mt (dict of pd.DataFrame): calibrated data of all sensors
    '''
    cal_imu_data_mt = {}

    for sensor_name in tqdm(imu_data_mt.keys()):
        if sensor_name == 'foot_r' or sensor_name == 'foot_l':
            cal_imu_data_mt[sensor_name] = 1*imu_data_mt[sensor_name]
            cal_imu_data_mt[sensor_name][['Acc_X', 'Acc_Y', 'Acc_Z']] = np.dot(seg2sens[sensor_name], imu_data_mt[sensor_name][['Acc_X', 'Acc_Y', 'Acc_Z']].T).T
            cal_imu_data_mt[sensor_name][['Gyr_X', 'Gyr_Y', 'Gyr_Z']] = np.dot(seg2sens[sensor_name], imu_data_mt[sensor_name][['Gyr_X', 'Gyr_Y', 'Gyr_Z']].T).T
        else:
            pass

    return cal_imu_data_mt


