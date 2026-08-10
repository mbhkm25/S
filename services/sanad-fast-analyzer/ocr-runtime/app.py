from __future__ import annotations

import asyncio
import os
import statistics
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from pydantic import BaseModel, Field

MAX_BODY_BYTES = int(os.getenv("SANAD_OCR_MAX_BODY_BYTES", str(12 * 1024 * 1024)))
CONCURRENCY = max(1, int(os.getenv("SANAD_OCR_CONCURRENCY", "1")))
CPU_THREADS = max(1, int(os.getenv("SANAD_OCR_CPU_THREADS", "4")))
LANG = os.getenv("SANAD_OCR_LANG", "ar")
OCR_VERSION = os.getenv("SANAD_OCR_VERSION", "PP-OCRv5")
ENGINE = os.getenv("SANAD_OCR_ENGINE", "paddle_static")
BEARER_TOKEN = os.getenv("SANAD_OCR_TOKEN", "").strip()
MIN_TEXT_SCORE = min(1.0, max(0.0, float(os.getenv("SANAD_OCR_MIN_TEXT_SCORE", "0.35"))))

SUPPORTED_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

app = FastAPI(title="SANAD Local OCR", version="0.1.0", docs_url=None, redoc_url=None)
_semaphore = asyncio.Semaphore(CONCURRENCY)
_ocr: Any | None = None
_model_error: str | None = None


class BBox(BaseModel):
    x: float
    y: float
    width: float
    height: float


