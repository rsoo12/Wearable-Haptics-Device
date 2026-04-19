# name: synchronization.py
# description: synchronize mocap and IMU data
# author: Vu Phan
# date: 2024/06/05


import pandas as pd
import numpy as np
from tqdm import tqdm
from scipy import signal

import sys, os
sys.path.append('/path/to/FPA_Calibration')

from utils import common
from utils.mt import constant_mt


# --- Get vertical acceleration from a specific IMU --- #
def get_vertical_acc_mt(one_imu_data):
    ''' Get vertical acceleration of an IMU data
    Args:
        + one_imu_data (pd.DataFrame): data from the desired sensor

    Returns:
        + vertical_acc_mt (np.array): vertical acceleration (gravity relatively removed)
    '''
    vertical_acc_mt = 1*one_imu_data['Acc_X'].to_numpy()
    vertical_acc_mt -= constant_mt.EARTH_G_ACC

    return vertical_acc_mt


# --- Get vertical acceleration from a spcific marker --- #
def get_vertical_acc_mocap(one_marker_data):
    ''' Get vertical acceleration of a marker

    Args:
        + one_marker_data (pd.DataFrame): vertical motion of a marker in the mocap data

    Returns:
        + vertical_acc_mocap (np.array): vertical acceleration
    '''
    vertical_acc_mocap = 1*one_marker_data.to_numpy()
    vertical_acc_mocap = np.diff(vertical_acc_mocap)/(1.0/constant_mt.MT_SAMPLING_RATE)
    vertical_acc_mocap = np.diff(vertical_acc_mocap)/(1.0/constant_mt.MT_SAMPLING_RATE)

    return vertical_acc_mocap


# --- Identify the hop period with mocap data --- #
def get_hop_id_mocap(one_mocap_data):
    ''' Get hop id from mocap

    Args:
        + one_marker_data (pd.DataFrame): vertical motion of a marker in the mocap data

    Returns:
        + hop_id_mocap (int): id of the mid hop
    '''
    hop_id_mocap = np.where(one_mocap_data == np.max(one_mocap_data))[0][0]

    return hop_id_mocap


# --- Get information for sync'ing --- #
def get_sync_info(pelvis_vertical_acc_mt, pelvis_vertical_acc_mocap, hop_id_mocap, window = 300, iters = 5000):
    ''' Get information for sync'ing IMU and mocap data

    Args:
        + pelvis_vertical_acc_mt (np.array): vertical acceleration of the pelvis sensor (gravity relatively removed)
        + pelvis_vertical_acc_mocap (np.array): vertical acceleration of the pelvis sensor
        + window, iters (int): parameters for matching IMU and mocap data

    Returns:
        + first_start (str): 'imu' or 'mocap'
        + shifting_id (int): shifting amount for IMU or mocap to sync
    '''
    shifting_id = 0
    prev_err    = 1e5

    error = []
    start_mocap = hop_id_mocap - int(window/2)
    stop_mocap = hop_id_mocap + int(window/2)
    for i in range(iters):
        if i > start_mocap:
            break
        start_imu = start_mocap - i
        stop_imu = stop_mocap - i
        curr_err = common.get_rmse(pelvis_vertical_acc_mocap[start_mocap:stop_mocap], pelvis_vertical_acc_mt[start_imu:stop_imu])
        error.append(curr_err)

        if curr_err < prev_err:
            shifting_id = i + 2
            prev_err = curr_err

    mocap_error = min(error)
    mocap_shifting_id = shifting_id

    # import matplotlib.pyplot as plt
    # breakpoint()

    error = []
    for i in range(iters):
        start_imu = start_mocap + i
        stop_imu = stop_mocap + i
        if stop_imu > len(pelvis_vertical_acc_mt):
            break
        curr_err = common.get_rmse(pelvis_vertical_acc_mocap[start_mocap:stop_mocap], pelvis_vertical_acc_mt[start_imu:stop_imu])
        error.append(curr_err)

        if curr_err < prev_err:
            shifting_id = i - 2
            prev_err = curr_err

    mt_err = min(error)
    mt_shifting_id = shifting_id

    # breakpoint()

    if mocap_error < mt_err:
        shifting_id = mocap_shifting_id
        first_start = 'mocap'
    else:
        shifting_id = mt_shifting_id
        first_start = 'imu'

    return first_start, shifting_id


