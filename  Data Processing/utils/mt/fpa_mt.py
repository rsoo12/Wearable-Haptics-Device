# name: fp_mt.py
# description: compute FPA from foot IMU data
# Implementation based on https://www.sagemotion.com/apps/walking-foot-progression-angle-feedback


import math
import transforms3d
import numpy as np
import pandas as pd 

import sys, os 
sys.path.append('/path/to/IMU_Kinematics_Comparison_v2')

from utils.mt import constant_mt


# --- Compute roll and pitch angles from the middle stance to the last toe off --- #
def get_euler_angles(step_data_buffer, fs):
    ''' Compute roll and pitch angles from the middle stance to the last toe off

    Args:
        + step_data_buffer (np.array): IMU data
        + fs (int): sampling rate
    
    Returns:
        + euler_angles_esti (np.array): estimated roll and pitch angles
    '''
    delta_t = 1 / fs
    data_len = len(step_data_buffer)
    euler_angles_esti = np.zeros([data_len, 3])

    gravity_vector = np.zeros([3])
    for i_sample in range(-1, -(constant_mt.EULER_INIT_LEN+1), -1):
        sample_data = step_data_buffer.iloc[i_sample]
        gravity_vector += np.array([sample_data['Acc_X'], sample_data['Acc_Y'], sample_data['Acc_Z']])
    gravity_vector /= constant_mt.EULER_INIT_LEN

    init_sample = data_len - math.ceil(constant_mt.EULER_INIT_LEN/2)
    euler_angles_esti[init_sample:, 0] = np.arctan2(gravity_vector[1], gravity_vector[2])  # axis 0
    euler_angles_esti[init_sample:, 1] = np.arctan2(-gravity_vector[0], np.sqrt(gravity_vector[1] ** 2 + gravity_vector[2] ** 2))  # axis 1

    for i_sample in range(init_sample - 1, -1, -1):
        sample_data = step_data_buffer.iloc[i_sample]
        sample_gyr = np.array([sample_data['Gyr_X'], sample_data['Gyr_Y'], sample_data['Gyr_Z']])

        roll, pitch, yaw = euler_angles_esti[i_sample + 1, :]
        transfer_mat = np.asmatrix([[1, np.sin(roll) * np.tan(pitch), np.cos(roll) * np.tan(pitch)],
                               [0, np.cos(roll), -np.sin(roll)],
                               [0, np.sin(roll) / np.cos(pitch), np.cos(roll) / np.cos(pitch)]])
        angle_augment = np.matmul(transfer_mat, sample_gyr)
        euler_angles_esti[i_sample, :] = euler_angles_esti[i_sample + 1, :] - angle_augment * delta_t
    
    return euler_angles_esti


# --- Transform acceleration data from the sensor frame to the foot frame --- #
def get_rotated_acc(step_data_buffer, euler_angles_esti):
    ''' Transform acceleration data from the sensor frame to the foot frame

    Args:
        + step_data_buffer (np.array): IMU data
        + euler_angles_esti (np.array): estimated roll and pitch angles
    
    Returns:
        + acc_rotated (np.array): rotated acceleration data
    '''
    acc_rotated = np.zeros([len(step_data_buffer), 3])

    for i_sample in range(len(step_data_buffer)):
        sample_data = step_data_buffer.iloc[i_sample]
        sample_acc  = np.array([sample_data['Acc_X'], sample_data['Acc_Y'], sample_data['Acc_Z']])
        dcm_mat = transforms3d.euler.euler2mat(euler_angles_esti[i_sample, 0], euler_angles_esti[i_sample, 1], 0)
        acc_rotated[i_sample, :] = np.matmul(dcm_mat, sample_acc)

    return acc_rotated


# --- Smooth the rotated acceleration data --- #
def smooth(x, window_len, window):
    # if not window in ['flat', 'hanning', 'hamming', 'bartlett', 'blackman']:
    if window == 'flat':  # moving average
        w = np.ones(window_len, 'd')
    else:
        w = eval('np.' + window + '(window_len)')

    y = np.convolve(w / w.sum(), x, mode='same')
    return y

def smooth_acc_rotated(acc_rotated, smooth_win_len = 29):
    ''' Smooth the rotated acceleration data

    Args:
        + acc_rotated (np.array): rotated acceleration data
    
    Returns:
        + acc_rotated_smoothed (np.array): smoothed rotated acceleration data
    '''
    data_len = acc_rotated.shape[0]

    acc_rotated_smoothed = np.zeros(acc_rotated.shape)
    smooth_win_len = min(data_len, smooth_win_len)
    for i_axis in range(2):
        acc_rotated_smoothed[:, i_axis] = smooth(acc_rotated[:, i_axis], smooth_win_len, 'hanning')
    
    return acc_rotated_smoothed


# --- Compute FPA via the maximum acceleration ratio at the normalized peak --- #
def get_fpa_via_max_acc_ratio_at_norm_peak(acc_rotated_smoothed):
    ''' Compute FPA via the maximum acceleration ratio at the normalized peak

    Args:
        + acc_rotated_smoothed (np.array): smoothed rotated acceleration data

    Returns:
        + FPA_estis (float): estimated FPA
    '''
    step_sample_num = acc_rotated_smoothed.shape[0]
    peak_check_start = int(0.4 * step_sample_num)
    acc_second_half = acc_rotated_smoothed[peak_check_start:, :]
    planar_acc_norm = np.linalg.norm(acc_second_half[:, :2], axis = 1)
    max_acc_norm = np.argmax(planar_acc_norm)
    max_acc = acc_second_half[max_acc_norm, :]
    FPA_estis = np.arctan2(max_acc[0], max_acc[1]) * 180 / np.pi

    return FPA_estis


# --- Compute FPA --- #
def get_fpa_mt(data_mt, gait_event, fs = constant_mt.MT_SAMPLING_RATE, side = 'r'):
    ''' Compute FPA from foot IMU data

    Args:
        + data_mt (dict of np.array): IMU data
        + gait_event (dict of np.array): heel contacts and toe-offs
        + fs (int): sampling rate
        + side (str): right or left foot

    Returns:
        + fpa (np.array): FPA values
    '''
    fpa = []

    for i in range(len(gait_event['hc_index'])):
        # try:
        current_hc  = 1*gait_event['hc_index'][i]
        current_to  = 1*gait_event['to_index'][np.where(gait_event['to_index'] > current_hc)[0][0]]
        previous_to = 1*gait_event['to_index'][np.where(gait_event['to_index'] < current_hc)[0][-1]]
        # mid_stance  = int((current_to + previous_to) / 2)
        mid_stance = int(current_hc + 0.2*(current_to - current_hc))

        step_data_buffer  = data_mt[previous_to:mid_stance]
        euler_angles_esti = get_euler_angles(step_data_buffer, fs)

        acc_rotated          = get_rotated_acc(step_data_buffer, euler_angles_esti)
        acc_rotated_smoothed = smooth_acc_rotated(acc_rotated)

        fpa_this_step = get_fpa_via_max_acc_ratio_at_norm_peak(acc_rotated_smoothed)

        if fpa_this_step > 90:
            fpa_this_step = fpa_this_step - 180
        elif fpa_this_step < -90:
            fpa_this_step = fpa_this_step + 180

        if side == 'r':
            fpa_this_step = - fpa_this_step
        else:
            fpa_this_step = fpa_this_step
        
        fpa.append(fpa_this_step)
        # except:
        #     pass

    return fpa





