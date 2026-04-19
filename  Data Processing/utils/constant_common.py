# name: constant_common.py
# description: common constants used in processing
# author: Vu Phan
# date: 2024/01/27


# --- Directory --- #
IN_LAB_PATH = 'data/'
MT_PATH     = 'imu_data/'
MOCAP_PATH  = 'mocap_data/'


# --- File format --- #
MT_EXTENSION    = '.txt'
MVN_EXTENSION   = '.xlsx'
MOCAP_EXTENSION = '.csv'


# --- Name mapping --- #
# Task
LAB_TASK_NAME_MAP = {'static':            't0_static_pose_001',
                     'walking':           't1_walking_001',
                     'treadmill_walking': 't2_treadmill_walking_001',
                     'treadmill_running': 't3_treadmill_running_001',
                     'lat_step':          't4_lat_step_001',
                     'step_up_down':      't5_step_up_down_001',
                     'drop_jump':         't6_drop_jump_001',
                     'cmj':               't7_cmjdl_001',
                     'squat':             't8_squat_001',
                     'step_n_hold':       't9_step_n_hold_001',
                     'sls':               't10_sls_001',
                     'sts':               't11_sts_001', 
                     'sts_x':             't13_xsens_sts_001',
                     'walking_x':         't13_xsens_treadmill_walking_001',
                     'running_x':         't13_xsens_treadmill_running_001'}

MAPPING_TASK_TO_ID = {'static':            0,
                     'walking':           1,
                     'treadmill_walking': 2,
                     'treadmill_running': 3,
                     'lat_step':          4,
                     'step_up_down':      5,
                     'drop_jump':         6,
                     'cmj':               7,
                     'squat':             8,
                     'step_n_hold':       9,
                     'sls':               10,
                     'sts':               11}

MAPPING_TASK_TO_ID_3 = {'static':            0,
                     'treadmill_walking': 2,
                     'treadmill_running': 3,
                     'sts':               11}

# --- Kinematics signs --- #
JA_SIGN = {'hip_adduction_l': -1, 'hip_rotation_l': -1, 'hip_flexion_l': 1,
           'knee_adduction_l': -1, 'knee_rotation_l': -1, 'knee_flexion_l': -1, 
           'ankle_angle_l': 1, 
           'hip_adduction_r': 1, 'hip_rotation_r': 1, 'hip_flexion_r': 1,
           'knee_adduction_r': 1, 'knee_rotation_r': 1, 'knee_flexion_r': -1,
           'ankle_angle_r': 1}


# --- Tuning --- #
TUNING_SUBJECT_LIST = [2, 3]

