exports.handler = async () => {
  const message = 'Hello from AWS Lambda via API Gateway (lkr-data)!';

  return {
    statusCode: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'access-control-allow-origin': '*',
    },
    body: JSON.stringify({ message }),
  };
};

