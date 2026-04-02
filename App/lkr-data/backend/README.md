# lkr-data backend (AWS SAM)

This is a minimal backend for the mobile app:

- API Gateway `POST /process`
- Lambda runs gait/FPA processing and exposes key summary updates
- Lambda is packaged as a container image so NumPy/SciPy/transforms3d work reliably

## Prereqs

- AWS account + credentials configured locally (e.g. `aws configure`)
- AWS SAM CLI installed

## Deploy

From `App/lkr-data/backend`:

```bash
sam build
sam deploy --guided
```

Notes:
- `sam deploy --guided` will ask for an ECR repo for the Lambda image.
- Container image build uses `backend/Dockerfile`.

After deploy, SAM prints an output named `ApiBaseUrl` like:

`https://abc123.execute-api.us-east-1.amazonaws.com/prod`

## Test

```bash
curl -X POST "$(sam list stack-outputs --stack-name <YOUR_STACK_NAME> --output json | jq -r '.[] | select(.OutputKey=="ApiBaseUrl") | .OutputValue')/process" \
  -H "content-type: application/json" \
  -d '{"session_id":"session-1","payload_b64":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA","rate_hz":180}'
```

Response includes:
- `key_summary_updated`: `true` when a new summary step is reached
- `key_summary`: latest summary payload (`step`, `fpa_deg`, `rate_hz`, `print_message`)

