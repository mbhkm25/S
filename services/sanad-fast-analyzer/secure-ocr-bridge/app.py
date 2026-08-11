import base64
import hashlib
import os
import time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
import httpx
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

MAX_BODY = int(os.getenv("SANAD_BRIDGE_MAX_BODY_BYTES", "12582912"))
UPSTREAM = os.getenv("SANAD_FAST_OCR_UPSTREAM", "http://sanad-fast-ocr:8092/v1/ocr")
UPSTREAM_TIMEOUT = max(5.0, float(os.getenv("SANAD_BRIDGE_UPSTREAM_TIMEOUT_SECONDS", "20")))
MAX_SKEW = int(os.getenv("SANAD_BRIDGE_MAX_SKEW_SECONDS", "90"))
PUBLIC_KEY_B64 = os.getenv("SANAD_BRIDGE_PUBLIC_KEY_B64", "").strip()
if not PUBLIC_KEY_B64:
    raise RuntimeError("SANAD_BRIDGE_PUBLIC_KEY_B64 is required")
PUBLIC_KEY = Ed25519PublicKey.from_public_bytes(base64.b64decode(PUBLIC_KEY_B64, validate=True))
app = FastAPI()

@app.get("/health/ready")
async def ready():
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            r = await client.get("http://sanad-fast-ocr:8092/health/ready")
        payload = {"ok": r.status_code == 200, "service": "sanad-secure-ocr-bridge", "scheme": "ed25519-sha256-v1", "upstream": r.status_code, "upstream_timeout_seconds": UPSTREAM_TIMEOUT}
        return JSONResponse(payload, status_code=200 if r.status_code == 200 else 503)
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
        PUBLIC_KEY.verify(base64.b64decode(sig_b64, validate=True), message)
    except Exception:
        return JSONResponse({"ok": False, "error": "unauthorized"}, status_code=401)
    content_type = request.headers.get("content-type", "application/octet-stream")
    try:
        async with httpx.AsyncClient(timeout=UPSTREAM_TIMEOUT) as client:
            upstream = await client.post(UPSTREAM, content=body, headers={"content-type": content_type})
        return Response(content=upstream.content, status_code=upstream.status_code, media_type=upstream.headers.get("content-type", "application/json"))
    except httpx.TimeoutException:
        return JSONResponse({"ok": False, "error": "upstream_timeout"}, status_code=504)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": "bridge_upstream_failed", "detail": type(exc).__name__}, status_code=502)
