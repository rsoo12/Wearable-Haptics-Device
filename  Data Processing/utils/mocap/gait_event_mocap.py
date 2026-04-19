# name: gait_event_mocap.py
# description: identify gait events from mocap data
# author: Vu Phan
# date: 2024/06/05


import pandas as pd
import numpy as np

from tqdm import tqdm
from scipy import signal
from scipy.signal import find_peaks


# Get marker trajectory based on the selected ge method
def get_marker_traj(s_mocap_data):
    ''' Get marker trajectory for gait event detection 

    Args:
        + s_mocap_data (pd.DataFrame): synchronized mocap data

    Returns:
        + marker_traj_r (dict of np.array): marker trajectory for gait event detection of the right leg
        + marker_traj_l (dict of np.array): marker trajectory for gait event detection of the left leg
    '''
    sacrum_z_r = s_mocap_data['RPS2 Z'].to_numpy()
    sacrum_z_l = s_mocap_data['LPS2 Z'].to_numpy()
    sacrum_z   = (sacrum_z_r + sacrum_z_l)/2

    heel_z_r = s_mocap_data['RCAL Z'].to_numpy()
    heel_z_l = s_mocap_data['LCAL Z'].to_numpy()

    try:
        mt_z_r = s_mocap_data['RMT2 Z'].to_numpy()
        mt_z_l = s_mocap_data['LMT2 Z'].to_numpy()
    except:
        mt_z_r = s_mocap_data['R2MT Z'].to_numpy()
        mt_z_l = s_mocap_data['L2MT Z'].to_numpy()

    marker_traj_r   = {'marker_sacrum_z': sacrum_z,
                       'marker_heel_z': heel_z_r,
                       'marker_mt_z': mt_z_r}
    marker_traj_l = {'marker_sacrum_z': sacrum_z,
                     'marker_heel_z': heel_z_l,
                     'marker_mt_z': mt_z_l}

    return marker_traj_r, marker_traj_l


# Method using the distance from heel and toe/metatarsal markers to the sacrum
def ge_heel_toe_sacrum(marker_traj, fs = 100, remove = 10):
    ''' Obtain gait events from the distance between heel and toe/metatarsal markers to the sacrum

    Args:
        + marker_traj (dict of np.array): dictionary of marker trajectories
        + fs (int): sampling rate of the mocap data
        + remove (int): number of data points to remove at the beginning and end of the gait events
    
    Returns:
        + gait_events (dict of np.array): dictionary of gait events
    '''
    min_peak_distance_hc = fs*0.5
    min_peak_distance_to = fs*0.5
    gait_events = {'hc_index': [], 'hc_value': [], 'to_index': [], 'to_value': []}

    heel_marker_z = marker_traj['marker_heel_z']
    toe_marker_z  = marker_traj['marker_mt_z']
    sacrum_marker_z = marker_traj['marker_sacrum_z']

    heel_distance_z = heel_marker_z - sacrum_marker_z
    temp_hc_index, temp_hc_value = find_peaks(heel_distance_z, height = [0, 1], distance = min_peak_distance_hc)
    hc_index                     = 1*temp_hc_index
    hc_value                     = 1*temp_hc_value['peak_heights']

    toe_distance_z = sacrum_marker_z - toe_marker_z
    temp_to_index, temp_to_value = find_peaks(toe_distance_z, height = [0, 1], distance = min_peak_distance_to)
    to_index                     = 1*temp_to_index
    to_value                     = 1*temp_to_value['peak_heights']

    gait_events['hc_index'] = hc_index[remove:-remove]
    gait_events['hc_value'] = hc_value[remove:-remove]
    gait_events['to_index'] = to_index[remove:-remove]
    gait_events['to_value'] = to_value[remove:-remove]

    return gait_events