class OcrBlock(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    page: int | None = None
    bbox: BBox | None = None


class OcrResponse(BaseModel):
    provider: str
    raw_text: str
    confidence: float = Field(ge=0.0, le=1.0)
    duration_ms: float
    blocks: list[OcrBlock]
    warnings: list[str]


def _load_model() -> Any:
    global _ocr, _model_error
    if _ocr is not None:
        return _ocr
    try:
        from paddleocr import PaddleOCR

        kwargs: dict[str, Any] = {
            "lang": LANG,
            "ocr_version": OCR_VERSION,
            "use_doc_orientation_classify": False,
            "use_doc_unwarping": False,
            "use_textline_orientation": False,
            "device": "cpu",
        }
        # PaddleOCR 3.5+ accepts explicit inference engines. Keep a compatibility
        # fallback so older 3.x builds still start instead of breaking the service.
        if ENGINE:
            kwargs["engine"] = ENGINE
            if ENGINE == "paddle_static":
                kwargs["engine_config"] = {
                    "device_type": "cpu",
                    "cpu_threads": CPU_THREADS,
                    "run_mode": "mkldnn",
                }
        try:
            _ocr = PaddleOCR(**kwargs)
        except TypeError:
            kwargs.pop("engine", None)
            kwargs.pop("engine_config", None)
            _ocr = PaddleOCR(**kwargs)
        _model_error = None
        return _ocr
    except Exception as exc:  # pragma: no cover - depends on runtime/model availability
        _model_error = f"{type(exc).__name__}: {exc}"
        raise


def _as_json(result: Any) -> dict[str, Any]:
    value = getattr(result, "json", None)
    if callable(value):
        value = value()
    if isinstance(value, dict):
        return value
    if isinstance(result, dict):
        return result
    raise RuntimeError("paddleocr_result_has_no_json_contract")


def _normalize_page(payload: dict[str, Any], page_index: int) -> tuple[list[OcrBlock], list[str]]:
    data = payload.get("res", payload)
    texts = list(data.get("rec_texts") or [])
    scores = list(data.get("rec_scores") or [])
    boxes = list(data.get("rec_boxes") or [])
    blocks: list[OcrBlock] = []
    warnings: list[str] = []

    if len(scores) != len(texts):
        warnings.append("ocr_text_score_length_mismatch")
    if boxes and len(boxes) != len(texts):
        warnings.append("ocr_text_box_length_mismatch")

    for index, raw_text in enumerate(texts):
        text = str(raw_text or "").strip()
        if not text:
            continue
        score = _finite_float(scores[index] if index < len(scores) else 0.0)
        score = min(1.0, max(0.0, score))
        if score < MIN_TEXT_SCORE:
            continue
        bbox = _bbox_from_box(boxes[index]) if index < len(boxes) else None
        blocks.append(OcrBlock(text=text, confidence=score, page=page_index, bbox=bbox))
    return blocks, warnings


def _bbox_from_box(raw: Any) -> BBox | None:
    try:
        values = list(raw)
        if len(values) != 4:
            return None
        x1, y1, x2, y2 = (_finite_float(v) for v in values)
        if x2 < x1 or y2 < y1:
            return None
        return BBox(x=x1, y=y1, width=x2 - x1, height=y2 - y1)
    except Exception:
        return None


def _finite_float(value: Any) -> float:
    try:
        parsed = float(value)
        if parsed == parsed and parsed not in (float("inf"), float("-inf")):
            return parsed
    except Exception:
        pass
    return 0.0


def _infer_sync(path: str) -> OcrResponse:
    started = time.perf_counter()
    model = _load_model()
    prediction = model.predict(path)
    all_blocks: list[OcrBlock] = []
    warnings: list[str] = []

    for page_index, result in enumerate(prediction):
        payload = _as_json(result)
        blocks, page_warnings = _normalize_page(payload, page_index)
        all_blocks.extend(blocks)
        warnings.extend(page_warnings)

    # Reading order supplied by PaddleOCR is preserved. This matters for existing
    # deterministic SANAD parsers, particularly RTL notices with labels and values.
    raw_text = "\n".join(block.text for block in all_blocks)
    scores = [block.confidence for block in all_blocks]
    confidence = statistics.fmean(scores) if scores else 0.0
    if not all_blocks:
        warnings.append("ocr_returned_no_text")

    return OcrResponse(
        provider=f"paddleocr:{OCR_VERSION}:{LANG}:{ENGINE or 'default'}",
        raw_text=raw_text,
        confidence=min(1.0, max(0.0, confidence)),
        duration_ms=round((time.perf_counter() - started) * 1000, 3),
        blocks=all_blocks,
        warnings=sorted(set(warnings)),
    )


def _authorize(authorization: str | None) -> None:
    if not BEARER_TOKEN:
        return
    if authorization != f"Bearer {BEARER_TOKEN}":
        raise HTTPException(status_code=401, detail="unauthorized")


@app.on_event("startup")
async def warm_model() -> None:
    # Warm once at startup so first customer request does not pay model load latency.
    try:
        await asyncio.to_thread(_load_model)
    except Exception:
        # Readiness will expose failure. Keep the process alive for observability and
        # container restart policies rather than crashing without diagnostics.
        pass


@app.get("/health/live")
async def live() -> dict[str, Any]:
    return {"ok": True, "service": "sanad-local-ocr"}


@app.get("/health/ready")
async def ready() -> dict[str, Any]:
    return {
        "ok": _ocr is not None and _model_error is None,
        "model_loaded": _ocr is not None,
        "model_error": _model_error,
        "ocr_version": OCR_VERSION,
        "lang": LANG,
        "engine": ENGINE,
        "cpu_threads": CPU_THREADS,
        "concurrency": CONCURRENCY,
    }


@app.post("/v1/ocr", response_model=OcrResponse)
async def ocr(
    request: Request,
    authorization: str | None = Header(default=None),
) -> OcrResponse:
    _authorize(authorization)
    content_type = (request.headers.get("content-type") or "").split(";", 1)[0].strip().lower()
    suffix = SUPPORTED_TYPES.get(content_type)
    if suffix is None:
        raise HTTPException(status_code=415, detail="unsupported_media_type")

    content_length = request.headers.get("content-length")
    if content_length and content_length.isdigit() and int(content_length) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="document_too_large")

    body = await request.body()
    if not body:
        raise HTTPException(status_code=400, detail="empty_document")
    if len(body) > MAX_BODY_BYTES:
        raise HTTPException(status_code=413, detail="document_too_large")

    async with _semaphore:
        with tempfile.NamedTemporaryFile(prefix="sanad-ocr-", suffix=suffix, delete=False) as handle:
            handle.write(body)
            path = handle.name
        try:
            return await asyncio.to_thread(_infer_sync, path)
        except Exception as exc:
            raise HTTPException(status_code=503, detail=f"ocr_inference_failed:{type(exc).__name__}") from exc
        finally:
            Path(path).unlink(missing_ok=True)
