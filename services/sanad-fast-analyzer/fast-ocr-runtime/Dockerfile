FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       curl poppler-utils tesseract-ocr tesseract-ocr-ara tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip \
    && python -m pip install -r requirements.txt
COPY app.py ./app.py

RUN useradd --system --create-home --uid 10002 sanadfast
USER sanadfast

EXPOSE 8092
HEALTHCHECK --interval=20s --timeout=4s --start-period=10s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8092/health/ready || exit 1

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8092", "--workers", "1", "--no-access-log"]
