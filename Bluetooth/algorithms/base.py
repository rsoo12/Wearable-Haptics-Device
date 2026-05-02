# Shared constants and Protocol interfaces for FPA algorithm plugins.
# A plugin must export FPA and GaitPhase classes matching these protocols.

from typing import Protocol

# Gait phase states (from SageMotion)
EULER_INIT_LEN = 5
stance_status = [EARLY_STANCE, MIDDLE_STANCE, LATE_STANCE, SWING] = range(4)


class FPAAlgorithm(Protocol):
    FPA_this_step: float

    def update_FPA(self, sensor_data: dict, gaitphase_old: int, gaitphase: int) -> None:
        ...


class GaitPhaseDetector(Protocol):
    gaitphase: int
    gaitphase_old: int
    step_count: int
    in_feedback_window: bool

    def update_gaitphase(self, sensor_data: dict) -> None:
        ...
