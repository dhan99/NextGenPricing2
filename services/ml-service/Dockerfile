FROM python:3.12-slim

WORKDIR /app

# Install deps separately so the layer is cached when only app.py changes
COPY requirements.txt /app/
RUN pip install --no-cache-dir -r requirements.txt

COPY app.py /app/

ENV ML_MODE=heuristic
EXPOSE 8000

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
