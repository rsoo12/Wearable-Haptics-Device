# name: gait_event_mt.py
# description: compute gait events from foot IMU data


import pandas as pd
import numpy as np

from tqdm import tqdm
from scipy import signal, integrate, fft 
from scipy.signal import find_peaks

import sys, os 
sys.path.append('/path/to/IMU_Kinematics_Comparison_v2')

from utils.mt import constant_mt


# --- Low-pass filter data before tracking heel contacts and toe-offs --- #
def lp_filter(i_signal, fs = constant_mt.MT_SAMPLING_RATE, fc = constant_mt.MT_FILTER_CUTOFF_IMU, order = constant_mt.MT_FILTER_ORDER):
    ''' Low-pass filter to improve find_peaks for tracking heel contacts and toe-offs

    Args:
        + i_signal (np.array): input signal

    Returns:
        + filtered_signal (np.array): filtered signal
    '''
    Wn = fc*2/fs
    b, a = signal.butter(order, Wn, btype = 'low')

    filtered_signal = signal.filtfilt(b, a, i_signal)

    return filtered_signal


# --- Get heel contacts and toe-offs --- #
def detect_gait_events_from_foot(foot_z, fs = constant_mt.MT_SAMPLING_RATE, remove = 10, vis = False):
    ''' Detect heel contacts and toe-offs from foot IMU data

    Args:
        + foot_z (np.array): vertical acceleration of the foot IMU
        + fs (int): sampling rate
        + vis (bool): visualize the detected heel contacts and toe-offs
    
    Returns:
        + gait_events (dict of np.array): index and value arrays of heel strike and toe-offs
    '''
    min_peak_distance = fs*0.3
    gait_events = {'hc_index': [], 'hc_value': [], 'to_index': [], 'to_value': []}

    foot_z_filtered = lp_filter(foot_z, fs = fs)

    ms_index, ms_value = find_peaks(foot_z_filtered, height = [1.5, 10], distance = min_peak_distance)
    ms_value           = ms_value['peak_heights']
    stance_index, stance_value = find_peaks(-foot_z_filtered, height = 0.1, distance = min_peak_distance)
    
    for id_ in ms_index:
        try:
            temp_id = np.where(stance_index > id_)[0][0]
            if stance_index[temp_id] not in gait_events['hc_index']:
                gait_events['hc_index'].append(stance_index[temp_id])
                gait_events['hc_value'].append(foot_z_filtered[stance_index[temp_id]])

            temp_id = np.where(stance_index < id_)[0][-1]
            if stance_index[temp_id] not in gait_events['to_index']:
                gait_events['to_index'].append(stance_index[temp_id])
                gait_events['to_value'].append(foot_z_filtered[stance_index[temp_id]]) 
            
        except:
            pass

    gait_events['hc_index'] = np.array(gait_events['hc_index'])
    gait_events['hc_value'] = np.array(gait_events['hc_value'])
    gait_events['to_index'] = np.array(gait_events['to_index'])[remove:-remove]
    gait_events['to_value'] = np.array(gait_events['to_value'])[remove:-remove]
    gait_events['ms_index'] = 1*ms_index
    gait_events['ms_value'] = 1*ms_value

    if vis:
        import matplotlib.pyplot as plt
        plt.plot(foot_z_filtered, 'k', alpha = 0.7)
        plt.plot(ms_index, ms_value, 'ro')
        plt.plot(gait_events['hc_index'], gait_events['hc_value'], 'bo')
        plt.plot(gait_events['to_index'], gait_events['to_value'], 'rx')
        plt.show()

    return gait_events



def sync_gait_event(mocap_event, mt_raw_event, mt_calib_event):
    start_id_r          = np.max([mt_raw_event['to_index'][0], mt_calib_event['to_index'][0], mocap_event['to_index'][0]])
    mocap_start_id_r    = np.where(np.abs(mocap_event['to_index'] - start_id_r) < 5)[0][0]
    mt_raw_start_id_r   = np.where(np.abs(mt_raw_event['to_index'] - start_id_r) < 5)[0][0]
    mt_calib_start_id_r = np.where(np.abs(mt_calib_event['to_index'] - start_id_r) < 5)[0][0]

    end_id_r          = np.min([mt_raw_event['to_index'][-1], mt_calib_event['to_index'][-1], mocap_event['to_index'][-1]])
    mocap_end_id_r    = np.where(np.abs(mocap_event['to_index'] - end_id_r) < 5)[0][0]
    mt_raw_end_id_r   = np.where(np.abs(mt_raw_event['to_index'] - end_id_r) < 5)[0][0]
    mt_calib_end_id_r = np.where(np.abs(mt_calib_event['to_index'] - end_id_r) < 5)[0][0]

    mocap_event['to_index'] = mocap_event['to_index'][mocap_start_id_r:mocap_end_id_r]
    mt_raw_event['to_index']       = mt_raw_event['to_index'][mt_raw_start_id_r:mt_raw_end_id_r]
    mt_calib_event['to_index'] = mt_calib_event['to_index'][mt_calib_start_id_r:mt_calib_end_id_r]

    mocap_start_id_hc_r    = np.where(mocap_event['hc_index'] > start_id_r)[0][0]
    mt_raw_start_id_hc_r   = np.where(mt_raw_event['hc_index'] > start_id_r)[0][0]
    mt_calib_start_id_hc_r = np.where(mt_calib_event['hc_index'] > start_id_r)[0][0]
    mocap_end_id_hc_r      = np.where(mocap_event['hc_index'] < end_id_r)[0][-1]
    mt_raw_end_id_hc_r     = np.where(mt_raw_event['hc_index'] < end_id_r)[0][-1]
    mt_calib_end_id_hc_r   = np.where(mt_calib_event['hc_index'] < end_id_r)[0][-1]

    mocap_event['hc_index']    = mocap_event['hc_index'][mocap_start_id_hc_r:mocap_end_id_hc_r]
    mt_raw_event['hc_index']   = mt_raw_event['hc_index'][mt_raw_start_id_hc_r:mt_raw_end_id_hc_r]
    mt_calib_event['hc_index'] = mt_calib_event['hc_index'][mt_calib_start_id_hc_r:mt_calib_end_id_hc_r]

    return mocap_event, mt_raw_event, mt_calib_event



