import csv
import json
import math
import os
from datetime import datetime, timezone
from decimal import Decimal
from io import StringIO

import boto3

_dynamodb = boto3.resource("dynamodb")


def _get_table():
    table_name = os.environ.get("SESSION_TABLE_NAME")
    if not table_name:
        raise RuntimeError("Missing SESSION_TABLE_NAME")
    return _dynamodb.Table(table_name)


def _response(status_code, body):
    def _json_default(value):
        if isinstance(value, Decimal):
            # Preserve integers in JSON when possible.
            if value == value.to_integral_value():
                return int(value)
            return float(value)
        raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")

    return {
        "statusCode": status_code,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
        },
        "body": json.dumps(body, default=_json_default),
    }


def _get_method_and_path(event):
    method = event.get("httpMethod")
    path = event.get("path")
    request_context_http = ((event.get("requestContext") or {}).get("http") or {})
    method = request_context_http.get("method", method)
    path = event.get("rawPath", path)
    if not method:
        method = "POST"
    if not path:
        path = "/session-summary"
    return method.upper(), path


def _parse_request_json(event):
    raw_body = event.get("body") or "{}"
    if isinstance(raw_body, str):
        return json.loads(raw_body)
    return raw_body


def _safe_iso(ts):
    try:
        return datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(
            timezone.utc
        )
    except Exception:
        return None


def _extract_fpa_values_from_csv(csv_data):
    reader = csv.DictReader(StringIO(csv_data))
    values = []
    max_step = 0
    for row in reader:
        if not row:
            continue
        fpa_raw = (row.get("fpa_deg") or "").strip()
        step_raw = (row.get("step_num") or "").strip()
        if not fpa_raw:
            continue
        values.append(float(fpa_raw))
        if step_raw:
            try:
                max_step = max(max_step, int(float(step_raw)))
            except Exception:
                pass
    return values, max_step


def _create_session_summary(body):
    session_id = str(body.get("session_id", "")).strip()
    started_at = str(body.get("started_at", "")).strip()
    ended_at = str(body.get("ended_at", "")).strip()
    csv_data = body.get("csv_data")

    if not session_id:
        raise ValueError('Missing "session_id"')
    if not isinstance(csv_data, str) or not csv_data.strip():
        raise ValueError('Missing "csv_data"')
    fpa_values, max_step = _extract_fpa_values_from_csv(csv_data)
    if len(fpa_values) == 0:
        raise ValueError('CSV has no valid "fpa_deg" values')
    started_dt = _safe_iso(started_at)
    ended_dt = _safe_iso(ended_at)
    if started_dt is None or ended_dt is None:
        raise ValueError('Invalid "started_at" or "ended_at"')

    duration_sec = max(0, int((ended_dt - started_dt).total_seconds()))
    avg_fpa = sum(fpa_values) / len(fpa_values)
    variance = sum((value - avg_fpa) ** 2 for value in fpa_values) / len(fpa_values)
    summary = {
        "session_id": session_id,
        "started_at": started_dt.isoformat(),
        "ended_at": ended_dt.isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "duration_sec": duration_sec,
        "step_count": max(max_step, len(fpa_values)),
        # DynamoDB requires Decimal for non-integer numeric values.
        "avg_fpa_deg": Decimal(f"{avg_fpa:.3f}"),
        "min_fpa_deg": Decimal(f"{min(fpa_values):.3f}"),
        "max_fpa_deg": Decimal(f"{max(fpa_values):.3f}"),
        "variability_deg": Decimal(f"{math.sqrt(variance):.3f}"),
    }
    table = _get_table()
    table.put_item(Item=summary)
    return summary


def _list_session_summaries():
    table = _get_table()
    items = table.scan().get("Items", [])
    items.sort(key=lambda item: item.get("started_at", ""), reverse=True)
    return items


def session_summary_api_handler(event, context):
    _ = context
    method, path = _get_method_and_path(event)

    if method == "POST" and path.endswith("/session-summary"):
        try:
            body = _parse_request_json(event)
            summary = _create_session_summary(body)
            return _response(200, summary)
        except Exception as exc:
            return _response(400, {"error": f"Invalid request: {str(exc)}"})

    if method == "GET" and path.endswith("/session-summaries"):
        try:
            return _response(200, {"items": _list_session_summaries()})
        except Exception as exc:
            return _response(500, {"error": f"Failed to fetch summaries: {str(exc)}"})

    return _response(404, {"error": "Not found"})
