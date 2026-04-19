# name: constant_mt.py
# description: constants for Xsens IMUs
# author: Vu Phan
# date: 2024/01/24


# --- Physical constants --- #
EARTH_G_ACC = 9.81 # m/s^2


# --- Experimental setup --- #
# Main experiment
MT_SAMPLING_RATE = 40 # Hz
MT_FILTER_CUTOFF_IMU = 10 # Hz
MT_FILTER_ORDER = 4

# Biomechanical model
MT_BIOMODEL_SAMPLING_RATE = 60 # Hz


# --- FPA calculation --- #
EULER_INIT_LEN = 10


# Sensor id
LAB_IMU_NAME_MAP = {'CHEST':         '00B4D7D4',
                    'PELVIS':        '00B4D7D3', 
                    'THIGH_L_MID':   '00B4D7FD', 
                    'SHANK_L_MID':   '00B4D7CE', 
                    'FOOT_L':        '00B4D7FF', 
                    'THIGH_R_MID':   '00B4D6D1', 
                    'SHANK_R_MID':   '00B4D7FB', 
                    'FOOT_R':        '00B4D7FE',
                    'THIGH_R_HIGH':  '00B4D7D0', 
                    'THIGH_R_LOW':   '00B4D7D8', 
                    'THIGH_R_FRONT': '00B4D7D1', 
                    'SHANK_R_HIGH':  '00B4D7BA', 
                    'SHANK_R_LOW':   '00B4D7D5', 
                    'SHANK_R_FRONT': '00B42961', 
                    'THIGH_L_HIGH':  '00B4D7D2', 
                    'THIGH_L_LOW':   '00B4D7CD', 
                    'THIGH_L_FRONT': '00B4D7D6',
                    'SHANK_L_HIGH':  '00B4D7CF', 
                    'SHANK_L_LOW':   '00B4D7FA', 
                    'SHANK_L_FRONT': '00B42991'}


# For OpenSense
MT_TO_OPENSENSE_MAP = {'pelvis': 'pelvis_imu',
                       'foot_r': 'calcn_r_imu', 'shank_r': 'tibia_r_imu', 'thigh_r': 'femur_r_imu',
                       'foot_l': 'calcn_l_imu', 'shank_l': 'tibia_l_imu', 'thigh_l': 'femur_l_imu'}


# --- MVN processing (or Xsens biomechanical model) --- #
# Data sheets
MVN_JOINT_ANGLE_SHEET  = 'Joint Angles ZXY' # can use 'Joint Angles XZY' as an alternative
MVN_ACCELERATION_SHEET = 'Sensor Free Acceleration'
MVN_MAGNETOMETER_SHEET = 'Sensor Magnetic Field'
MVN_ORIENTATION_SHEET  = 'Sensor Orientation - Quat'

# Name mapping
# MVN_PLACEMENT_MAP = {'torso_imu': None,
#                      'pelvis_imu': 'Pelvis', 
#                      'calcn_r_imu': 'Right Foot', 'tibia_r_imu': 'Right Lower Leg', 'femur_r_imu': 'Right Upper Leg',
#                      'calcn_l_imu': 'Left Foot', 'tibia_l_imu': 'Left Lower Leg', 'femur_l_imu': 'Left Upper Leg'}
MVN_PLACEMENT_MAP = {'chest': None,
                     'pelvis': 'Pelvis', 
                     'foot_r': 'Right Foot', 'shank_r': 'Right Lower Leg', 'thigh_r': 'Right Upper Leg',
                     'foot_l': 'Left Foot', 'shank_l': 'Left Lower Leg', 'thigh_l': 'Left Upper Leg'}

MVN_JOINT_ANGLE_MAP  = {'hip_rotation_l': 'Left Hip Internal/External Rotation', 
                        'hip_flexion_l': 'Left Hip Flexion/Extension', 
                        'hip_adduction_l': 'Left Hip Abduction/Adduction', 
                        'knee_angle_l': 'Left Knee Flexion/Extension', 
                        'ankle_angle_l': 'Left Ankle Dorsiflexion/Plantarflexion',
                        'hip_rotation_r': 'Right Hip Internal/External Rotation', 
                        'hip_flexion_r': 'Right Hip Flexion/Extension', 
                        'hip_adduction_r': 'Right Hip Abduction/Adduction', 
                        'knee_angle_r': 'Right Knee Flexion/Extension', 
                        'ankle_angle_r': 'Right Ankle Dorsiflexion/Plantarflexion'}

