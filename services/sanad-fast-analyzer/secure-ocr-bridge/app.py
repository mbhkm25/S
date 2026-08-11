import base64
import hashlib
import os
import time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
import httpx
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

PUBLIC_KEY_PEM = b"""-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAuniinHe8pnXaKOPQtV9uMR8n7S9BVnux0raa+WHU7xQ=
-----END PUBLIC KEY-----
"""
PUBLIC_KEY: Ed25519PublicKey = serialization.load_pem_public_key(PUBLIC_KEY_PEM)
MAX_BODY = int(os.getenv("SANAD_BRIDGE_MAX_BODY_BYTES", "12582912"))
UPSTREAM = os.getenv("SANAD_FAST_OCR_UPSTREAM", "http://sanad-fast-ocr:8092/v1/ocr")
MAX_SKEW = int(os.getenv("SANAD_BRIDGE_MAX_SKEW_SECONDS", "90"))
app = FastAPI()

@app.get("/health/ready")
async def ready():
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get("http://sanad-fast-ocr:8092/health/ready")
        return JSONResponse({"ok": r.status_code == 200, "service": "sanad-secure-ocr-bridge", "upstream": r.status_code}, status_code=200 if r.status_code == 200 else 503)
    except Exception as exc:
        return JSONResponse({"ok": False, "service": "sanad-secure-ocr-bridge", "error": type(exc).__name__}, status_code=503)

@app.post("/v1/ocr")
async def ocr(request: Request):
    body = await request.body()
    if not body:
        return JSONResponse({"ok": False, "error": "empty_body"}, status_code=400)
    if len(body) > MAX_BODY:
        return JSONResponse({"ok": False, "error": "body_too_large"}, status_code=413)
    ts = request.headers.get("x-sanad-timestamp", "")
    sig_b64 = request.headers.get("x-sanad-signature", "")
    try:
        ts_i = int(ts)
        if abs(int(time.time()) - ts_i) > MAX_SKEW:
            raise ValueError("timestamp_out_of_window")
        digest = hashlib.sha256(body).hexdigest()
        message = f"{ts}\n{digest}".encode("utf-8")
        signature = base64.b64decode(sig_b64, validate=True)
        PUBLIC_KEY.verify(signature, message)
    except Exception:
        return JSONResponse({"ok": False, "error": "unauthorized"}, status_code=401)
    content_type = request.headers.get("content-type", "application/octet-stream")
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            upstream = await client.post(UPSTREAM, content=body, headers={"content-type": content_type})
        return Response(content=upstream.content, status_code=upstream.status_code, media_type=upstream.headers.get("content-type", "application/json"))
    except httpx.TimeoutException:
        return JSONResponse({"ok": False, "error": "upstream_timeout"}, status_code=504)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": "bridge_upstream_failed", "detail": type(exc).__name__}, status_code=502)
