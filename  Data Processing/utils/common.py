# name: common.py
# description: Contain common functions for use
# author: Vu Phan
# date: 2023/06/05


import math
import numpy as np 
from scipy.stats import pearsonr
from scipy.spatial.transform import Rotation as R


# --- Conversion to Euler angles --- #
# From quaternions of Xsens sensors
# Source: MTw_Awinda_User_Manual.pdf (page 77)
def quat_to_euler(quat):
    ''' Convert a quaternion to Euler angles (Xsens sensor)

    Args:
        + quat (np.array): quaternion

    Returns:
        + angle (np.array): Euler angles
    '''
    angle_x = np.rad2deg(math.atan2(2*quat[2]*quat[3] + 2*quat[0]*quat[1], 2*quat[0]**2 + 2*quat[3]**2 - 1))
    angle_y = np.rad2deg(math.asin(2*quat[1]*quat[3] - 2*quat[0]*quat[2]))
    angle_z = np.rad2deg(math.atan2(2*quat[1]*quat[2] + 2*quat[0]*quat[3], 2*quat[0]**2 + 2*quat[1]**2 - 1))

    angle = np.array([angle_x, angle_y, angle_z])

    return angle


# From rotation matrices
def rotmat_to_angle(rotmat):
	''' Convert a rotation matrix to Euler angles

	Args:
		+ t_mat (np.array): rotation matrix

	Returns:
		+ angle (np.array): Euler angles
	'''
	r     = R.from_matrix(rotmat)
	angle = r.as_euler('xyz', degrees = True)

	return angle


# --- Metrics for evaluation --- #
# RMSE
def get_rmse(mocap, imu):
	""" Compute root-mean-square error (RMSE) between mocap- and IMU-based joint angles

	Params:
		+ mocap (np.array): a joint angle computed using mocap 
		+ imu (np.array): a joint angle computed using IMU

	Returns:
		+ rmse (float): RMSE between mocap- and IMU-joint angles
	"""
	mse = np.nanmean(np.square(np.subtract(mocap, imu)))
	rmse = math.sqrt(mse)

	return rmse


# Maximum absolute error
def get_maxae(mocap, imu):
	""" Compute maximum absolute error (MaxAE) between mocap- and IMU-based joint angles

	Params:
		mocap (np.array): a joint angle computed using mocap 
		imu (np.array): a joint angle computed using IMU 

	Returns:
		mae (float): RMSE between mocap- and IMU-joint angles 
	"""
	mae = np.max(np.abs(np.subtract(mocap, imu)))

	return mae


# Pearson correlation coefficient
def get_corrcoef(mocap, imu):
	""" Compute correlation coefficient (r) between mocap- and IMU-based joint angles

	Params:
		mocap (np.array): a joint angle computed using mocap 
		imu (np.array): a joint angle computed using IMU 

	Returns:
		corr_coef (float): correlation coefficient between mocap- and IMU-based joint angles
	"""
	corr_coef, _ = pearsonr(mocap, imu)

	return corr_coef


