# lkr-data backend (AWS SAM)

This is a minimal backend for the mobile app:

- API Gateway `GET /hello`
- Lambda returns JSON `{ "message": "..." }`

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

## Test

```bash
curl "$(sam list stack-outputs --stack-name <YOUR_STACK_NAME> --output json | jq -r '.[] | select(.OutputKey=="ApiBaseUrl") | .OutputValue')/hello"
```

