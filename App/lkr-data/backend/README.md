# lkr-data backend (AWS SAM)

This is the backend for the mobile app:

- API Gateway `POST /session-summary` to calculate session statistics and save one DynamoDB item
- API Gateway `GET /session-summaries` to return saved session cards for app history
- Lambda is zip-deployed (no additional Python libraries required)

## Prereqs

- AWS account + credentials configured locally (e.g. `aws configure`)
- AWS SAM CLI installed

## Deploy

From `App/lkr-data/backend`:

```bash
sam build
sam deploy --guided
```

After deploy, SAM prints an output named `ApiBaseUrl` like:

`https://abc123.execute-api.us-east-1.amazonaws.com/prod`

## Endpoints

Save one finished session (Lambda computes stats + writes DynamoDB):

```bash
curl -X POST "<API_BASE_URL>/session-summary" \
  -H "content-type: application/json" \
  -d '{
    "session_id":"session-1714262229123",
    "started_at":"2026-04-26T18:12:12.123Z",
    "ended_at":"2026-04-26T18:24:12.123Z",
    "csv_data":"time_iso,step_num,rate_hz,fpa_deg,fpa_minus_base_deg,drv,effect,sent_cmd,ax_m_s2,ay_m_s2,az_m_s2,gx_deg_s,gy_deg_s,gz_deg_s\n2026-04-26T18:12:13.100Z,1,174.2,6.1,0.3,,,,0,0,0,0,0,0\n2026-04-26T18:12:13.600Z,2,177.9,6.4,0.6,,,,0,0,0,0,0,0\n"
  }'
```

Load all summaries for History tab:

```bash
curl "<API_BASE_URL>/session-summaries"
```

Delete session(s) and return recalculated aggregate stats:

```bash
curl -X DELETE "<API_BASE_URL>/session-summary" \
  -H "content-type: application/json" \
  -d '{"session_id":"session-1714262229123"}'
```

You can also pass a list:

```bash
curl -X DELETE "<API_BASE_URL>/session-summary" \
  -H "content-type: application/json" \
  -d '{"session_ids":["session-a","session-b"]}'
```

