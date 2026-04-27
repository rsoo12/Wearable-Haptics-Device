FROM public.ecr.aws/lambda/python:3.12

# Retained for optional container packaging; current SAM template uses zip deployment.
COPY src/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY src/ ${LAMBDA_TASK_ROOT}/

CMD ["session_summary_api.session_summary_api_handler"]
