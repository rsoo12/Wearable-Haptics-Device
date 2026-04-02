FROM public.ecr.aws/lambda/python:3.12

# Same scientific stack as Bluetooth/FPA_algorithm.py and Bluetooth/gaitphase.py (numpy, scipy, transforms3d).
COPY src/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY src/ ${LAMBDA_TASK_ROOT}/

CMD ["hello.handler"]
