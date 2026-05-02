import json
import os
from decimal import Decimal

import boto3

_dynamodb = boto3.resource("dynamodb")


def _get_table():
    table_name = os.environ.get("SESSION_TABLE_NAME")
    if not table_name:
        raise RuntimeError("Missing SESSION_TABLE_NAME")
    return _dynamodb.Table(table_name)


def _json_default(value):
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _response(status_code, body):
    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
        },
        "body": json.dumps(body, default=_json_default),
    }


def _parse_request_json(event):
    raw_body = event.get("body") or "{}"
    if isinstance(raw_body, str):
        return json.loads(raw_body)
    return raw_body


def _extract_method_path(event):
    method = event.get("httpMethod")
    path = event.get("path")
    http = ((event.get("requestContext") or {}).get("http") or {})
    method = http.get("method", method)
    path = event.get("rawPath", path)
    return (method or "").upper(), path or ""


def _to_decimal(value):
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _recalculate_aggregates(items):
    if not items:
        return {
            "session_count": 0,
            "avg_fpa_all_time_deg": None,
            "avg_session_duration_sec": None,
            "total_steps": 0,
            "min_fpa_all_time_deg": None,
            "max_fpa_all_time_deg": None,
        }

    count = len(items)
    avg_fpa_values = [_to_decimal(item.get("avg_fpa_deg", 0)) for item in items]
    duration_values = [_to_decimal(item.get("duration_sec", 0)) for item in items]
    step_values = [int(item.get("step_count", 0)) for item in items]
    return {
        "session_count": count,
        "avg_fpa_all_time_deg": sum(avg_fpa_values) / Decimal(count),
        "avg_session_duration_sec": sum(duration_values) / Decimal(count),
        "total_steps": sum(step_values),
        "min_fpa_all_time_deg": min(avg_fpa_values),
        "max_fpa_all_time_deg": max(avg_fpa_values),
    }


def _delete_sessions(table, session_ids):
    deleted = []
    for session_id in session_ids:
        normalized_id = str(session_id).strip()
        if not normalized_id:
            continue
        table.delete_item(Key={"session_id": normalized_id})
        deleted.append(normalized_id)
    return deleted


def session_admin_api_handler(event, context):
    _ = context
    method, path = _extract_method_path(event)
    if method != "DELETE" or not path.endswith("/session-summary"):
        return _response(404, {"error": "Not found"})

    try:
        body = _parse_request_json(event)
        session_ids = body.get("session_ids")
        if session_ids is None:
            single_id = body.get("session_id")
            session_ids = [single_id] if single_id else []
        if not isinstance(session_ids, list) or len(session_ids) == 0:
            raise ValueError('Provide "session_id" or "session_ids"')

        table = _get_table()
        deleted_ids = _delete_sessions(table, session_ids)
        if len(deleted_ids) == 0:
            raise ValueError("No valid session IDs were provided")

        remaining_items = table.scan().get("Items", [])
        aggregates = _recalculate_aggregates(remaining_items)
        return _response(
            200,
            {
                "deleted_session_ids": deleted_ids,
                "deleted_count": len(deleted_ids),
                "aggregates": aggregates,
            },
        )
    except Exception as exc:
        return _response(400, {"error": f"Invalid request: {str(exc)}"})
