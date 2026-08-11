FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY requirements.txt ./requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r requirements.txt
COPY app.py ./app.py
RUN useradd --system --create-home --uid 10003 sanadbridge
USER sanadbridge
EXPOSE 8443
HEALTHCHECK --interval=20s --timeout=4s --start-period=10s --retries=3 CMD curl --fail --silent --cacert /etc/letsencrypt/live/sanadflow.com/fullchain.pem https://127.0.0.1:8443/health/ready || exit 1
CMD ["uvicorn","app:app","--host","0.0.0.0","--port","8443","--workers","1","--no-access-log","--ssl-keyfile","/etc/letsencrypt/live/sanadflow.com/privkey.pem","--ssl-certfile","/etc/letsencrypt/live/sanadflow.com/fullchain.pem"]
