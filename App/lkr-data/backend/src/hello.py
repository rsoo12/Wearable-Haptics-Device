import base64
import json
import math
import struct

from fpa_algorithm import FPA
from gaitphase import GaitPhase

# Same as Bluetooth/vqf_processor.py (fpa_consumer + main() init).
IS_RIGHT_FOOT = True

# Per-session state cache. Warm Lambda containers preserve this.
_sessions = {}


def parse_payload(payload: bytes):
    if len(payload) < 24:
        return None
    ax, ay, az, gx, gy, gz = struct.unpack_from("<6f", payload)
    acc = [ax, ay, az]
    gyr = [gx, gy, gz]
    return gyr, acc


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
        },
        "body": json.dumps(body),
    }


def _get_session_state(session_id):
    state = _sessions.get(session_id)
    if state is None:
        state = {
            "gp": GaitPhase(datarate=180),
            "fpa": FPA(is_right_foot=IS_RIGHT_FOOT, datarate=180),
            "last_key_summary_step": None,
            "last_key_summary": None,
        }
        _sessions[session_id] = state
    return state


def _process_packet(payload: bytes, rate: float, gp: GaitPhase, fpa: FPA):
    """
    Same processing as Bluetooth/vqf_processor.py fpa_consumer body (without asyncio queue).
    """
    parsed = parse_payload(payload)
    if parsed is None:
        return None, "could not parse payload"

    gyr, acc = parsed

    # Expected payload format from MCU:
    #   6 little-endian 32-bit floats = 24 bytes total
    #   [ax, ay, az, gx, gy, gz]
    #   ax/ay/az: accelerometer in m/s²
    #   gx/gy/gz: gyroscope in rad/s

    # convert gyro from rad/s to deg/s for FPA algorithm
    sensor_data = {
        "AccelX": acc[0],
        "AccelY": acc[1],
        "AccelZ": acc[2],
        "GyroX": math.degrees(gyr[0]),
        "GyroY": math.degrees(gyr[1]),
        "GyroZ": math.degrees(gyr[2]),
    }

    gp.update_gaitphase(sensor_data)
    fpa.update_FPA(sensor_data, gp.gaitphase_old, gp.gaitphase)

    print_message = None
    if gp.in_feedback_window:
        print_message = (
            f"Step {gp.step_count}: FPA = {fpa.FPA_this_step:.1f} deg  rate={rate:.1f} Hz"
        )

    return print_message, None


def handler(event, context):
    try:
        raw_body = event.get("body") or "{}"
        body = json.loads(raw_body) if isinstance(raw_body, str) else raw_body
        payload_b64 = body.get("payload_b64")
        rate = float(body.get("rate_hz", 0.0))
        session_id = str(body.get("session_id", "default-session"))
    except Exception as exc:
        return _response(400, {"error": f"Invalid request: {str(exc)}"})

    if not payload_b64:
        return _response(400, {"error": 'Missing "payload_b64"'})

    try:
        payload = base64.b64decode(payload_b64)
    except Exception as exc:
        return _response(400, {"error": f"Invalid payload_b64: {str(exc)}"})

    state = _get_session_state(session_id)
    gp = state["gp"]
    fpa = state["fpa"]

    print_message, parse_err = _process_packet(payload, rate, gp, fpa)
    if parse_err is not None:
        return _response(400, {"error": parse_err})

    key_summary_updated = False
    key_summary = state["last_key_summary"]
    if gp.in_feedback_window and print_message is not None:
        if state["last_key_summary_step"] != gp.step_count:
            state["last_key_summary_step"] = gp.step_count
            key_summary_updated = True
            key_summary = {
                "step": gp.step_count,
                "fpa_deg": round(fpa.FPA_this_step, 3),
                "rate_hz": round(rate, 3),
                "print_message": print_message,
            }
            state["last_key_summary"] = key_summary

    return _response(
        200,
        {
            "session_id": session_id,
            "step": gp.step_count,
            "fpa_deg": round(fpa.FPA_this_step, 3),
            "rate_hz": round(rate, 3),
            "print_message": print_message,
            "in_feedback_window": gp.in_feedback_window,
            "key_summary_updated": key_summary_updated,
            "key_summary": key_summary,
        },
    )
