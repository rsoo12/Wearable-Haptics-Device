# name: preprocessing_mocap.py
# description: preprocessing functions for marker-based motion capture data
# author: Vu Phan
# date: 2024/01/27


import numpy as np 
import pandas as pd
from scipy import signal 

import sys, os 
sys.path.append('/path/to/IMU_Kinematics_Comparison_v2')

from utils import constant_common
from utils.mocap import constant_mocap


# --- Obtain all data from marker-based motion capture --- #
# Get data path of the mocap file
def get_data_path_mocap(subject, task):
    ''' Get data path (in lab)

    Args:
        + subject (int): subject id
        + task (str): task being performed, e.g., static, walking, squat, etc.

    Returns:
        + mocap_fn (str): filename (with .txt extension)
    '''
    mocap_fn = constant_common.IN_LAB_PATH + \
               's' + str(subject) + '/' + constant_common.MOCAP_PATH + \
               constant_common.LAB_TASK_NAME_MAP[task] + constant_common.MOCAP_EXTENSION

    return mocap_fn


# Get mocap data
def get_data_mocap(subject, task):
    ''' Obtain the mocap data 

    Args:
        + subject (int): subject id
        + task (str): task being performed, e.g., static, walking, squat, etc.

    Returns:
        + data_mocap (pd.DataFrame): mocap data
    '''
    mocap_fn = get_data_path_mocap(subject, task)

    mocap_data = pd.read_csv(mocap_fn, skiprows = 3, low_memory = False)
    mocap_data = mocap_data.iloc[:, 1:]
    mocap_data = mocap_data.iloc[2:, :]

    names_pos = list(mocap_data.columns)
    names_pos = [name.split(':')[1][0:4] for name in names_pos[1:]]
    names_pos = [''] + names_pos
    names_ax  = mocap_data.iloc[0, :]
    names     = []

    for i in range(len(names_pos)):
        names.append(names_pos[i] + ' ' + names_ax[i])
    names[0] = 'Time'

    mocap_data = mocap_data.iloc[1:, :]
    mocap_data.columns = names

    mocap_data = mocap_data.reset_index()
    mocap_data = mocap_data.iloc[:, 1:]
    mocap_data = mocap_data.astype('float64')

    return mocap_data


# --- Low pass filter mocap data --- #
def lowpass_filter_mocap(mocap_data, fs, fc, fo):
    ''' Low-pass filter the mocap data

    Args:
        + mocap_data (pd.DataFrame): mocap data
        + fs (int): sampling rate of the mocap data
        + fc (int): cut-off frequency of the filter
        + fo (int): order of the filter

    Returns:
        + f_mocap_data (pd.DataFrame): filtered mocap data
    '''
    Wn = fc*2/fs
    b, a = signal.butter(fo, Wn, btype = 'low')
    f_mocap_data = signal.filtfilt(b, a, mocap_data, axis = 0)
    f_mocap_data = pd.DataFrame(f_mocap_data, columns = mocap_data.columns)
    f_mocap_data.iloc[:, 0] = mocap_data.iloc[:, 0]

    return f_mocap_data


# --- Resample mocap data --- #
def resample_mocap(mocap_data, ft):
    ''' Resample mocap data to match IMU data

    Args:
        + mocap_data (pd.DataFrame): mocap data
        + ft (float): target frequency

    Returns:
        + resampled_mocap_data (pd.DataFrame): resampled mocap data
    '''
    ts = 1/ft
    nan_id = np.arange(mocap_data['Time'].to_numpy()[0], mocap_data['Time'].to_numpy()[-1], ts)
    nan_arr = np.nan*np.ones(nan_id.shape[0])
    nan_frame = pd.DataFrame({'temp': nan_arr}, index = nan_id)

    temp_frame = mocap_data.set_index(mocap_data['Time']).iloc[:, 1::]
    temp_frame = temp_frame.join(nan_frame, how = 'outer')
    temp_frame = temp_frame.interpolate(method = 'cubic', limit_area = 'inside')
    interp_frame = temp_frame.loc[nan_id, :]
    interp_frame = interp_frame.iloc[1:-1, 0:-1]

    resampled_mocap_data = 1*interp_frame.reset_index()
    resampled_mocap_data.columns = mocap_data.columns 

    return resampled_mocap_data

