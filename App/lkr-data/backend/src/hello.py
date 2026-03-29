import json


def handler(event, context):
    message = "Hello from AWS Lambda via API Gateway (lkr-data)!"

    return {
        "statusCode": 200,
        "headers": {
            "content-type": "application/json; charset=utf-8",
            "access-control-allow-origin": "*",
        },
        "body": json.dumps({"message": message}),
    }
