# name: preprocessing_mt.py
# description: preprocess IMU data from Xsens
# author: Vu Phan
# date: 2024/01/24


import pandas as pd 
import numpy as np 
from tqdm import tqdm 
from scipy import signal 

import sys, os 
sys.path.append('/path/to/IMU_Kinematics_Comparison_v2')

from utils.mt import constant_mt
from utils import constant_common


# --- Obtain all data from Xsens sensors --- #
# Get data path of a single sensor
def get_data_path_mt(subject, task, sensor_id):
    ''' Get data path (in lab)

    Args:
        + subject (int): subject id
        + task (str): task being performed, e.g., static, walking, squat, etc.
        + sensor_id (str): id of a specific sensor

    Returns:
        + mt_fn (str): filename (with .txt extension)
    '''
    mt_fn = constant_common.IN_LAB_PATH + \
            's' + str(subject) + '/' + constant_common.MT_PATH + \
            constant_common.LAB_TASK_NAME_MAP[task] + '-000_' + sensor_id + constant_common.MT_EXTENSION

    return mt_fn


# Load data from a single sensor
def load_data_mt(mt_fn):
    ''' Load data from a single sensor (i.e., a .txt file)

    Args:
        + mt_fn (str): filename (with .txt extension)

    Returns:
        + mt_data (pd.DataFrame): formatted data of a single sensor
    '''
    with open(mt_fn, 'r') as f:
        txt    = f.readlines()
        header = txt[4].split('\t')

    temp_data = np.genfromtxt(mt_fn, delimiter = '\t', skip_header = 5)
    temp_data = np.delete(temp_data, 1, 1)

    header.pop(1)
    header[-1] = header[-1][0:-1]

    mt_data = pd.DataFrame(temp_data, columns = header)

    return mt_data

# Get data from all sensors
def get_all_data_mt(subject, task, sensor_config):
    ''' Get data from all sensors (in lab)

    Args:
        + subject (int): subject id
        + task (str): task being performed
        + sensor_config (dict): configuration of sensors

    Returns:
        data_mt (dict of pd.DataFrame): data from all sensors
    '''
    data_mt = {}

    for sensor_name in tqdm(sensor_config.keys()):
        sensor_id            = constant_mt.LAB_IMU_NAME_MAP[sensor_config[sensor_name]]
        mt_fn                = get_data_path_mt(subject, task, sensor_id)
        data_mt[sensor_name] = load_data_mt(mt_fn)

    return data_mt


# --- Synchronize data from all sensors --- #
# To fix the frame drops
def get_data_length_mt(data_mt):
    ''' Obtain data length from IMU sensors 

    Args:
        + data_mt (dict of pd.DataFrame): data from all sensors

    Returns:
        + start_counter (int): 
        + stop_counter (int)
    '''
    start_counter = 0
    stop_counter  = 0

    for sensor_name in data_mt.keys():
        start_counter = data_mt[sensor_name]['PacketCounter'].to_numpy()[0]
        stop_counter  = data_mt[sensor_name]['PacketCounter'].to_numpy()[-1]

        check_start_drop = data_mt[sensor_name]['PacketCounter'].to_numpy()[0] - start_counter
        if (check_start_drop > 0) or (check_start_drop < -65535):
            start_counter = data_mt[sensor_name]['PacketCounter'].to_numpy()[0]
        
        check_stop_drop = stop_counter - data_mt[sensor_name]['PacketCounter'].to_numpy()[-1]
        if (check_stop_drop > 0) or (check_stop_drop < -65535):
            stop_counter = data_mt[sensor_name]['PacketCounter'].to_numpy()[-1]

    return start_counter, stop_counter


def match_data_mt(data_mt):
    ''' Synchronize data from all sensors 

    Args: 
        + data_mt (dict of pd.DataFrame): data from all sensors

    Returns:
        + matched_data_mt (dict of pd.DataFrame): sync'ed data of all sensors
    ''' 
    start_counter, stop_counter = get_data_length_mt(data_mt)
    # nan_id                      = np.arange(start_counter, stop_counter, 1)
    nan_id = [start_counter]
    while nan_id[-1] != stop_counter:
        if nan_id[-1] < 65535:
            nan_id.append(nan_id[-1] + 1)
        else: 
            nan_id.append(0)
    nan_id = np.array(nan_id)
    nan_arr                     = np.nan*np.ones(nan_id.shape[0])
    nan_frame                   = pd.DataFrame({'temp': nan_arr}, index = nan_id)
    
    matched_data_mt = {}
    for sensor_name in data_mt.keys():
        temp_frame = data_mt[sensor_name].set_index(data_mt[sensor_name]['PacketCounter']).iloc[:, 1::]
        temp_frame = temp_frame.join(nan_frame, how = 'outer')
        # for col in temp_frame.columns:
        #     temp_frame.loc[temp_frame[col] > 1000] = np.nan
        #     temp_frame.loc[temp_frame[col] < -1000] = np.nan
        temp_frame = temp_frame.interpolate(method = 'linear', limit_area = 'inside')
        # temp_frame = temp_frame.fillna(value = 999)

        interp_frame = temp_frame.loc[nan_id, :]
        interp_frame = interp_frame.iloc[1:-1, 0:-1]

        matched_data_mt[sensor_name]         = 1*interp_frame.reset_index()
        matched_data_mt[sensor_name].columns = data_mt[sensor_name].columns
        matched_data_mt[sensor_name]         = matched_data_mt[sensor_name].interpolate(method = 'linear')

    return matched_data_mt