# --- Synchronize Xsens IMU and mocap data --- #
def sync_mt_mocap(imu_data_mt, f_mocap_data, fp_both = [], fp_flag = False, vis = False, iters = 5000, shifting_return = False):
    ''' Synchronize Xsens and mocap data (in-lab)

    Args:
        + imu_data_mt (dict of pd.DataFrame): data from all sensors
        + f_mocap_data (pd.DataFrame): filtered mocap data
        + display (bool): display sync'ed acceleration between the two modalities, False as default

    Returns:
        + s_imu_data_mt (dict of pd.DataFrame): sync'ed data of all sensors
        + s_mocap_data (pd.DataFrame): sync'ed mocap data
    '''
    pelvis_vertical_acc_mt = get_vertical_acc_mt(imu_data_mt['pelvis'])
    pelvis_vertical_acc_mocap = get_vertical_acc_mocap(f_mocap_data['RPS1 Y'])
    hop_id_mocap = get_hop_id_mocap(pelvis_vertical_acc_mocap[0:int(len(pelvis_vertical_acc_mocap)/2)])

    first_start, shifting_id = get_sync_info(pelvis_vertical_acc_mt, pelvis_vertical_acc_mocap, hop_id_mocap, iters = iters)

    s_imu_data_mt = {}
    s_fp_data     = {}
    if first_start == 'imu':
        for sensor_name in imu_data_mt.keys():
            s_imu_data_mt[sensor_name] = 1*imu_data_mt[sensor_name].iloc[shifting_id::, :]
            s_imu_data_mt[sensor_name] = s_imu_data_mt[sensor_name].reset_index()
            s_imu_data_mt[sensor_name] = s_imu_data_mt[sensor_name].iloc[:, 1:]
        s_mocap_data = 1*f_mocap_data
        if fp_flag == True:
            s_fp_data['target']   = 1*fp_both[0]
            s_fp_data['adjacent'] = 1*fp_both[1]
    else:
        for sensor_name in imu_data_mt.keys():
            s_imu_data_mt[sensor_name] = 1*imu_data_mt[sensor_name]
        s_mocap_data = 1*f_mocap_data.iloc[shifting_id::, :]
        s_mocap_data = s_mocap_data.reset_index()
        s_mocap_data = s_mocap_data.iloc[:, 1:]
        if fp_flag == True:
            s_fp_data['target'] = 1*fp_both[0][shifting_id::, :]
            s_fp_data['target'] = s_fp_data['target'].reset_index()
            s_fp_data['target'] = s_fp_data['target'].iloc[:, 1:]

            s_fp_data['adjacent'] = 1*fp_both[1][shifting_id::, :]
            s_fp_data['adjacent'] = s_fp_data['adjacent'].reset_index()
            s_fp_data['adjacent'] = s_fp_data['adjacent'].iloc[:, 1:]

    if vis == True:
        import matplotlib.pyplot as plt

        print(first_start)
        print('Shifting ID = ' + str(shifting_id))

        if first_start == 'imu':
            plt.plot(pelvis_vertical_acc_mocap, label = 'mocap')
            plt.plot(pelvis_vertical_acc_mt[shifting_id + 2::], label = ' imu')
        else:
            plt.plot(pelvis_vertical_acc_mocap[shifting_id - 2::], label = 'mocap')
            plt.plot(pelvis_vertical_acc_mt, label = 'imu')

        plt.legend()

        plt.show()

    if fp_flag == True:
        return s_imu_data_mt, s_mocap_data, s_fp_data
    else:
        if shifting_return:
            return s_imu_data_mt, s_mocap_data, shifting_id, first_start
        else:
            return s_imu_data_mt, s_mocap_data


