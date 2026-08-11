import hashlib
import os
import time
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
import httpx

MAX_BODY = int(os.getenv("SANAD_BRIDGE_MAX_BODY_BYTES", "12582912"))
UPSTREAM = os.getenv("SANAD_FAST_OCR_UPSTREAM", "http://sanad-fast-ocr:8092/v1/ocr")
SUPABASE_URL = os.getenv("SANAD_SUPABASE_URL", "https://hudbzlgclghlhazlduas.supabase.co")
CACHE_TTL = int(os.getenv("SANAD_BRIDGE_AUTH_CACHE_SECONDS", "300"))
_validated = {}
app = FastAPI()

async def validate_service_role(token: str) -> bool:
    if not token:
        return False
    digest = hashlib.sha256(token.encode("utf-8")).hexdigest()
    now = time.time()
    if _validated.get(digest, 0) > now:
        return True
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.get(
                f"{SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1",
                headers={"apikey": token, "authorization": f"Bearer {token}"},
            )
        if r.status_code != 200:
            return False
        _validated.clear()
        _validated[digest] = now + CACHE_TTL
        return True
    except Exception:
        return False

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
    auth = request.headers.get("authorization", "")
    token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
    if not await validate_service_role(token):
        return JSONResponse({"ok": False, "error": "unauthorized"}, status_code=401)
    body = await request.body()
    if not body:
        return JSONResponse({"ok": False, "error": "empty_body"}, status_code=400)
    if len(body) > MAX_BODY:
        return JSONResponse({"ok": False, "error": "body_too_large"}, status_code=413)
    content_type = request.headers.get("content-type", "application/octet-stream")
    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            upstream = await client.post(UPSTREAM, content=body, headers={"content-type": content_type})
        return Response(content=upstream.content, status_code=upstream.status_code, media_type=upstream.headers.get("content-type", "application/json"))
    except httpx.TimeoutException:
        return JSONResponse({"ok": False, "error": "upstream_timeout"}, status_code=504)
    except Exception as exc:
        return JSONResponse({"ok": False, "error": "bridge_upstream_failed", "detail": type(exc).__name__}, status_code=502)
